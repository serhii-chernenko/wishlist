import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { createImportSigner } from '../../src/api/auth/import-signing';
import type { LinkImportServices } from '../../src/api/context';
import {
    TelegramApiError,
    type SentPhotoMessage,
    type TelegramApi
} from '../../src/api/telegram-api';
import type {
    ExtractedProduct,
    LinkImportRequest,
    LinkImportResult,
    LoadedStagedImage,
    StageImagesInput,
    SkippedImage,
    StagedImage
} from '../../src/bot/services/link-import/types';
import {
    APP_MAX_WISH_IMAGES,
    LINK_IMPORT_HANDLER_BUDGET_MS,
    LINK_IMPORT_PRESELECTED_IMAGES,
    type ApiErrorBody,
    type LinkImportDto,
    type OwnWishDto
} from '../../src/shared/app-api';
import { CURRENCIES } from '../../src/shared/money';
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

const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const OWNER_TELEGRAM_ID = 5_001;
const OTHER_TELEGRAM_ID = 5_002;
const SENT_MESSAGE_ID = 9_101;
const CLIENT_IP = '198.51.100.9';
const URL_HASH = 'a'.repeat(32);
const SHOP_PAGE = 'https://rozetka.com.ua/camera-x100/p123/?utm_source=tg';
const SHOP_FINAL = 'https://rozetka.com.ua/camera-x100/p123/';
const SHOP_TITLE = 'Fujifilm X100VI Silver';
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 1, 2, 3, 4]);
const ONE_HOUR_SECONDS = 3600;
const TOKEN_TTL_SECONDS = 2 * ONE_HOUR_SECONDS;

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

const buildProduct = (overrides: Partial<ExtractedProduct> = {}) => {
    const product: ExtractedProduct = {
        title: SHOP_TITLE,
        description: 'Compact camera',
        price: 1699,
        currency: 'EUR',
        images: Array.from({ length: 7 }, (_, index) => {
            return `https://img.rozetka.com.ua/camera-${index}.jpg`;
        }),
        source: 'jsonld',
        canonicalUrl: SHOP_FINAL,
        finalUrl: SHOP_FINAL,
        ...overrides
    };

    return product;
};

const buildResult = (
    overrides: Partial<LinkImportResult> = {}
): LinkImportResult => {
    return {
        outcome: 'ok',
        product: buildProduct(),
        normalizedUrl: SHOP_FINAL,
        host: 'rozetka.com.ua',
        urlHash: URL_HASH,
        shop: 'rozetka',
        cache: 'miss',
        elapsedMs: 420,
        ...overrides
    };
};

interface FakeLinkImport extends LinkImportServices {
    runCalls: LinkImportRequest[];
    stageCalls: StageImagesInput[];
    loadCalls: { urlHash: string; index: number }[];
    nextRun: () => Promise<LinkImportResult>;
    nextStaged: StagedImage[];
    nextSkipped: SkippedImage[];
    nextBody: LoadedStagedImage;
}

const isOwnCurrency = (value: string | null) => {
    return CURRENCIES.some(currency => {
        return currency === value;
    });
};

const createFakeLinkImport = (): FakeLinkImport => {
    const fake: FakeLinkImport = {
        runCalls: [],
        stageCalls: [],
        loadCalls: [],
        nextRun: () => Promise.resolve(buildResult()),
        nextStaged: [],
        nextSkipped: [],
        nextBody: {
            body: JPEG_BYTES.buffer as ArrayBuffer,
            contentType: 'image/jpeg'
        },
        run(_deps, request) {
            fake.runCalls.push(request);

            return fake.nextRun();
        },
        stageImages(_deps, input) {
            fake.stageCalls.push(input);

            return Promise.resolve({
                staged: fake.nextStaged,
                skipped: fake.nextSkipped
            });
        },
        loadStagedImage(_deps, input) {
            fake.loadCalls.push(input);

            return Promise.resolve(fake.nextBody);
        },
        toImportedDraft(product, link) {
            const ownCurrency =
                product !== null &&
                product.price !== null &&
                isOwnCurrency(product.currency);
            const sourcePrice =
                product !== null &&
                product.price !== null &&
                product.currency !== null &&
                !ownCurrency
                    ? { amount: product.price, currency: product.currency }
                    : null;

            return {
                title: product?.title ?? null,
                description: product?.description ?? null,
                link,
                price: ownCurrency ? (product?.price ?? null) : null,
                currency: ownCurrency
                    ? (CURRENCIES.find(currency => {
                          return currency === product?.currency;
                      }) ?? null)
                    : null,
                sourcePrice
            };
        }
    };

    return fake;
};

