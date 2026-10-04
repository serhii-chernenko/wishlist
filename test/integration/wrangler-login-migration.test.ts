import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
    applyDrizzleMigrations,
    type MigrationSqlExecutor
} from '../../scripts/db/wrangler-login-migration';
import { createD1Harness, type D1Harness } from './d1-harness';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

const committedMigrationCount = fs
    .readdirSync(migrationsFolder, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).length;
const bookkeepingSql =
    'SELECT "hash", "created_at", "name" FROM "__drizzle_migrations" ORDER BY "id"';
const schemaSql =
    "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name";

const createHarnessExecutor = (harness: D1Harness): MigrationSqlExecutor => {
    const database = harness.env.DB;

    return {
        async query(sql) {
            const { results } = await database
                .prepare(sql)
                .all<Record<string, unknown>>();

            return results;
        },
        async execute(statements) {
            await database.batch(
                statements.map(statement => database.prepare(statement))
            );
        }
    };
};

const readRows = async (harness: D1Harness, sql: string) => {
    const { results } = await harness.env.DB.prepare(sql).all();

    return results;
};

describe('wrangler-login migration bookkeeping', () => {
    let drizzleHarness: D1Harness;
    let loginHarness: D1Harness;

    before(async () => {
        drizzleHarness = await createD1Harness();
        loginHarness = await createD1Harness();
    });

    after(async () => {
        await drizzleHarness.dispose();
        await loginHarness.dispose();
    });

    it('produces the same schema and bookkeeping rows as the drizzle migrator', async () => {
        await drizzleHarness.applyMigrations();

        const result = await applyDrizzleMigrations(
            createHarnessExecutor(loginHarness),
            migrationsFolder
        );

        assert.equal(result.applied.length, committedMigrationCount);
        assert.deepEqual(result.alreadyApplied, []);
        assert.deepEqual(
            await readRows(loginHarness, bookkeepingSql),
            await readRows(drizzleHarness, bookkeepingSql)
        );
        assert.deepEqual(
            await readRows(loginHarness, schemaSql),
            await readRows(drizzleHarness, schemaSql)
        );
    });

    it('leaves a subsequent drizzle migrate as a no-op', async () => {
        const before = await readRows(
            loginHarness,
            'SELECT * FROM "__drizzle_migrations" ORDER BY "id"'
        );

        await loginHarness.applyMigrations();

        assert.deepEqual(
            await readRows(
                loginHarness,
                'SELECT * FROM "__drizzle_migrations" ORDER BY "id"'
            ),
            before
        );
    });

    it('is itself a no-op when run again', async () => {
        const result = await applyDrizzleMigrations(
            createHarnessExecutor(loginHarness),
            migrationsFolder
        );

        assert.deepEqual(result.applied, []);
        assert.equal(result.alreadyApplied.length, committedMigrationCount);
    });

    it('treats a database already migrated by drizzle as up to date', async () => {
        const migratedHarness = await createD1Harness();

        try {
            await migratedHarness.applyMigrations();

            const result = await applyDrizzleMigrations(
                createHarnessExecutor(migratedHarness),
                migrationsFolder
            );

            assert.deepEqual(result.applied, []);
            assert.equal(result.alreadyApplied.length, committedMigrationCount);
            assert.deepEqual(
                await readRows(migratedHarness, bookkeepingSql),
                await readRows(drizzleHarness, bookkeepingSql)
            );
        } finally {
            await migratedHarness.dispose();
        }
    });
});
