import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import {
    assertApplicationTablesEmpty,
    emptyTargetSql,
    parseApplicationTableCounts
} from '../../scripts/db/d1-import-target';
import { prepareMongoImport } from '../../scripts/db/mongo-import';
import {
    aggregateSql,
    compareWithReport,
    foreignKeyCheckSql,
    parseObservedAggregates,
    parseReleaseVersions,
    releaseVersionSql,
    type ObservedState
} from '../../scripts/db/reconcile-import';
import {
    createRealisticMongoExport,
    createSyntheticMongoExport,
    multilineDescription,
    realisticShape,
    trickyTitle,
    writeSyntheticMongoExport,
    type SyntheticMongoExport
} from '../fixtures/mongo/synthetic-export';
import { countRows, createD1Harness, type D1Harness } from './d1-harness';

const splitImportStatements = (sql: string) => {
    return sql
        .split(/\n\n(?=(?:PRAGMA|INSERT INTO) )/)
        .map(statement => statement.trim())
        .filter(statement => statement.length > 0);
};

describe('Mongo import SQL on D1', () => {
    let harness: D1Harness;
    let workDirectory: string;

    const prepareImport = async (
        name: string,
        mongoExport: SyntheticMongoExport
    ) => {
        const sourceDirectory = path.join(workDirectory, `${name}-source`);

        writeSyntheticMongoExport(sourceDirectory, mongoExport);

        const report = await prepareMongoImport({
            source: { kind: 'directory', directory: sourceDirectory },
            outputDirectory: path.join(workDirectory, `${name}-output`)
        });
        const statements = splitImportStatements(
            fs.readFileSync(report.outputSqlPath, 'utf8')
        );

        return {
            report,
            statements,
            run: () => {
                return harness.env.DB.batch(
                    statements.map(statement => {
                        return harness.env.DB.prepare(statement);
                    })
                );
            }
        };
    };
    const observeDatabase = async (): Promise<ObservedState> => {
        const { DB } = harness.env;
        const aggregates = await DB.prepare(aggregateSql).all();
        const releaseVersions = await DB.prepare(releaseVersionSql).all();
        const violations = await DB.prepare(foreignKeyCheckSql).all();

        return {
            aggregates: parseObservedAggregates(
                aggregates.results as Record<string, unknown>[]
            ),
            releaseVersions: parseReleaseVersions(
                releaseVersions.results as Record<string, unknown>[]
            ),
            foreignKeyViolations: violations.results.length
        };
    };
    const readPreflightCounts = async () => {
        const row = await harness.env.DB.prepare(emptyTargetSql).first();

        return parseApplicationTableCounts(
            JSON.stringify([{ success: true, results: [row] }])
        );
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
        workDirectory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'wishlist-d1-import-')
        );
    });

    after(async () => {
        await harness.dispose();
        fs.rmSync(workDirectory, { recursive: true, force: true });
    });

    beforeEach(async () => {
        await harness.clearApplicationTables();
    });

    describe('synthetic export', () => {
        let imported: Awaited<ReturnType<typeof prepareImport>>;

        before(async () => {
            imported = await prepareImport(
                'synthetic',
                createSyntheticMongoExport()
            );
        });

        it('splits the generated SQL into a pragma and insert statements only', () => {
            assert.ok(imported.statements.length > 4);
            assert.ok(
                imported.statements.every(statement => {
                    return /^(PRAGMA|INSERT INTO)/.test(statement);
                })
            );
        });

        it('imports rows, orphans, quirky values and keeps FK integrity', async () => {
            await imported.run();

            assert.equal(await countRows(harness, 'users'), 24);
            assert.equal(await countRows(harness, 'wishes'), 72);
            assert.equal(await countRows(harness, 'gives'), 4);

            const orphans = await harness.env.DB.prepare(
                'SELECT count(*) AS total FROM wishes WHERE user_id IS NULL'
            ).first<{ total: number }>();
            const foreignKeyViolations =
                await harness.env.DB.prepare(foreignKeyCheckSql).all();
            const tricky = await harness.env.DB.prepare(
                'SELECT title FROM wishes WHERE title LIKE ?'
            )
                .bind('O%Brien%')
                .first<{ title: string }>();
            const multiline = await harness.env.DB.prepare(
                'SELECT description FROM wishes WHERE description = ?'
            )
                .bind(multilineDescription)
                .first<{ description: string }>();
            const longTitle = await harness.env.DB.prepare(
                'SELECT max(length(title)) AS longest FROM wishes'
            ).first<{ longest: number }>();
            const floatUser = await harness.env.DB.prepare(
                'SELECT telegram_id AS telegramId, typeof(telegram_id) AS kind FROM users WHERE telegram_id = 5733470387'
            ).first<{ telegramId: number; kind: string }>();

            assert.equal(orphans?.total, 6);
            assert.equal(foreignKeyViolations.results.length, 0);
            assert.equal(tricky?.title, trickyTitle);
            assert.equal(multiline?.description, multilineDescription);
            assert.equal(longTitle?.longest, 638);
            assert.deepEqual(floatUser, {
                telegramId: 5_733_470_387,
                kind: 'integer'
            });
        });

        it('applies defaults, auto language and searchability to imported users', async () => {
            await imported.run();

            const users = await harness.env.DB.prepare(
                `SELECT count(*) AS total,
                    sum(language IS NULL) AS auto,
                    sum(currency = 'UAH') AS uah,
                    sum(release_version = '0.0.0') AS unversioned,
                    sum(username_searchable) AS searchable,
                    sum(blocked_at IS NULL) AS unblocked
                FROM users`
            ).first<Record<string, number>>();
            const emptyStrings = await harness.env.DB.prepare(
                "SELECT count(*) AS total FROM users WHERE payments = '' OR telegraph_access_token = '' OR username = '' OR phone = ''"
            ).first<{ total: number }>();

            assert.equal(users?.total, 24);
            assert.equal(users?.auto, 24);
            assert.equal(users?.uah, 24);
            assert.equal(users?.unversioned, 6);
            assert.equal(users?.searchable, 16);
            assert.equal(users?.unblocked, 24);
            assert.equal(emptyStrings?.total, 0);
        });

        it('lets repositories use imported rows and continue ids after the import', async () => {
            await imported.run();

            const { users, wishes } = harness.repositories;
            const byUsername = await Effect.runPromise(
                users.findSearchable({ username: 'FAKE_USER_01' })
            );
            const byPhone = await Effect.runPromise(
                users.findSearchable({ phoneDigits: '380990000002' })
            );
            const created = await Effect.runPromise(
                users.create({ telegramId: 42 })
            );
            const createdWish = await Effect.runPromise(
                wishes.create(created!.id, 'after import', new Date())
            );

            assert.equal(byUsername?.telegramId, 7_000_001);
            assert.equal(byPhone?.telegramId, 7_000_002);
            assert.equal(created?.id, 25);
            assert.equal(createdWish?.id, 73);
        });

        it('rejects a rerun through the empty-target preflight and the UNIQUE constraints', async () => {
            assertApplicationTablesEmpty(await readPreflightCounts());

            await imported.run();

            const populatedCounts = await readPreflightCounts();
            const priceSumBefore = await harness.env.DB.prepare(
                'SELECT sum(price) AS total FROM wishes'
            ).first<{ total: number }>();

            assert.throws(() => {
                assertApplicationTablesEmpty(populatedCounts);
            }, /D1 import target is not empty: users=24, wishes=72, gives=4/);
            await assert.rejects(imported.run(), /UNIQUE/);

            assert.equal(await countRows(harness, 'users'), 24);
            assert.equal(await countRows(harness, 'wishes'), 72);
            assert.equal(await countRows(harness, 'gives'), 4);
            assert.deepEqual(
                await harness.env.DB.prepare(
                    'SELECT sum(price) AS total FROM wishes'
                ).first(),
                priceSumBefore
            );
        });

        it('reconciles the imported database with the report', async () => {
            await imported.run();

            assert.deepEqual(
                compareWithReport(imported.report, await observeDatabase()),
                []
            );
        });
    });

    describe('export shaped like the production snapshot', () => {
        let imported: Awaited<ReturnType<typeof prepareImport>>;

        before(async () => {
            imported = await prepareImport(
                'realistic',
                createRealisticMongoExport()
            );
        });

        it('imports 299 users, 1202 wishes with 163 orphans and 18 of 19 gives', async () => {
            await imported.run();

            assert.deepEqual(imported.report.transformedCounts, {
                users: realisticShape.users,
                wishes: realisticShape.wishes,
                gives: realisticShape.gives - realisticShape.giveWithMissingWish
            });
            assert.equal(imported.report.orphanWishes.count, 163);
            assert.deepEqual(
                imported.report.skipped.gives.map(give => give.reason),
                ['missingWish']
            );
            assert.equal(await countRows(harness, 'users'), 299);
            assert.equal(await countRows(harness, 'wishes'), 1202);
            assert.equal(await countRows(harness, 'gives'), 18);

            const floatIds = await harness.env.DB.prepare(
                'SELECT count(*) AS total FROM users WHERE telegram_id >= 5000000000'
            ).first<{ total: number }>();

            assert.equal(floatIds?.total, realisticShape.floatTelegramIds);
        });

        it('passes reconciliation and detects tampering', async () => {
            await imported.run();

            assert.deepEqual(
                compareWithReport(imported.report, await observeDatabase()),
                []
            );

            await harness.env.DB.batch([
                harness.env.DB.prepare('DELETE FROM gives WHERE id = 1'),
                harness.env.DB.prepare(
                    'UPDATE wishes SET price = price + 1 WHERE id = 2'
                ),
                harness.env.DB.prepare(
                    "UPDATE users SET release_version = '2.0.0' WHERE id = 1"
                )
            ]);

            const mismatches = compareWithReport(
                imported.report,
                await observeDatabase()
            );

            assert.ok(mismatches.some(line => line.startsWith('gives:')));
            assert.ok(mismatches.some(line => line.startsWith('priceSum:')));
            assert.ok(
                mismatches.some(line => line.startsWith('releaseVersion 2.0.0'))
            );
        });

        it('reports orphan wishes as a mismatch when an owner reappears', async () => {
            await imported.run();
            await harness.env.DB.prepare(
                'UPDATE wishes SET user_id = 1 WHERE user_id IS NULL AND id = (SELECT min(id) FROM wishes WHERE user_id IS NULL)'
            ).run();

            const mismatches = compareWithReport(
                imported.report,
                await observeDatabase()
            );

            assert.deepEqual(mismatches, [
                'wishesWithoutUser: expected 163, got 162'
            ]);
        });
    });
});