interface FakeTelegram extends TelegramApi {
    sendPhotoCalls: { chatId: number | string; size: number; type: string }[];
    deleteCalls: { chatId: number | string; messageId: number }[];
    nextFileIds: string[];
    failWith: TelegramApiError | null;
}

const createFakeTelegram = (): FakeTelegram => {
    const fake: FakeTelegram = {
        sendPhotoCalls: [],
        deleteCalls: [],
        nextFileIds: [],
        failWith: null,
        async sendMessage() {
            return { message_id: 1 } as never;
        },
        async sendPhoto(chatId, photo) {
            if (fake.failWith) {
                throw fake.failWith;
            }

            fake.sendPhotoCalls.push({
                chatId,
                size: photo.size,
                type: photo.type
            });

            const fileId =
                fake.nextFileIds.shift() ??
                `large-${fake.sendPhotoCalls.length}`;

            return {
                message_id: SENT_MESSAGE_ID,
                photo: [
                    { file_id: `${fileId}-small`, width: 90, height: 90 },
                    { file_id: fileId, width: 1280, height: 1280 }
                ]
            } as unknown as SentPhotoMessage;
        },
        async sendMediaGroup() {
            throw new Error('unexpected sendMediaGroup');
        },
        async deleteMessage(chatId, messageId) {
            fake.deleteCalls.push({ chatId, messageId });

            return true;
        },
        async getFile() {
            throw new Error('unexpected getFile');
        },
        async downloadFile() {
            throw new Error('unexpected downloadFile');
        }
    };

    return fake;
};

const telegramError = (errorCode: number) => {
    return new TelegramApiError('sendPhoto', {
        error_code: errorCode,
        description: 'Forbidden: bot was blocked by the user'
    });
};

