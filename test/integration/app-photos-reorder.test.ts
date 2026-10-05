import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { sha256Hex } from '../../src/api/auth/crypto';
import type { TelegramApi } from '../../src/api/telegram-api';
import {
    APP_IMAGE_HASH_LENGTH,
    APP_IMAGE_PATH_PREFIX,
    type ApiErrorBody,
    type OwnWishDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const LATER = new Date('2026-10-04T12:05:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const OWNER_TELEGRAM_ID = 5_001;
const OTHER_TELEGRAM_ID = 5_002;
const CLIENT_IP = '198.51.100.21';
const FILE_IDS = ['first', 'second', 'third'] as const;

const OWNER: InitDataUserFixture = {
    id: OWNER_TELEGRAM_ID,
    first_name: 'Owner',
    username: 'owner_user',
    language_code: 'en'
};
const OTHER: InitDataUserFixture = {
    id: OTHER_TELEGRAM_ID,
    first_name: 'Other',
    username: 'other_user',
    language_code: 'en'
};

const unusedTelegram = (): TelegramApi => {
    return new Proxy({} as TelegramApi, {
        get() {
            throw new Error('the reorder endpoint never calls Telegram');
        }
    });
};

describe('Mini App photo reordering', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];
    let clock: Date;
    const crypto = createNodeApiCrypto();

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const hashOf = async (fileId: string) => {
        return (await sha256Hex(crypto, fileId)).slice(
            0,
            APP_IMAGE_HASH_LENGTH
        );
    };

    const hashesOf = (fileIds: readonly string[]) => {
        return Promise.all(fileIds.map(hashOf));
    };

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            ADMIN_ID: '1',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            IMAGE_PROXY_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const reorder = (
        wishId: number,
        body: unknown,
        user: InitDataUserFixture = OWNER,
        contentType = 'application/json'
    ) => {
        const deps = {
            now: () => clock,
            crypto,
            createTelegramApi: unusedTelegram,
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };
        const app = createApp({}, {}, {}, deps, deps);

        return app.request(
            `/api/app/wishes/${wishId}/images/order`,
            {
                method: 'PUT',
                headers: {
                    'cf-connecting-ip': CLIENT_IP,
                    'Content-Type': contentType,
                    Authorization: `tma ${createSignedInitData({
                        user,
                        authDate: NOW_SECONDS
                    })}`
                },
                body: typeof body === 'string' ? body : JSON.stringify(body)
            },
            buildEnv()
        );
    };

    const readError = async (response: Response) => {
        return ((await response.json()) as ApiErrorBody).error;
    };

    const createUser = async (telegramId: number, username: string) => {
        const created = await run(
            harness.repositories.users.create({
                telegramId,
                username,
                usernameSearchable: true,
                createdAt: NOW
            })
        );

        assert.ok(created);

        return created;
    };

    const seedWish = async (fileIds: readonly string[] = FILE_IDS) => {
        const user = await createUser(OWNER_TELEGRAM_ID, 'owner_user');
        const wish = await run(
            harness.repositories.wishes.create(user.id, 'Camera', 'UAH', NOW)
        );

        assert.ok(wish);

        for (const fileId of fileIds) {
            await run(
                harness.repositories.wishes.appendImage(
                    wish.id,
                    user.id,
                    fileId,
                    NOW
                )
            );
        }

        return { user, wish };
    };

    const storedRow = async (wishId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT images, updated_at AS updatedAt FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{ images: string; updatedAt: number }>();

        return {
            images: JSON.parse(row?.images ?? '[]') as string[],
            updatedAt: row?.updatedAt ?? null
        };
    };

    const reorderEvents = () => {
        return events.filter(event => {
            return event.action === 'wish_images_reordered';
        });
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        events = [];
        clock = NOW;
        await harness.clearApplicationTables();
    });

    it('stores a permutation and answers with URLs minted for the new positions', async () => {
        const { wish } = await seedWish();
        const before = await storedRow(wish.id);
        const order = ['third', 'first', 'second'];

        clock = LATER;

        const response = await reorder(wish.id, {
            hashes: await hashesOf(order)
        });
        const body = (await response.json()) as OwnWishDto;
        const stored = await storedRow(wish.id);

        assert.equal(response.status, 200);
        assert.deepEqual(stored.images, order);
        assert.notEqual(stored.updatedAt, before.updatedAt);
        assert.deepEqual(
            body.images.map(image => image.hash),
            await hashesOf(order)
        );

        for (const [index, image] of body.images.entries()) {
            assert.ok(
                image.url.includes(
                    `${APP_IMAGE_PATH_PREFIX}/${wish.id}/${index}/${image.hash}`
                ),
                image.url
            );
        }

        assert.equal(reorderEvents().length, 1);
        assert.equal(reorderEvents()[0]?.channel, 'app');
        assert.equal(reorderEvents()[0]?.result, undefined);
    });

    it('reports how the photos were moved and rejects an unknown source', async () => {
        const { wish } = await seedWish();
        const moved = await reorder(wish.id, {
            hashes: await hashesOf(['second', 'first', 'third']),
            source: 'keyboard'
        });

        assert.equal(moved.status, 200);
        assert.deepEqual(
            reorderEvents().map(event => event.result),
            ['keyboard']
        );

        const rejected = await reorder(wish.id, {
            hashes: await hashesOf(FILE_IDS),
            source: 'swipe'
        });

        assert.equal(rejected.status, 422);
        assert.deepEqual(await readError(rejected), {
            code: 'validation',
            fields: { source: 'invalid' }
        });
        assert.deepEqual((await storedRow(wish.id)).images, [
            'second',
            'first',
            'third'
        ]);
    });

    it('treats the current order as a no-op without touching updated_at', async () => {
        const { wish } = await seedWish();
        const before = await storedRow(wish.id);

        clock = LATER;

        const response = await reorder(wish.id, {
            hashes: await hashesOf(FILE_IDS)
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await storedRow(wish.id), before);
        assert.equal(reorderEvents().length, 0);
    });

    it('answers 409 imageChanged when the set of photos differs', async () => {
        const { wish } = await seedWish();
        const cases = [
            await hashesOf(['third', 'first']),
            await hashesOf(['third', 'first', 'second', 'fourth']),
            await hashesOf(['third', 'first', 'fourth'])
        ];

        for (const hashes of cases) {
            const response = await reorder(wish.id, { hashes });

            assert.equal(response.status, 409);
            assert.deepEqual(await readError(response), {
                code: 'imageChanged'
            });
        }

        assert.deepEqual((await storedRow(wish.id)).images, [...FILE_IDS]);
        assert.equal(reorderEvents().length, 0);
    });

    it('answers 422 for a missing, malformed or duplicated hash list', async () => {
        const { wish } = await seedWish();
        const [first = '', second = ''] = await hashesOf(FILE_IDS);
        const bodies: unknown[] = [
            {},
            { hashes: 'abc' },
            { hashes: [first, second, 'zz'] },
            { hashes: [first, second, first.toUpperCase()] },
            { hashes: [first, second, 7] },
            { hashes: [first, first, second] },
            { hashes: Array.from({ length: 10 }, () => first) }
        ];
        const expected = ['required', ...Array(6).fill('invalid')];

        for (const [index, body] of bodies.entries()) {
            const response = await reorder(wish.id, body);

            assert.equal(response.status, 422, JSON.stringify(body));
            assert.deepEqual(await readError(response), {
                code: 'validation',
                fields: { hashes: expected[index] }
            });
        }

        assert.deepEqual((await storedRow(wish.id)).images, [...FILE_IDS]);
    });

    it('rejects a body that is not JSON', async () => {
        const { wish } = await seedWish();
        const notJson = await reorder(wish.id, 'hashes=1');
        const wrongType = await reorder(
            wish.id,
            { hashes: [] },
            OWNER,
            'text/plain'
        );

        assert.equal(notJson.status, 422);
        assert.equal(wrongType.status, 415);
    });

    it('hides other users wishes behind 404', async () => {
        const { wish } = await seedWish();

        await createUser(OTHER_TELEGRAM_ID, 'other_user');

        const response = await reorder(
            wish.id,
            { hashes: await hashesOf(['third', 'second', 'first']) },
            OTHER
        );

        assert.equal(response.status, 404);
        assert.deepEqual((await storedRow(wish.id)).images, [...FILE_IDS]);
    });

    it('writes with a compare-and-swap on the images the request read', async () => {
        const { user, wish } = await seedWish();
        const stale = JSON.stringify(['first', 'second']);
        const lost = await run(
            harness.repositories.wishes.replaceImages(
                wish.id,
                user.id,
                stale,
                JSON.stringify(['second', 'first']),
                LATER
            )
        );

        assert.equal(lost, null);
        assert.deepEqual((await storedRow(wish.id)).images, [...FILE_IDS]);

        const current = JSON.stringify(FILE_IDS);
        const won = await run(
            harness.repositories.wishes.replaceImages(
                wish.id,
                user.id,
                current,
                JSON.stringify(['second', 'third', 'first']),
                LATER
            )
        );

        assert.ok(won);
        assert.deepEqual(JSON.parse(won.images), ['second', 'third', 'first']);
    });

    it('accepts an empty list for a wish without photos', async () => {
        const { wish } = await seedWish([]);
        const response = await reorder(wish.id, { hashes: [] });

        assert.equal(response.status, 200);
        assert.deepEqual(((await response.json()) as OwnWishDto).images, []);
    });
});
