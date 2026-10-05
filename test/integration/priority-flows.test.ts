import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { getMessages } from '../../src/bot/content/messages';
import type { OwnWishDto, WishListDto } from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { createTestUser } from '../fixtures/telegram';
import { createD1Harness, type D1Harness } from './d1-harness';
import {
    buttonTextsOf,
    callbackDataOf,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');
const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

interface PriorityRow {
    priority: number;
    priority_level: number;
}

describe('Priority levels in the bot', () => {
    let webhook: WebhookHarness;
    const alice = createTestUser(201, {
        first_name: 'Alice',
        username: 'alice'
    });

    const tap = (data: string) => {
        return webhook.send(webhook.builders.callback(alice, data));
    };
    const readRow = () => {
        return webhook.queryOne<PriorityRow & { id: number }>(
            'SELECT wishes.id, wishes.priority, wishes.priority_level FROM wishes JOIN users ON users.id = wishes.user_id WHERE users.telegram_id = ?',
            alice.id
        );
    };
    const createWish = async () => {
        await webhook.registerUser(alice);
        await tap('n:add');
        await webhook.send(webhook.builders.message(alice, 'Bicycle'));

        const row = await readRow();

        assert.ok(row);

        return row.id;
    };

    before(async () => {
        webhook = await createWebhookHarness();
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();
    });

    it('opens a single column menu with the current level marked', async () => {
        const wishId = await createWish();

        await tap(`w:pm:${wishId}`);

        const menu = webhook.lastMessage();
        const labels = buttonTextsOf(menu);

        assert.deepEqual(callbackDataOf(menu).slice(0, 4), [
            `w:pl:${wishId}:0`,
            `w:pl:${wishId}:1`,
            `w:pl:${wishId}:2`,
            `w:pl:${wishId}:3`
        ]);
        assert.equal(labels[0], `✅ ${LL.priority.levels.none()}`);
        assert.equal(labels[1], LL.priority.levels.low());
        assert.equal(
            menu.reply_markup?.inline_keyboard?.every(row => {
                return row.length === 1;
            }),
            true
        );
    });

    it('marks the new level after each change and dual-writes the boolean', async () => {
        const wishId = await createWish();

        for (const [level, boolean] of [
            [1, 0],
            [2, 0],
            [3, 1],
            [0, 0]
        ] as const) {
            await tap(`w:pl:${wishId}:${level}`);

            assert.deepEqual(await readRow(), {
                id: wishId,
                priority: boolean,
                priority_level: level
            });

            await tap(`w:pm:${wishId}`);

            const marked = buttonTextsOf(webhook.lastMessage()).filter(text => {
                return text.startsWith('✅');
            });

            assert.equal(marked.length, 1);
        }
    });

    it('opens the same menu from the legacy toggle button', async () => {
        const wishId = await createWish();

        await tap(`w:t:${wishId}`);

        assert.deepEqual(callbackDataOf(webhook.lastMessage()).slice(0, 4), [
            `w:pl:${wishId}:0`,
            `w:pl:${wishId}:1`,
            `w:pl:${wishId}:2`,
            `w:pl:${wishId}:3`
        ]);
    });

    it('answers a stale wish with the outdated button message', async () => {
        await webhook.registerUser(alice);
        await tap('w:pl:999999:2');

        assert.ok(webhook.messageTexts().includes(LL.errors.outdatedButton()));
    });
});

describe('Priority levels in the Mini App API', () => {
    let harness: D1Harness;

    const OWNER: InitDataUserFixture = {
        id: 920_000_001,
        first_name: 'Owner',
        username: 'prio_owner',
        language_code: 'en'
    };

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const call = (method: string, path: string, body?: object) => {
        const app = createApp(
            {},
            {},
            {},
            {
                now: () => NOW,
                crypto: createNodeApiCrypto(),
                emitTelemetry: () => {}
            }
        );
        const env = {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            ADMIN_ID: '1',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined
        } as unknown as WorkerBindings;
        const headers = new Headers({
            Authorization: `tma ${createSignedInitData({
                user: OWNER,
                authDate: NOW_SECONDS
            })}`
        });

        if (body !== undefined) {
            headers.set('Content-Type', 'application/json');
        }

        return app.request(
            `/api/app${path}`,
            {
                method,
                headers,
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            },
            env
        );
    };

    const seedWish = async (userId: number, title: string, updatedAt: Date) => {
        const created = await run(
            harness.repositories.wishes.create(userId, title, 'UAH', updatedAt)
        );

        assert.ok(created);

        return created;
    };

    const readLevel = async (wishId: number) => {
        return harness.env.DB.prepare(
            'SELECT priority, priority_level FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<PriorityRow>();
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        await harness.clearApplicationTables();
    });

    const createOwner = async () => {
        const owner = await run(
            harness.repositories.users.create({
                telegramId: OWNER.id,
                username: OWNER.username ?? null,
                usernameSearchable: true,
                createdAt: NOW
            })
        );

        assert.ok(owner);

        return owner;
    };

    it('sets every named level and keeps the boolean column in step', async () => {
        const owner = await createOwner();
        const wish = await seedWish(owner.id, 'Kettle', NOW);

        for (const [priority, level, boolean] of [
            ['low', 1, 0],
            ['medium', 2, 0],
            ['high', 3, 1],
            ['none', 0, 0]
        ] as const) {
            const response = await call('PATCH', `/wishes/${wish.id}`, {
                priority
            });
            const dto = (await response.json()) as OwnWishDto;

            assert.equal(dto.priority, priority);
            assert.deepEqual(await readLevel(wish.id), {
                priority: boolean,
                priority_level: level
            });
        }
    });

    it('still accepts the boolean priority of app instances opened before the deploy', async () => {
        const owner = await createOwner();
        const wish = await seedWish(owner.id, 'Kettle', NOW);
        const patch = async (priority: boolean) => {
            const response = await call('PATCH', `/wishes/${wish.id}`, {
                priority
            });

            return (await response.json()) as OwnWishDto;
        };

        assert.equal((await patch(true)).priority, 'high');
        assert.equal((await readLevel(wish.id))?.priority_level, 3);
        assert.equal((await patch(false)).priority, 'none');
        assert.equal((await readLevel(wish.id))?.priority_level, 0);
    });

    it('lists wishes by level, then most recently updated', async () => {
        const owner = await createOwner();
        const at = (minutes: number) => {
            return new Date(NOW.getTime() + minutes * 60_000);
        };
        const oldHigh = await seedWish(owner.id, 'Old high', at(0));
        const newLow = await seedWish(owner.id, 'New low', at(10));
        const newMedium = await seedWish(owner.id, 'New medium', at(20));
        await seedWish(owner.id, 'New none', at(30));
        const oldMedium = await seedWish(owner.id, 'Old medium', at(5));

        for (const [wish, priority] of [
            [oldHigh, 'high'],
            [newLow, 'low'],
            [newMedium, 'medium'],
            [oldMedium, 'medium']
        ] as const) {
            await harness.env.DB.prepare(
                'UPDATE wishes SET priority_level = ? WHERE id = ?'
            )
                .bind({ low: 1, medium: 2, high: 3 }[priority], wish.id)
                .run();
        }

        const list = (await (
            await call('GET', '/wishes')
        ).json()) as WishListDto;

        assert.deepEqual(
            list.items.map(item => {
                return item.title;
            }),
            ['Old high', 'New medium', 'Old medium', 'New low', 'New none']
        );
    });
});
