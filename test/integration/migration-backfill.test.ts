import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { migrate } from 'drizzle-orm/d1/migrator';

import { createD1Harness, type D1Harness } from './d1-harness';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const foundationMigration = '20261004083515_far_impossible_man';

interface WishRow {
    title: string;
    priority: number;
    priorityLevel: number;
    currency: string;
}

interface UserRow {
    telegramId: number;
    deliveryAddress: string | null;
    showPayments: number;
    showPhone: number;
    showAddress: number;
}

const createPreFoundationFolder = () => {
    const folder = fs.mkdtempSync(
        path.join(os.tmpdir(), 'wishlist-pre-foundation-')
    );
    const earlier = fs
        .readdirSync(migrationsFolder, { withFileTypes: true })
        .filter(entry => {
            return entry.isDirectory() && entry.name < foundationMigration;
        });

    for (const entry of earlier) {
        fs.symlinkSync(
            path.join(migrationsFolder, entry.name),
            path.join(folder, entry.name)
        );
    }

    return folder;
};

const seedPreFoundationRows = async (harness: D1Harness) => {
    const { DB } = harness.env;

    await DB.batch([
        DB.prepare(
            "INSERT INTO users (id, telegram_id, currency, phone, created_at, updated_at) VALUES (1, 101, 'UAH', '+380501112233', 0, 0), (2, 102, 'EUR', NULL, 0, 0), (3, 103, 'UAH', NULL, 0, 0)"
        ),
        DB.prepare(
            "INSERT INTO wishes (user_id, title, priority, created_at, updated_at) VALUES (1, 'uah-high', 1, 0, 0), (1, 'uah-none', 0, 0, 0), (2, 'eur-high', 1, 0, 0), (2, 'eur-none', 0, 0, 0), (NULL, 'orphan-high', 1, 0, 0)"
        ),
        DB.prepare(
            'INSERT INTO wishlist_shares (user_id, public_id, created_at, updated_at) VALUES (1, ?, 0, 0)'
        ).bind('01k6foundationbackfill0001')
    ]);
};

const readWishes = async (harness: D1Harness) => {
    const { results } = await harness.env.DB.prepare(
        'SELECT title, priority, priority_level AS priorityLevel, currency FROM wishes ORDER BY title'
    ).all<WishRow>();

    return new Map(
        results.map(row => {
            return [row.title, row] as const;
        })
    );
};

describe('foundation migration backfill', () => {
    let harness: D1Harness;
    let preFoundationFolder: string;

    before(async () => {
        harness = await createD1Harness();
        preFoundationFolder = createPreFoundationFolder();
        await migrate(harness.db, { migrationsFolder: preFoundationFolder });
        await seedPreFoundationRows(harness);
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
        fs.rmSync(preFoundationFolder, { recursive: true, force: true });
    });

    it('turns every old priority wish into high priority and keeps the count', async () => {
        const counts = await harness.env.DB.prepare(
            'SELECT (SELECT count(*) FROM wishes WHERE priority = 1) AS flagged, (SELECT count(*) FROM wishes WHERE priority_level = 3) AS high, (SELECT count(*) FROM wishes WHERE priority_level NOT IN (0, 3)) AS other'
        ).first<{ flagged: number; high: number; other: number }>();
        const wishes = await readWishes(harness);

        assert.deepEqual(counts, { flagged: 3, high: 3, other: 0 });
        assert.equal(wishes.get('uah-high')?.priorityLevel, 3);
        assert.equal(wishes.get('uah-none')?.priorityLevel, 0);
        assert.equal(wishes.get('orphan-high')?.priorityLevel, 3);
    });

    it("gives each wish its owner's currency and UAH to orphaned wishes", async () => {
        const wishes = await readWishes(harness);

        assert.equal(wishes.get('uah-high')?.currency, 'UAH');
        assert.equal(wishes.get('eur-high')?.currency, 'EUR');
        assert.equal(wishes.get('eur-none')?.currency, 'EUR');
        assert.equal(wishes.get('orphan-high')?.currency, 'UAH');
    });

    it('keeps payments visible and phone and address hidden for existing users', async () => {
        const { results } = await harness.env.DB.prepare(
            'SELECT telegram_id AS telegramId, delivery_address AS deliveryAddress, show_payments AS showPayments, show_phone AS showPhone, show_address AS showAddress FROM users ORDER BY telegram_id'
        ).all<UserRow>();

        assert.equal(results.length, 3);

        for (const row of results) {
            assert.deepEqual(
                {
                    deliveryAddress: row.deliveryAddress,
                    showPayments: row.showPayments,
                    showPhone: row.showPhone,
                    showAddress: row.showAddress
                },
                {
                    deliveryAddress: null,
                    showPayments: 1,
                    showPhone: 0,
                    showAddress: 0
                },
                String(row.telegramId)
            );
        }
    });

    it('allows search engine indexing for existing shares', async () => {
        const share = await harness.env.DB.prepare(
            'SELECT allow_indexing AS allowIndexing FROM wishlist_shares WHERE user_id = 1'
        ).first<{ allowIndexing: number }>();

        assert.equal(share?.allowIndexing, 1);
    });

    it('records the foundation migration exactly once and adds the priority index', async () => {
        const recorded = await harness.env.DB.prepare(
            'SELECT count(*) AS total FROM __drizzle_migrations WHERE name = ?'
        )
            .bind(foundationMigration)
            .first<{ total: number }>();
        const index = await harness.env.DB.prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'wishes_owner_priority_level_index'"
        ).first<{ sql: string }>();

        assert.equal(recorded?.total, 1);
        assert.match(
            index?.sql ?? '',
            /\("user_id","removed","priority_level","updated_at"\)|`user_id`,`removed`,`priority_level`,`updated_at`/
        );
    });
});
