import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { migrate } from 'drizzle-orm/d1/migrator';
import { Effect } from 'effect';
import { getPlatformProxy } from 'wrangler';

import { createDb } from '../../src/db/client';
import { createRepositories } from '../../src/db/repositories';
import { CONVERTED_CURRENCIES, FALLBACK_RATES } from '../../src/shared/money';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

export interface D1HarnessOptions {
    persistDirectory?: string;
}

export const createD1Harness = async (options: D1HarnessOptions = {}) => {
    const ownsPersistDirectory = options.persistDirectory === undefined;
    const persistDirectory =
        options.persistDirectory ??
        fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-d1-integration-'));
    const proxy = await getPlatformProxy<Env>({
        persist: { path: persistDirectory }
    });
    const db = createDb(proxy.env);
    const repositories = createRepositories(db);
    const seedFreshExchangeRates = () => {
        return Effect.runPromise(
            repositories.exchangeRates.upsertMany(
                CONVERTED_CURRENCIES.map(currency => {
                    return {
                        currency,
                        uahPerUnit: FALLBACK_RATES.perUnit[currency],
                        rateDate: FALLBACK_RATES.date
                    };
                }),
                new Date()
            )
        );
    };

    return {
        env: proxy.env,
        persistDirectory,
        db,
        repositories,
        async applyMigrations() {
            await migrate(db, { migrationsFolder });
            await seedFreshExchangeRates();
        },
        async clearApplicationTables() {
            await proxy.env.DB.batch([
                proxy.env.DB.prepare('DELETE FROM wishlist_shares'),
                proxy.env.DB.prepare('DELETE FROM release_announcements'),
                proxy.env.DB.prepare('DELETE FROM list_imports'),
                proxy.env.DB.prepare('DELETE FROM gives'),
                proxy.env.DB.prepare('DELETE FROM wishes'),
                proxy.env.DB.prepare('DELETE FROM users'),
                proxy.env.DB.prepare('DELETE FROM sessions'),
                proxy.env.DB.prepare('DELETE FROM telegram_updates')
            ]);
        },
        async dispose() {
            await proxy.dispose();

            if (ownsPersistDirectory) {
                fs.rmSync(persistDirectory, { recursive: true, force: true });
            }
        }
    };
};

export type D1Harness = Awaited<ReturnType<typeof createD1Harness>>;

export const countRows = async (harness: D1Harness, tableName: string) => {
    const row = await harness.env.DB.prepare(
        `SELECT count(*) AS total FROM ${tableName}`
    ).first<{ total: number }>();

    return row?.total ?? 0;
};

export const seedGeneratedWishes = async (
    harness: D1Harness,
    userId: number,
    wishCount: number
) => {
    await harness.env.DB.prepare(
        `INSERT INTO wishes (user_id, title, created_at, updated_at)
        WITH RECURSIVE sequence(n) AS (
            SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < ?
        )
        SELECT ?, 'wish ' || n, 0, 0 FROM sequence`
    )
        .bind(wishCount, userId)
        .run();
};

export const createWorkerEnv = (
    harness: D1Harness,
    overrides: Record<string, string>
) => {
    return { ...harness.env, ...overrides } as typeof harness.env;
};