describe('Mini App link import endpoints', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];
    let telegram: FakeTelegram;
    let linkImport: FakeLinkImport;
    let enabled: boolean;
    let limiterAllows: boolean;
    let consoleOutput: string[];
    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };
    const originalSetTimeout = globalThis.setTimeout;

    const restoreConsole = () => {
        Object.assign(console, originalConsole);
    };

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            MINI_APP_ENABLED: 'true',
            LINK_IMPORT_ENABLED: enabled ? 'true' : 'false',
            ADMIN_ID: '1',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            APP_IMPORT_LIMITER: undefined,
            IMAGE_PROXY_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const request = (
        path: string,
        init: {
            method?: string;
            user?: InitDataUserFixture;
            body?: unknown;
        } = {}
    ) => {
        const deps = {
            now: () => NOW,
            crypto: createNodeApiCrypto(),
            createTelegramApi: () => telegram,
            linkImport,
            selectLimiter: (_env: unknown, bucket: string) => {
                return bucket === 'import' && !limiterAllows
                    ? { limit: () => Promise.resolve({ success: false }) }
                    : null;
            },
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };
        const app = createApp({}, {}, {}, deps, deps);
        const headers = new Headers({
            'cf-connecting-ip': CLIENT_IP,
            'Content-Type': 'application/json',
            Authorization: `tma ${createSignedInitData({
                user: init.user ?? OWNER,
                authDate: NOW_SECONDS
            })}`
        });

        return app.request(
            path,
            {
                method: init.method ?? 'POST',
                headers,
                ...(init.body === undefined
                    ? {}
                    : { body: JSON.stringify(init.body) })
            },
            buildEnv()
        );
    };

    const importLink = (
        body: unknown = { url: SHOP_PAGE },
        user: InitDataUserFixture = OWNER
    ) => {
        return request('/api/app/link-import', { user, body });
    };

    const importImage = (
        wishId: number,
        body: unknown,
        user: InitDataUserFixture = OWNER
    ) => {
        return request(`/api/app/wishes/${wishId}/images/import`, {
            user,
            body
        });
    };

    const readError = async (response: Response) => {
        return ((await response.json()) as ApiErrorBody).error;
    };

    const readFields = async (response: Response) => {
        return (await readError(response)).fields;
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

    const seedWish = async (telegramId = OWNER_TELEGRAM_ID) => {
        const user = await run(
            harness.repositories.users.findByTelegramId(telegramId)
        );

        assert.ok(user);

        const wish = await run(
            harness.repositories.wishes.create(user.id, 'Camera', 'UAH', NOW)
        );

        assert.ok(wish);

        return { user, wish };
    };

    const storedImages = async (wishId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT images FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{ images: string }>();

        return JSON.parse(row?.images ?? '[]') as string[];
    };

    const importedToken = async (user: InitDataUserFixture = OWNER) => {
        const response = await importLink(undefined, user);
        const body = (await response.json()) as LinkImportDto;

        assert.ok(body.importToken);

        return body.importToken;
    };

    const createSigner = () => {
        return createImportSigner({
            botToken: TEST_BOT_TOKEN,
            environment: 'production',
            crypto: createNodeApiCrypto()
        });
    };

    const completedEvents = () => {
        return events.filter(event => {
            return event.event === 'link_import_completed';
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
        telegram = createFakeTelegram();
        linkImport = createFakeLinkImport();
        enabled = true;
        limiterAllows = true;
        consoleOutput = [];
        await harness.clearApplicationTables();
        await createUser(OWNER_TELEGRAM_ID, 'owner_user');
        await createUser(OTHER_TELEGRAM_ID, 'other_user');

        for (const method of ['log', 'info', 'warn', 'error'] as const) {
            console[method] = (...args: unknown[]) => {
                consoleOutput.push(args.map(String).join(' '));
            };
        }
    });

    afterEach(() => {
        restoreConsole();
        globalThis.setTimeout = originalSetTimeout;
    });

    describe('POST /link-import', () => {
        it('maps an ok result to the DTO with signed preview URLs and a token', async () => {
            const response = await importLink();
            const body = (await response.json()) as LinkImportDto;

            restoreConsole();
            assert.equal(response.status, 200);
            assert.deepEqual(linkImport.runCalls, [
                { url: SHOP_PAGE, channel: 'app' }
            ]);
            assert.equal(body.outcome, 'ok');
            assert.equal(body.source, 'jsonld');
            assert.deepEqual(body.draft, {
                title: SHOP_TITLE,
                description: 'Compact camera',
                link: SHOP_PAGE,
                price: 1699,
                currency: 'EUR'
            });
            assert.equal(body.sourcePrice, null);
            assert.equal(body.images.length, 7);
            assert.deepEqual(
                body.images.map(image => {
                    return image.index;
                }),
                [0, 1, 2, 3, 4, 5, 6]
            );

            for (const image of body.images) {
                assert.match(
                    image.url,
                    new RegExp(
                        `^/img/i/${URL_HASH}/${image.index}\\?e=\\d+&s=[\\w-]{43}$`
                    )
                );

                const query = new URL(image.url, 'https://app.test')
                    .searchParams;
                const verified = await createSigner().verifyImportImage(
                    { urlHash: URL_HASH, index: image.index },
                    {
                        expiresAt: Number(query.get('e')),
                        signature: query.get('s') ?? ''
                    },
                    NOW
                );

                assert.deepEqual(verified, { ok: true });
            }

            const verifiedToken = await createSigner().verifyImportToken(
                body.importToken ?? '',
                NOW
            );

            assert.equal(verifiedToken.ok, true);
            assert.equal(
                verifiedToken.ok && verifiedToken.claims.urlHash,
                URL_HASH
            );
            assert.equal(
                verifiedToken.ok && verifiedToken.claims.expiresAt,
                NOW_SECONDS + TOKEN_TTL_SECONDS
            );
        });

        it('pre-stages the preselected images and emits one completed event with labels only', async () => {
            linkImport.nextStaged = Array.from(
                { length: LINK_IMPORT_PRESELECTED_IMAGES },
                (_, index) => {
                    return {
                        index,
                        contentType: 'image/jpeg',
                        bytes: 1000
                    };
                }
            );
            linkImport.nextSkipped = [
                { index: 5, reason: 'unsupportedFormat' }
            ];

            await importLink();
            restoreConsole();

            assert.equal(linkImport.stageCalls.length, 1);
            assert.equal(linkImport.stageCalls[0]?.urlHash, URL_HASH);
            assert.deepEqual(
                linkImport.stageCalls[0]?.indexes,
                [0, 1, 2, 3, 4]
            );
            assert.equal(linkImport.stageCalls[0]?.imageUrls.length, 7);

            const completed = completedEvents();

            assert.equal(completed.length, 1);
            assert.deepEqual(completed[0], {
                event: 'link_import_completed',
                path: '/api/app',
                outcome: 'success',
                channel: 'app',
                result: 'ok',
                source: 'jsonld',
                shop: 'rozetka',
                cacheOutcome: 'miss',
                imagesStaged: 'fivePlus',
                imagesSkipped: 'oneToFour',
                imagesIngested: 'none',
                elapsedBucket: 'quick'
            });
            assert.equal(
                JSON.stringify(events).includes('rozetka.com.ua'),
                false
            );
            assert.equal(JSON.stringify(events).includes('camera'), false);
            assert.equal(consoleOutput.join('\n').includes('camera'), false);
        });

        it('keeps a price in a foreign currency as sourcePrice and leaves the draft price empty', async () => {
            linkImport.nextRun = () => {
                return Promise.resolve(
                    buildResult({
                        product: buildProduct({ price: 49, currency: 'GBP' })
                    })
                );
            };

            const body = (await (await importLink()).json()) as LinkImportDto;

            restoreConsole();
            assert.equal(body.draft.price, null);
            assert.equal(body.draft.currency, null);
            assert.deepEqual(body.sourcePrice, { amount: 49, currency: 'GBP' });
        });

        it('returns the link only, no token and no images, when nothing was extracted', async () => {
            linkImport.nextRun = () => {
                return Promise.resolve(
                    buildResult({
                        outcome: 'blocked',
                        product: null,
                        urlHash: URL_HASH
                    })
                );
            };

            const response = await importLink();
            const body = (await response.json()) as LinkImportDto;

            restoreConsole();
            assert.equal(response.status, 200);
            assert.deepEqual(body, {
                outcome: 'blocked',
                source: null,
                importToken: null,
                draft: {
                    title: null,
                    description: null,
                    link: SHOP_PAGE,
                    price: null,
                    currency: null
                },
                sourcePrice: null,
                images: []
            });
            assert.deepEqual(linkImport.stageCalls, []);
            assert.equal(completedEvents()[0]?.outcome, 'rejected');
            assert.equal(completedEvents()[0]?.imagesStaged, 'none');
        });

        it('returns a partial result with images and a token', async () => {
            linkImport.nextRun = () => {
                return Promise.resolve(
                    buildResult({
                        outcome: 'partial',
                        product: buildProduct({
                            price: null,
                            currency: null,
                            source: 'og',
                            images: [`${SHOP_FINAL}one.jpg`]
                        })
                    })
                );
            };

            const body = (await (await importLink()).json()) as LinkImportDto;

            restoreConsole();
            assert.equal(body.outcome, 'partial');
            assert.equal(body.source, 'og');
            assert.equal(body.draft.price, null);
            assert.equal(body.images.length, 1);
            assert.ok(body.importToken);
        });

        it('passes a host-limiter refusal through as the rateLimited outcome', async () => {
            linkImport.nextRun = () => {
                return Promise.resolve(
                    buildResult({ outcome: 'rateLimited', product: null })
                );
            };

            const response = await importLink();
            const body = (await response.json()) as LinkImportDto;

            restoreConsole();
            assert.equal(response.status, 200);
            assert.equal(body.outcome, 'rateLimited');
            assert.equal(body.importToken, null);
        });

        it('answers disabled while the kill switch is off and never calls the service', async () => {
            enabled = false;

            const response = await importLink();

            restoreConsole();
            assert.equal(response.status, 503);
            assert.deepEqual(await readError(response), { code: 'disabled' });
            assert.deepEqual(linkImport.runCalls, []);
        });

        it('rejects links that are missing, not a string or not http(s) with a 422 on url', async () => {
            const bodies = [
                {},
                { url: 42 },
                { url: '' },
                { url: 'not a link' },
                { url: 'ftp://rozetka.com.ua/p' },
                { url: 'javascript:alert(1)' },
                { url: `https://rozetka.com.ua/${'a'.repeat(3000)}` }
            ];

            for (const body of bodies) {
                const response = await importLink(body);

                assert.equal(response.status, 422, JSON.stringify(body));
                assert.ok((await readFields(response))?.['url']);
            }

            restoreConsole();
            assert.deepEqual(linkImport.runCalls, []);
        });

        it('maps the invalidUrl outcome to a 422 on url', async () => {
            linkImport.nextRun = () => {
                return Promise.resolve(
                    buildResult({
                        outcome: 'invalidUrl',
                        product: null,
                        urlHash: null
                    })
                );
            };

            const response = await importLink({ url: 'https://localhost/x' });

            restoreConsole();
            assert.equal(response.status, 422);
            assert.deepEqual(await readFields(response), { url: 'invalid' });
            assert.equal(completedEvents()[0]?.outcome, 'rejected');
        });

        it('rejects with 429 on the user import limiter before the service runs', async () => {
            limiterAllows = false;

            const response = await importLink();

            restoreConsole();
            assert.equal(response.status, 429);
            assert.deepEqual(await readError(response), {
                code: 'rateLimited',
                retryAfter: 60
            });
            assert.deepEqual(linkImport.runCalls, []);
        });

        it('answers timeout once the handler budget is spent and lets the service finish in the background', async () => {
            let release: (result: LinkImportResult) => void = () => undefined;

            linkImport.nextRun = () => {
                return new Promise<LinkImportResult>(resolve => {
                    release = resolve;
                });
            };
            globalThis.setTimeout = ((handler: () => void, delay?: number) => {
                return originalSetTimeout(
                    handler,
                    delay === LINK_IMPORT_HANDLER_BUDGET_MS ? 0 : delay
                );
            }) as unknown as typeof setTimeout;

            const response = await importLink();
            const body = (await response.json()) as LinkImportDto;

            release(buildResult());
            restoreConsole();
            assert.equal(response.status, 200);
            assert.equal(body.outcome, 'timeout');
            assert.equal(body.importToken, null);
            assert.deepEqual(body.images, []);
            assert.equal(body.draft.link, SHOP_PAGE);
            assert.equal(completedEvents()[0]?.result, 'timeout');
            assert.equal(completedEvents()[0]?.shop, 'rozetka');
        });
    });

    describe('POST /wishes/:id/images/import', () => {
        const importOnce = async (
            wishId: number,
            index = 0,
            user: InitDataUserFixture = OWNER
        ) => {
            return importImage(
                wishId,
                { importToken: await importedToken(user), index },
                user
            );
        };

        const seedImages = async (
            userId: number,
            wishId: number,
            fileIds: string[]
        ) => {
            for (const fileId of fileIds) {
                await run(
                    harness.repositories.wishes.appendImage(
                        wishId,
                        userId,
                        fileId,
                        NOW
                    )
                );
            }
        };

        const eventResults = () => {
            return events
                .filter(event => {
                    return event.event === 'app_photo_uploaded';
                })
                .map(event => {
                    return event.result;
                });
        };

        it('sends the staged bytes through Telegram, stores the largest file id and deletes the carrier message', async () => {
            const { wish } = await seedWish();
            telegram.nextFileIds = ['AgAD-imported'];

            const response = await importOnce(wish.id, 2);
            const body = (await response.json()) as OwnWishDto;

            restoreConsole();
            assert.equal(response.status, 200);
            assert.deepEqual(linkImport.loadCalls, [
                { urlHash: URL_HASH, index: 2 }
            ]);
            assert.deepEqual(telegram.sendPhotoCalls, [
                {
                    chatId: OWNER_TELEGRAM_ID,
                    size: JPEG_BYTES.byteLength,
                    type: 'image/jpeg'
                }
            ]);
            assert.deepEqual(telegram.deleteCalls, [
                { chatId: OWNER_TELEGRAM_ID, messageId: SENT_MESSAGE_ID }
            ]);
            assert.deepEqual(await storedImages(wish.id), ['AgAD-imported']);
            assert.equal(body.images.length, 1);
            assert.deepEqual(eventResults(), ['appended']);
        });

        it('treats the same Telegram file twice as a duplicate and still answers 200', async () => {
            const { wish } = await seedWish();
            telegram.nextFileIds = ['AgAD-same', 'AgAD-same'];

            const first = await importOnce(wish.id, 0);
            const second = await importOnce(wish.id, 1);

            restoreConsole();
            assert.equal(first.status, 200);
            assert.equal(second.status, 200);
            assert.deepEqual(await storedImages(wish.id), ['AgAD-same']);
            assert.deepEqual(eventResults(), ['appended', 'duplicate']);
        });

        it('answers imagesFull before touching the staged image or Telegram', async () => {
            const { user, wish } = await seedWish();

            await seedImages(
                user.id,
                wish.id,
                Array.from({ length: APP_MAX_WISH_IMAGES }, (_, index) => {
                    return `seed-${index}`;
                })
            );

            const response = await importOnce(wish.id);

            restoreConsole();
            assert.equal(response.status, 409);
            assert.deepEqual(await readError(response), { code: 'imagesFull' });
            assert.deepEqual(linkImport.loadCalls, []);
            assert.deepEqual(telegram.sendPhotoCalls, []);
            assert.deepEqual(eventResults(), ['full']);
        });

        it('maps a Telegram 403 to writeAccessRequired', async () => {
            const { wish } = await seedWish();
            telegram.failWith = telegramError(403);

            const response = await importOnce(wish.id);

            restoreConsole();
            assert.equal(response.status, 409);
            assert.deepEqual(await readError(response), {
                code: 'writeAccessRequired'
            });
            assert.deepEqual(await storedImages(wish.id), []);
            assert.deepEqual(eventResults(), ['writeAccessRequired']);
        });

        it('maps other Telegram failures to 502 upstream', async () => {
            const { wish } = await seedWish();
            telegram.failWith = telegramError(500);

            const response = await importOnce(wish.id);

            restoreConsole();
            assert.equal(response.status, 502);
            assert.deepEqual(await readError(response), { code: 'upstream' });
            assert.deepEqual(eventResults(), ['telegramError']);
        });

        it('answers 404 for a wish of another user and for a missing wish', async () => {
            const { wish } = await seedWish(OTHER_TELEGRAM_ID);
            const token = await importedToken();

            const foreign = await importImage(wish.id, {
                importToken: token,
                index: 0
            });
            const missing = await importImage(999_999, {
                importToken: token,
                index: 0
            });

            restoreConsole();
            assert.equal(foreign.status, 404);
            assert.equal(missing.status, 404);
            assert.deepEqual(linkImport.loadCalls, []);
            assert.deepEqual(telegram.sendPhotoCalls, []);
        });

        it('rejects a token minted for another user', async () => {
            const { wish } = await seedWish();
            const foreignToken = await importedToken(OTHER);

            const response = await importImage(wish.id, {
                importToken: foreignToken,
                index: 0
            });

            restoreConsole();
            assert.equal(response.status, 422);
            assert.deepEqual(await readFields(response), {
                importToken: 'invalid'
            });
            assert.deepEqual(linkImport.loadCalls, []);
        });

        it('rejects tampered, malformed and expired tokens', async () => {
            const { user, wish } = await seedWish();
            const valid = await importedToken();
            const parts = valid.split('.');
            const tampered = [
                parts[0],
                'b'.repeat(32),
                parts[2],
                parts[3]
            ].join('.');
            const flippedSignature = `${valid.slice(0, -1)}${
                valid.endsWith('A') ? 'B' : 'A'
            }`;
            const expired = await createSigner().mintImportToken({
                userId: user.id,
                urlHash: URL_HASH,
                now: new Date(NOW.getTime() - 3 * ONE_HOUR_SECONDS * 1000)
            });

            for (const importToken of [
                tampered,
                flippedSignature,
                expired,
                'garbage',
                `${valid}.extra`
            ]) {
                const response = await importImage(wish.id, {
                    importToken,
                    index: 0
                });

                assert.equal(response.status, 422, importToken);
                assert.deepEqual(await readFields(response), {
                    importToken: 'invalid'
                });
            }

            restoreConsole();
            assert.deepEqual(linkImport.loadCalls, []);
            assert.deepEqual(telegram.sendPhotoCalls, []);
        });

        it('validates the body fields', async () => {
            const { wish } = await seedWish();
            const importToken = await importedToken();
            const cases: [unknown, Record<string, string>][] = [
                [{}, { importToken: 'required', index: 'required' }],
                [{ importToken }, { index: 'required' }],
                [{ importToken, index: -1 }, { index: 'invalid' }],
                [{ importToken, index: 9 }, { index: 'invalid' }],
                [{ importToken, index: 1.5 }, { index: 'invalid' }],
                [{ importToken, index: '1' }, { index: 'invalid' }],
                [{ importToken: 7, index: 0 }, { importToken: 'invalid' }],
                [
                    { importToken: 'x'.repeat(500), index: 0 },
                    { importToken: 'tooLong' }
                ]
            ];

            for (const [body, fields] of cases) {
                const response = await importImage(wish.id, body);

                assert.equal(response.status, 422, JSON.stringify(body));
                assert.deepEqual(await readFields(response), fields);
            }

            restoreConsole();
            assert.deepEqual(linkImport.loadCalls, []);
        });

        it('answers 502 when the staged image cannot be produced', async () => {
            const { wish } = await seedWish();
            linkImport.nextBody = { skipped: 'failed' };

            const response = await importOnce(wish.id);

            restoreConsole();
            assert.equal(response.status, 502);
            assert.deepEqual(await readError(response), { code: 'upstream' });
            assert.deepEqual(telegram.sendPhotoCalls, []);
            assert.deepEqual(eventResults(), ['telegramError']);
        });

        it('answers 415 when the image is in a format Telegram does not take', async () => {
            const { wish } = await seedWish();
            linkImport.nextBody = { skipped: 'unsupportedFormat' };

            const response = await importOnce(wish.id);

            restoreConsole();
            assert.equal(response.status, 415);
            assert.deepEqual(await readError(response), {
                code: 'unsupportedMedia'
            });
            assert.deepEqual(telegram.sendPhotoCalls, []);
            assert.deepEqual(eventResults(), ['unsupported']);
        });

        it('answers 415 when Telegram refuses the imported photo', async () => {
            const { wish } = await seedWish();
            telegram.failWith = telegramError(400);

            const response = await importOnce(wish.id);

            restoreConsole();
            assert.equal(response.status, 415);
            assert.deepEqual(await readError(response), {
                code: 'unsupportedMedia'
            });
            assert.deepEqual(await storedImages(wish.id), []);
            assert.deepEqual(eventResults(), ['unsupported']);
        });

        it('rejects staged bytes whose signature does not match the declared type', async () => {
            const { wish } = await seedWish();
            linkImport.nextBody = {
                body: GIF_BYTES.buffer as ArrayBuffer,
                contentType: 'image/jpeg'
            };

            const response = await importOnce(wish.id);

            restoreConsole();
            assert.equal(response.status, 415);
            assert.deepEqual(telegram.sendPhotoCalls, []);
            assert.deepEqual(eventResults(), ['unsupported']);
        });

        it('answers disabled while the kill switch is off', async () => {
            const { wish } = await seedWish();
            const importToken = await importedToken();

            enabled = false;

            const response = await importImage(wish.id, {
                importToken,
                index: 0
            });

            restoreConsole();
            assert.equal(response.status, 503);
            assert.deepEqual(await readError(response), { code: 'disabled' });
            assert.deepEqual(linkImport.loadCalls, []);
        });
    });
});
