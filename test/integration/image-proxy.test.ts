import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { sha256Hex } from '../../src/api/auth/crypto';
import { createSigner } from '../../src/api/auth/signing';
import type { RateLimiterLike } from '../../src/api/rate-limit';
import {
    createTelegramApi,
    TelegramApiError,
    type TelegramApi
} from '../../src/api/telegram-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { TelemetryFields } from '../../src/worker/telemetry';
import type { CacheLike } from '../../src/web/routes';
import { createNodeApiCrypto, TEST_BOT_TOKEN } from '../fixtures/app-auth';
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const OWNER_TELEGRAM_ID = 5_001;
const OTHER_TELEGRAM_ID = 5_002;
const CLIENT_IP = '198.51.100.9';
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6]);
const FILE_IDS = ['file-a', 'file-b'];
const SECRET_FILE_PATH = 'photos/secret-path-123.jpg';
const SECURITY_HEADERS = {
    'content-security-policy': "default-src 'none'; sandbox",
    'x-content-type-options': 'nosniff'
};

class FakeCache implements CacheLike {
    readonly entries = new Map<string, Response>();

    async match(key: string) {
        return this.entries.get(key)?.clone();
    }

    async put(key: string, response: Response) {
        this.entries.set(key, response);
    }
}

interface FakeTelegram extends TelegramApi {
    getFileCalls: string[];
    downloadCalls: string[];
    failGetFile: boolean;
}

const createFakeTelegram = (): FakeTelegram => {
    const fake: FakeTelegram = {
        getFileCalls: [],
        downloadCalls: [],
        failGetFile: false,
        async sendMessage() {
            throw new Error('unexpected sendMessage');
        },
        async sendPhoto() {
            throw new Error('unexpected sendPhoto');
        },
        async deleteMessage() {
            throw new Error('unexpected deleteMessage');
        },
        async getFile(fileId) {
            fake.getFileCalls.push(fileId);

            if (fake.failGetFile) {
                throw new TelegramApiError('getFile', {
                    error_code: 400,
                    description: 'Bad Request: wrong file_id'
                });
            }

            return {
                file_id: fileId,
                file_unique_id: 'u',
                file_path: SECRET_FILE_PATH
            };
        },
        async downloadFile(filePath) {
            fake.downloadCalls.push(filePath);

            return new Response(IMAGE_BYTES, {
                headers: { 'Content-Type': 'image/jpeg' }
            });
        }
    };

    return fake;
};

