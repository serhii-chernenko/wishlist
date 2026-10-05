import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
    buildMigrationHashesSql,
    migrationsTableName
} from '../../scripts/db/copy-production-to-preview';
import { countRows, createD1Harness, type D1Harness } from './d1-harness';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const committedMigrationCount = fs
    .readdirSync(migrationsFolder, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).length;

interface SchemaObject {
    type: string;
    name: string;
    sql: string | null;
}

const insertUser = (
    harness: D1Harness,
    telegramId: number,
    username?: string
) => {
    return harness.env.DB.prepare(
        'INSERT INTO users (telegram_id, username, created_at, updated_at) VALUES (?, ?, 0, 0)'
    )
        .bind(telegramId, username ?? null)
        .run();
};

describe('D1 migrations', () => {
    let harness: D1Harness;

    before(async () => {
        harness = await createD1Harness();
    });

    after(async () => {
        await harness.dispose();
    });

    it('applies from an empty database and creates the expected schema', async () => {
        await harness.applyMigrations();

        const { results } = await harness.env.DB.prepare(
            'SELECT type, name, sql FROM sqlite_master'
        ).all<SchemaObject>();
        const findObject = (name: string) => {
            return results.find(object => object.name === name);
        };

        for (const tableName of [
            'users',
            'wishes',
            'gives',
            'sessions',
            'telegram_updates',
            'release_announcements',
            'wishlist_shares',
            'exchange_rates',
            'list_imports'
        ]) {
            assert.equal(findObject(tableName)?.type, 'table', tableName);
        }

        for (const indexName of [
            'users_mongo_id_unique',
            'users_telegram_id_unique',
            'users_phone_unique',
            'users_username_lower_unique',
            'wishes_mongo_id_unique',
            'gives_user_wish_unique',
            'telegram_updates_bot_update_unique',
            'release_announcements_version_user_unique',
            'wishlist_shares_public_id_unique',
            'wishes_owner_source_ref_unique',
            'list_imports_one_active'
        ]) {
            assert.match(findObject(indexName)?.sql ?? '', /UNIQUE INDEX/);
        }

        for (const indexName of [
            'users_phone_digits_index',
            'users_release_index',
            'wishes_owner_list_index',
            'wishes_share_fingerprint_index',
            'wishes_done_index',
            'wishes_owner_priority_level_index',
            'gives_wish_index',
            'sessions_updated_at_index',
            'release_announcements_user_id_index',
            'wishes_pending_photo_index',
            'list_imports_user_state_index'
        ]) {
            assert.equal(findObject(indexName)?.type, 'index', indexName);
        }

        assert.match(
            findObject('users_username_lower_unique')?.sql ?? '',
            /lower\("username"\)/
        );
        assert.match(
            findObject('wishes')?.sql ?? '',
            /json_valid\("images"\) and json_array_length\("images"\) <= 9/
        );
        assert.match(findObject('wishes')?.sql ?? '', /ON DELETE SET NULL/);
        assert.match(findObject('gives')?.sql ?? '', /ON DELETE CASCADE/);
        assert.match(
            findObject('list_imports')?.sql ?? '',
            /ON DELETE CASCADE/
        );

        for (const partialIndexName of [
            'wishes_owner_source_ref_unique',
            'wishes_pending_photo_index',
            'list_imports_one_active'
        ]) {
            assert.match(
                findObject(partialIndexName)?.sql ?? '',
                /\sWHERE\s/,
                partialIndexName
            );
        }
    });

    it('is a no-op when applied a second time', async () => {
        await harness.applyMigrations();
        const appliedBefore = await countRows(harness, '__drizzle_migrations');

        await harness.applyMigrations();

        assert.equal(appliedBefore, committedMigrationCount);
        assert.equal(
            await countRows(harness, '__drizzle_migrations'),
            appliedBefore
        );
    });

    it('records applied migrations where the production copy script reads them', async () => {
        await harness.applyMigrations();

        const table = await harness.env.DB.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
        )
            .bind(migrationsTableName)
            .first<{ name: string }>();
        const { results: columns } = await harness.env.DB.prepare(
            `PRAGMA table_info("${migrationsTableName}")`
        ).all<{ name: string }>();
        const { results: hashes } = await harness.env.DB.prepare(
            buildMigrationHashesSql()
        ).all<{ hash: string }>();

        assert.equal(table?.name, migrationsTableName);
        assert.ok(columns.some(column => column.name === 'hash'));
        assert.ok(columns.some(column => column.name === 'id'));
        assert.equal(hashes.length, committedMigrationCount);
        assert.ok(hashes.every(row => row.hash.length > 0));
    });

    describe('constraints', () => {
        beforeEach(async () => {
            await harness.clearApplicationTables();
        });

        it('rejects duplicate telegram ids, phones, case-variant usernames and ledger keys', async () => {
            const { DB } = harness.env;

            await DB.batch([
                DB.prepare(
                    "INSERT INTO users (telegram_id, username, phone, created_at, updated_at) VALUES (1, 'Alice', '+380000000001', 0, 0)"
                ),
                DB.prepare(
                    "INSERT INTO telegram_updates (bot_key, update_id, status, lease_id, started_at) VALUES ('b', 1, 'processing', 'l', 0)"
                )
            ]);

            await assert.rejects(insertUser(harness, 1), /UNIQUE/);
            await assert.rejects(insertUser(harness, 2, 'aLiCe'), /UNIQUE/);
            await assert.rejects(
                DB.prepare(
                    "INSERT INTO users (telegram_id, phone, created_at, updated_at) VALUES (3, '+380000000001', 0, 0)"
                ).run(),
                /UNIQUE/
            );
            await assert.rejects(
                DB.prepare(
                    "INSERT INTO telegram_updates (bot_key, update_id, status, lease_id, started_at) VALUES ('b', 1, 'processing', 'other', 0)"
                ).run(),
                /UNIQUE/
            );

            await insertUser(harness, 4);
            await insertUser(harness, 5);
            assert.equal(await countRows(harness, 'users'), 3);
        });

        it('rejects invalid enums, filters, prices and image payloads', async () => {
            const { DB } = harness.env;

            await insertUser(harness, 1);

            await assert.rejects(
                DB.prepare(
                    "INSERT INTO telegram_updates (bot_key, update_id, status, lease_id, started_at) VALUES ('b', 2, 'bogus', 'l', 0)"
                ).run(),
                /CHECK/
            );
            await assert.rejects(
                DB.prepare(
                    "INSERT INTO users (telegram_id, language, created_at, updated_at) VALUES (9, 'ru', 0, 0)"
                ).run(),
                /CHECK/
            );
            await assert.rejects(
                DB.prepare(
                    'INSERT INTO users (telegram_id, wishlist_filter, created_at, updated_at) VALUES (9, 5, 0, 0)'
                ).run(),
                /CHECK/
            );
            await assert.rejects(
                DB.prepare(
                    "INSERT INTO sessions (telegram_user_id, language, updated_at) VALUES (1, 'xx', 0)"
                ).run(),
                /CHECK/
            );
            await assert.rejects(
                DB.prepare(
                    "INSERT INTO wishes (user_id, title, price, created_at, updated_at) VALUES (1, 'a', -1, 0, 0)"
                ).run(),
                /CHECK/
            );
            await assert.rejects(
                DB.prepare(
                    "INSERT INTO wishes (user_id, title, images, created_at, updated_at) VALUES (1, 'a', 'not json', 0, 0)"
                ).run(),
                /CHECK|malformed/
            );
            await assert.rejects(
                DB.prepare(
                    "INSERT INTO wishes (user_id, title, images, created_at, updated_at) VALUES (1, 'a', '[1,2,3,4,5,6,7,8,9,10]', 0, 0)"
                ).run(),
                /CHECK/
            );
        });

        it('enforces the partial unique indexes of the list import', async () => {
            const { DB } = harness.env;

            await DB.prepare(
                'INSERT INTO users (telegram_id, created_at, updated_at) VALUES (1, 0, 0), (2, 0, 0)'
            ).run();

            const { results: userRows } = await DB.prepare(
                'SELECT id FROM users ORDER BY telegram_id'
            ).all<{ id: number }>();
            const [first, second] = userRows.map(row => row.id);
            const insertWish = (userId: number, sourceRef: string | null) => {
                return DB.prepare(
                    'INSERT INTO wishes (user_id, title, source_ref, created_at, updated_at) VALUES (?, ?, ?, 0, 0)'
                )
                    .bind(userId, 'wish', sourceRef)
                    .run();
            };
            const insertJob = (userId: number, state: string) => {
                return DB.prepare(
                    "INSERT INTO list_imports (user_id, source, kind, channel, state, visibility, created_at, updated_at) VALUES (?, 'rewish', 'wishes', 'bot', ?, 'hidden', 0, 0)"
                )
                    .bind(userId, state)
                    .run();
            };

            await insertWish(first!, 'rewish:wish:1');
            await insertWish(second!, 'rewish:wish:1');
            await insertWish(first!, null);
            await insertWish(first!, null);
            await assert.rejects(insertWish(first!, 'rewish:wish:1'), /UNIQUE/);

            await insertJob(first!, 'committing');
            await insertJob(first!, 'done');
            await insertJob(first!, 'done');
            await insertJob(second!, 'committing');
            await assert.rejects(insertJob(first!, 'committing'), /UNIQUE/);
            await assert.rejects(insertJob(first!, 'bogus'), /CHECK/);

            await DB.prepare('DELETE FROM users WHERE id = ?')
                .bind(first)
                .run();
            assert.equal(await countRows(harness, 'list_imports'), 1);
        });

        it('sets wish owners to NULL, cascades gives and rejects dangling references', async () => {
            const { DB } = harness.env;

            await DB.prepare(
                'INSERT INTO users (telegram_id, created_at, updated_at) VALUES (1, 0, 0), (2, 0, 0)'
            ).run();

            const { results: userRows } = await DB.prepare(
                'SELECT id FROM users ORDER BY telegram_id'
            ).all<{ id: number }>();
            const [ownerId, giverId] = userRows.map(row => row.id) as [
                number,
                number
            ];
            const wish = await DB.prepare(
                "INSERT INTO wishes (user_id, title, created_at, updated_at) VALUES (?, 'a', 0, 0) RETURNING id"
            )
                .bind(ownerId)
                .first<{ id: number }>();
            const wishId = wish!.id;
            const insertGive = (userId: number) => {
                return DB.prepare(
                    'INSERT INTO gives (user_id, wish_id, created_at) VALUES (?, ?, 0)'
                )
                    .bind(userId, wishId)
                    .run();
            };

            await insertGive(giverId);
            await DB.prepare(
                "INSERT INTO release_announcements (release_version, user_id, status, created_at, updated_at) VALUES ('2.0.0', ?, 'queued', 0, 0)"
            )
                .bind(giverId)
                .run();

            await assert.rejects(insertGive(999_999), /FOREIGN KEY/);
            await assert.rejects(insertGive(giverId), /UNIQUE/);

            await DB.prepare('DELETE FROM users WHERE id = ?')
                .bind(ownerId)
                .run();

            const orphan = await DB.prepare(
                'SELECT user_id AS userId FROM wishes WHERE id = ?'
            )
                .bind(wishId)
                .first<{ userId: number | null }>();

            assert.equal(orphan?.userId, null);
            assert.equal(await countRows(harness, 'gives'), 1);

            await DB.prepare('DELETE FROM wishes').run();
            assert.equal(await countRows(harness, 'gives'), 0);

            await DB.prepare('DELETE FROM users').run();
            assert.equal(await countRows(harness, 'release_announcements'), 0);
        });
    });
});