describe('image proxy', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];
    let telegram: FakeTelegram;
    let cache: FakeCache;
    let now: Date;
    let limiter: RateLimiterLike | null;
    let limiterKeys: string[];
    let consoleOutput: string[];
    let createTelegram: () => TelegramApi;
    const crypto = createNodeApiCrypto();
    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const restoreConsole = () => {
        Object.assign(console, originalConsole);
    };

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            MINI_APP_ENABLED: 'true'
        } as unknown as WorkerBindings;
    };

    const request = (path: string, headers: Record<string, string> = {}) => {
        const deps = {
            now: () => now,
            crypto,
            cache,
            createTelegramApi: () => createTelegram(),
            selectLimiter: () => limiter,
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };
        const app = createApp({}, {}, {}, {}, deps);

        return app.request(
            path,
            { headers: { 'cf-connecting-ip': CLIENT_IP, ...headers } },
            buildEnv()
        );
    };

    const hashOf = async (fileId: string) => {
        return (await sha256Hex(crypto, fileId)).slice(0, 16);
    };

    const appUrl = async (
        wishId: number,
        index: number,
        fileId = FILE_IDS[index] ?? 'missing'
    ) => {
        return createSigner({
            botToken: TEST_BOT_TOKEN,
            environment: 'production',
            crypto
        }).buildImageUrl({ wishId, index, hash: await hashOf(fileId) }, NOW);
    };

    const shareUrl = async (
        publicId: string,
        wishId: number,
        index: number,
        fileId = FILE_IDS[index] ?? 'missing'
    ) => {
        return `/img/s/${publicId}/${wishId}/${index}/${await hashOf(fileId)}`;
    };

    const seedOwner = async (telegramId = OWNER_TELEGRAM_ID) => {
        const owner = await run(
            harness.repositories.users.create({
                telegramId,
                username: `user_${telegramId}`,
                usernameSearchable: true,
                createdAt: NOW
            })
        );

        assert.ok(owner);

        const wish = await run(
            harness.repositories.wishes.create(owner.id, 'Camera', NOW)
        );

        assert.ok(wish);

        for (const fileId of FILE_IDS) {
            await run(
                harness.repositories.wishes.appendImage(
                    wish.id,
                    owner.id,
                    fileId,
                    NOW
                )
            );
        }

        const share = await run(
            harness.repositories.shares.publish(owner.id, 'Alice', NOW)
        );

        assert.ok(share);

        return { owner, wish, publicId: share.publicId };
    };

    const clearBucket = async () => {
        const listed = await harness.env.IMAGES.list();

        await Promise.all(
            listed.objects.map(object => {
                return harness.env.IMAGES.delete(object.key);
            })
        );
    };

    const servedEvents = () => {
        return events
            .filter(event => event.event === 'image_proxy_served')
            .map(event => `${event.scope}:${event.result}:${event.status}`);
    };

    const assertNoLeak = (text: string) => {
        assert.equal(text.includes(TEST_BOT_TOKEN), false);
        assert.doesNotMatch(text, /api\.telegram\.org\/file\/bot/);
        assert.equal(text.includes(SECRET_FILE_PATH), false);
    };

    const assertResponseHasNoLeak = async (response: Response) => {
        const headers = Array.from(response.headers.entries())
            .flat()
            .join('\n');

        assertNoLeak(headers);

        if (response.headers.get('Content-Type')?.startsWith('image/')) {
            return;
        }

        assertNoLeak(await response.clone().text());
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
        telegram = createFakeTelegram();
        createTelegram = () => telegram;
        cache = new FakeCache();
        now = NOW;
        limiter = null;
        limiterKeys = [];
        consoleOutput = [];
        await harness.clearApplicationTables();
        await clearBucket();

        for (const method of ['log', 'info', 'warn', 'error'] as const) {
            console[method] = (...args: unknown[]) => {
                consoleOutput.push(args.map(String).join(' '));
            };
        }
    });

    afterEach(restoreConsole);

    it('serves a valid app URL on a miss, then from cache without Telegram, with the A5 headers', async () => {
        const { wish } = await seedOwner();
        const url = await appUrl(wish.id, 0);
        const miss = await request(url);

        assert.equal(miss.status, 200);
        assert.equal(miss.headers.get('Content-Type'), 'image/jpeg');
        assert.equal(
            miss.headers.get('Cache-Control'),
            'private, max-age=3600, immutable'
        );
        assert.equal(
            miss.headers.get('Cross-Origin-Resource-Policy'),
            'same-origin'
        );

        for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
            assert.equal(miss.headers.get(name), value);
        }

        assert.deepEqual(new Uint8Array(await miss.arrayBuffer()), IMAGE_BYTES);
        assert.deepEqual(telegram.getFileCalls, ['file-a']);
        assert.deepEqual(telegram.downloadCalls, [SECRET_FILE_PATH]);

        const hit = await request(url);

        assert.equal(hit.status, 200);
        assert.deepEqual(new Uint8Array(await hit.arrayBuffer()), IMAGE_BYTES);
        assert.equal(telegram.getFileCalls.length, 1);
        assert.deepEqual(servedEvents(), ['app:miss:200', 'app:hit:200']);
    });

    it('writes the miss to R2 under the SHA-256 of the file id and later serves it from R2 without Telegram', async () => {
        const { wish } = await seedOwner();
        const url = await appUrl(wish.id, 1);

        await request(url);

        const key = await sha256Hex(crypto, 'file-b');
        const stored = await harness.env.IMAGES.get(key);

        assert.ok(stored);
        assert.equal(stored.httpMetadata?.contentType, 'image/jpeg');

        cache.entries.clear();
        telegram.getFileCalls.length = 0;
        telegram.downloadCalls.length = 0;

        const fromR2 = await request(url);

        assert.equal(fromR2.status, 200);
        assert.deepEqual(
            new Uint8Array(await fromR2.arrayBuffer()),
            IMAGE_BYTES
        );
        assert.deepEqual(telegram.getFileCalls, []);
        assert.deepEqual(telegram.downloadCalls, []);
        assert.equal(cache.entries.size, 1);
        assert.deepEqual(servedEvents(), ['app:miss:200', 'app:hit:200']);
    });

    it('serves a pre-existing R2 object with no Telegram call even without the Cache API', async () => {
        const { wish } = await seedOwner();

        await harness.env.IMAGES.put(
            await sha256Hex(crypto, 'file-a'),
            IMAGE_BYTES,
            { httpMetadata: { contentType: 'image/webp' } }
        );

        const response = await request(await appUrl(wish.id, 0));

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/webp');
        assert.deepEqual(telegram.getFileCalls, []);
    });

    it('rejects expired, tampered, mismatched and unknown app URLs without touching Telegram', async () => {
        const { owner, wish } = await seedOwner();
        const url = await appUrl(wish.id, 0);

        now = new Date(NOW.getTime() + 3 * 3600 * 1000);

        const expired = await request(url);

        now = NOW;

        const tampered = await request(`${url.slice(0, -2)}AA`);
        const missingParams = await request(url.split('?')[0] ?? '');
        const otherWish = await request(
            url.replace(`/${wish.id}/`, `/${wish.id + 1}/`)
        );
        const wrongHash = await request(
            await appUrl(wish.id, 0, 'not-the-file')
        );
        const outOfRange = await request(await appUrl(wish.id, 5, 'file-a'));
        const malformed = await request('/img/w/abc/0/zz?e=1&s=2');

        await run(
            harness.repositories.wishes.softRemove(
                wish.id,
                owner.id,
                false,
                NOW
            )
        );

        const removed = await request(url);

        assert.deepEqual(
            [
                expired,
                tampered,
                missingParams,
                otherWish,
                wrongHash,
                outOfRange,
                malformed,
                removed
            ].map(response => response.status),
            [410, 403, 403, 403, 404, 404, 404, 404]
        );
        assert.equal(expired.headers.get('Cache-Control'), 'no-store');
        assert.deepEqual(telegram.getFileCalls, []);
        assert.deepEqual(servedEvents(), [
            'app:expired:410',
            'app:forbidden:403',
            'app:forbidden:403',
            'app:forbidden:403',
            'app:notFound:404',
            'app:notFound:404',
            'app:notFound:404',
            'app:notFound:404'
        ]);
    });

    it('serves share URLs for an active share with the share cache headers', async () => {
        const { wish, publicId } = await seedOwner();
        const response = await request(await shareUrl(publicId, wish.id, 1));

        assert.equal(response.status, 200);
        assert.equal(
            response.headers.get('Cache-Control'),
            'public, max-age=3600'
        );
        assert.equal(
            response.headers.get('Cross-Origin-Resource-Policy'),
            null
        );

        for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
            assert.equal(response.headers.get(name), value);
        }

        assert.deepEqual(telegram.getFileCalls, ['file-b']);

        const upper = await request(
            await shareUrl(publicId.toUpperCase(), wish.id, 1)
        );

        assert.equal(upper.status, 200);
    });

    it('answers 404 for revoked shares, hidden wishes, blocked owners, foreign wishes and wrong hashes', async () => {
        const { owner, wish, publicId } = await seedOwner();
        const other = await seedOwner(OTHER_TELEGRAM_ID);
        const url = await shareUrl(publicId, wish.id, 0);

        const wrongHash = await request(
            await shareUrl(publicId, wish.id, 0, 'not-the-file')
        );
        const foreignWish = await request(
            await shareUrl(publicId, other.wish.id, 0)
        );
        const outOfRange = await request(
            await shareUrl(publicId, wish.id, 7, 'file-a')
        );
        const unknownShare = await request(
            await shareUrl('0'.repeat(26), wish.id, 0)
        );

        await run(
            harness.repositories.wishes.setFlags(
                wish.id,
                owner.id,
                { hidden: true },
                NOW
            )
        );

        const hidden = await request(url);

        await run(
            harness.repositories.wishes.setFlags(
                wish.id,
                owner.id,
                { hidden: false },
                NOW
            )
        );
        await run(
            harness.repositories.users.markBlockedByTelegramId(
                OWNER_TELEGRAM_ID,
                NOW
            )
        );

        const blocked = await request(url);

        await run(harness.repositories.users.clearBlocked(owner.id));
        await run(harness.repositories.shares.revoke(owner.id, NOW));

        const revoked = await request(url);

        assert.deepEqual(
            [
                wrongHash,
                foreignWish,
                outOfRange,
                unknownShare,
                hidden,
                blocked,
                revoked
            ].map(response => response.status),
            [404, 404, 404, 404, 404, 404, 404]
        );
        assert.deepEqual(telegram.getFileCalls, []);
        assert.equal(
            servedEvents().every(event => event === 'share:notFound:404'),
            true
        );
    });

    it('rate limits before authorization and the cache, keyed by the hashed client IP', async () => {
        const { wish, publicId } = await seedOwner();
        const url = await appUrl(wish.id, 0);
        const shareImage = await shareUrl(publicId, wish.id, 0);

        await request(url);
        telegram.getFileCalls.length = 0;
        events = [];
        limiter = {
            async limit({ key }) {
                limiterKeys.push(key);

                return { success: false };
            }
        };

        const limited = await request(url, {
            'cf-connecting-ip': '203.0.113.7'
        });
        const limitedShare = await request(shareImage, {
            'cf-connecting-ip': '203.0.113.7'
        });
        const limitedUnknown = await request('/img/s/unknown/1/0/deadbeef', {
            'cf-connecting-ip': '203.0.113.7'
        });

        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get('Retry-After'), '60');
        assert.equal(limitedShare.status, 429);
        assert.equal(limitedUnknown.status, 429);
        assert.deepEqual(limiterKeys, [
            await sha256Hex(crypto, '203.0.113.7'),
            await sha256Hex(crypto, '203.0.113.7'),
            await sha256Hex(crypto, '203.0.113.7')
        ]);
        assert.deepEqual(telegram.getFileCalls, []);
        assert.equal(
            events.some(event => {
                return (
                    event.event === 'app_rate_limited' &&
                    event.bucket === 'image'
                );
            }),
            true
        );
        assert.deepEqual(servedEvents(), [
            'app:rateLimited:429',
            'share:rateLimited:429',
            'share:rateLimited:429'
        ]);
    });

    it('fails closed with 429 when the client IP header is missing, without consulting the limiter', async () => {
        const { wish, publicId } = await seedOwner();
        let limiterCalls = 0;

        limiter = {
            async limit() {
                limiterCalls += 1;

                return { success: true };
            }
        };

        const app = await request(await appUrl(wish.id, 0), {
            'cf-connecting-ip': ''
        });
        const share = await request(await shareUrl(publicId, wish.id, 0), {
            'cf-connecting-ip': ''
        });

        assert.equal(app.status, 429);
        assert.equal(share.status, 429);
        assert.equal(limiterCalls, 0);
        assert.deepEqual(telegram.getFileCalls, []);
    });

    const assertPlaceholderResponse = async (
        response: Response,
        scope: 'app' | 'share'
    ) => {
        const body = await response.text();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/svg+xml');
        assert.equal(
            response.headers.get('Cache-Control'),
            scope === 'app' ? 'private, max-age=300' : 'public, max-age=300'
        );
        assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
        assert.equal(
            response.headers.get('Content-Security-Policy'),
            "default-src 'none'; sandbox"
        );
        assert.equal(
            response.headers.get('Cross-Origin-Resource-Policy'),
            scope === 'app' ? 'same-origin' : null
        );
        assert.match(body, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
        assert.match(body, /<\/svg>$/);
        assert.doesNotMatch(body, /<script|href=|telegram/i);
        assertNoLeak(body);
    };

    it('answers a grey placeholder image for an app request when Telegram cannot return the file', async () => {
        const { wish } = await seedOwner();

        telegram.failGetFile = true;

        const response = await request(await appUrl(wish.id, 0));

        await assertPlaceholderResponse(response, 'app');
        assert.deepEqual(servedEvents(), ['app:placeholder:200']);
        assert.equal((await harness.env.IMAGES.list()).objects.length, 0);
        assert.equal(cache.entries.size, 0);
    });

    it('answers the same placeholder image for a share request when Telegram cannot return the file', async () => {
        const { wish, publicId } = await seedOwner();

        telegram.failGetFile = true;

        const response = await request(await shareUrl(publicId, wish.id, 0));

        await assertPlaceholderResponse(response, 'share');
        assert.deepEqual(servedEvents(), ['share:placeholder:200']);
        assert.equal((await harness.env.IMAGES.list()).objects.length, 0);
        assert.equal(cache.entries.size, 0);
    });

    it('keeps the error responses for requests that are not authorized even when Telegram fails', async () => {
        const { wish, publicId } = await seedOwner();

        telegram.failGetFile = true;

        const badSignature = await request(`${await appUrl(wish.id, 0)}x`);
        const wrongHash = await request(
            await shareUrl(publicId, wish.id, 0, 'not-the-file')
        );

        assert.deepEqual([badSignature.status, wrongHash.status], [403, 404]);
        assert.equal(badSignature.headers.get('Content-Type'), null);
        assert.equal(await badSignature.text(), '');
        assert.deepEqual(servedEvents(), [
            'app:forbidden:403',
            'share:notFound:404'
        ]);
        assert.deepEqual(telegram.getFileCalls, []);
    });

    it('never exposes the token or the Telegram file URL in responses, headers or console output', async () => {
        const { wish, publicId } = await seedOwner();
        const requested: string[] = [];

        createTelegram = () => {
            return createTelegramApi({
                botToken: TEST_BOT_TOKEN,
                fetch: async input => {
                    const url = String(input);

                    requested.push(url);

                    if (url.endsWith('/getFile')) {
                        return Response.json({
                            ok: true,
                            result: {
                                file_id: 'x',
                                file_unique_id: 'u',
                                file_path: SECRET_FILE_PATH
                            }
                        });
                    }

                    return new Response(IMAGE_BYTES, {
                        headers: { 'Content-Type': 'image/jpeg' }
                    });
                }
            });
        };

        const responses = [
            await request(await appUrl(wish.id, 0)),
            await request(await shareUrl(publicId, wish.id, 1)),
            await request(await appUrl(wish.id, 0)),
            await request(`${await appUrl(wish.id, 0)}x`),
            await request('/img/w/1/2/3'),
            await request('/img/s/nope')
        ];

        for (const response of responses) {
            await assertResponseHasNoLeak(response);
        }

        assert.equal(
            requested.some(url => url.includes(TEST_BOT_TOKEN)),
            true
        );
        assertNoLeak(consoleOutput.join('\n'));
        assertNoLeak(JSON.stringify(events));

        createTelegram = () => {
            return createTelegramApi({
                botToken: TEST_BOT_TOKEN,
                fetch: async input => {
                    return String(input).endsWith('/getFile')
                        ? Response.json({
                              ok: true,
                              result: {
                                  file_id: 'x',
                                  file_unique_id: 'u',
                                  file_path: SECRET_FILE_PATH
                              }
                          })
                        : new Response('nope', { status: 404 });
                }
            });
        };
        cache.entries.clear();
        await clearBucket();
        consoleOutput.length = 0;

        const failing = await request(await appUrl(wish.id, 1));

        assert.equal(failing.status, 200);
        assert.equal(failing.headers.get('Content-Type'), 'image/svg+xml');
        assertNoLeak(await failing.clone().text());
        assert.match(
            consoleOutput.join('\n'),
            /"event":"image_proxy_upstream_failed","errorCode":404/
        );
        await assertResponseHasNoLeak(failing);
        assertNoLeak(consoleOutput.join('\n'));
    });
});
