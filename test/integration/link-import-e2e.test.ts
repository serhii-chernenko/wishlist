import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';
import type { Update } from 'telegraf/types';

import { getMessages } from '../../src/bot/content/messages';
import { createWishlistBot } from '../../src/bot/telegraf/bot';
import { extractProduct } from '../../src/bot/services/link-import/extract';
import type { LinkImportServiceSet } from '../../src/bot/services/link-import/link-import-service';
import type { PageSignals } from '../../src/bot/services/link-import/types';
import type {
    ApiErrorBody,
    LinkImportDto,
    OwnWishDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import { createWorkerLinkImport } from '../../src/worker/link-import';
import { handleUpdateWithWishlistBot } from '../../src/worker/routes/telegram';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import {
    AVIF_BYTES,
    JPEG_BYTES,
    padBytes,
    PNG_BYTES
} from '../fixtures/link-import-fakes';
import { createTestUser } from '../fixtures/telegram';
import { createD1Harness, type D1Harness } from './d1-harness';
import {
    BOT_TOKEN,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

const FIXTURE_DIRECTORY = path.resolve(
    process.cwd(),
    'test/fixtures/link-import'
);
const ROZETKA_URL =
    'https://rozetka.com.ua/ua/apple-iphone-15-128gb-black/p395460480/';
const ROZETKA_TITLE =
    'Мобільний телефон Apple iPhone 15 128GB Black (MTP03RX/A)';
const ROZETKA_PRICE = 44499;
const UNSUPPORTED_IMAGE_INDEX = 1;
const PHOTO_SIZE_BYTES = 2048;
const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';
const NOW = new Date('2026-10-04T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const CLIENT_IP = '198.51.100.21';

const OWNER: InitDataUserFixture = {
    id: 7_001,
    first_name: 'Owner',
    username: 'owner_e2e',
    language_code: 'en'
};

const readFixtureHtml = () => {
    return fs.readFileSync(path.join(FIXTURE_DIRECTORY, 'rozetka.html'));
};

const readFixtureSignals = (): PageSignals => {
    return JSON.parse(
        fs.readFileSync(
            path.join(FIXTURE_DIRECTORY, 'signals/rozetka.json'),
            'utf8'
        )
    ) as PageSignals;
};

/**
 * HTMLRewriter exists only in workerd, so Node tests replay the collector's
 * recorded output for the same fixture page; every other stage is the real one.
 */
const createFixtureServices = () => {
    return createWorkerLinkImport({
        collectPageSignals: async response => {
            await response.arrayBuffer();

            return readFixtureSignals();
        }
    });
};

interface NetworkLog {
    pages: string[];
    images: string[];
    telegram: { method: string; body: unknown }[];
}

const isImageHost = (hostname: string) => {
    return /^content\d?\.rozetka\.com\.ua$/.test(hostname);
};

const imageIndexOf = (url: URL, imageUrls: readonly string[]) => {
    return imageUrls.indexOf(url.href);
};

const shopImageResponse = (index: number) => {
    if (index === UNSUPPORTED_IMAGE_INDEX) {
        return new Response(AVIF_BYTES.slice(), {
            headers: { 'content-type': 'image/avif' }
        });
    }

    const bytes = index % 2 === 0 ? JPEG_BYTES : PNG_BYTES;

    return new Response(padBytes(bytes, PHOTO_SIZE_BYTES).slice(), {
        headers: {
            'content-type': index % 2 === 0 ? 'image/jpeg' : 'image/png'
        }
    });
};

const photoMessage = (messageId: number, fileId: string) => {
    return {
        message_id: messageId,
        date: NOW_SECONDS,
        chat: { id: OWNER.id, type: 'private' },
        photo: [
            {
                file_id: `${fileId}-small`,
                file_unique_id: `${fileId}-s`,
                width: 90,
                height: 90
            },
            {
                file_id: fileId,
                file_unique_id: fileId,
                width: 1280,
                height: 1280
            }
        ]
    };
};

const readTelegramBody = async (init: RequestInit | undefined) => {
    const { body } = init ?? {};

    if (body instanceof FormData) {
        return Object.fromEntries(
            [...body.entries()].filter(([, value]) => {
                return typeof value === 'string';
            })
        );
    }

    return typeof body === 'string' ? JSON.parse(body) : null;
};

const createTelegramResponder = () => {
    let messageId = 500;
    let photoCount = 0;

    return (method: string, body: Record<string, unknown> | null) => {
        messageId += 1;

        if (method === 'sendPhoto') {
            photoCount += 1;

            return photoMessage(messageId, `tg-photo-${photoCount}`);
        }

        if (method === 'sendMediaGroup') {
            const media = JSON.parse(String(body?.['media'] ?? '[]')) as {
                media: string;
            }[];

            return media.map(() => {
                photoCount += 1;
                messageId += 1;

                return photoMessage(messageId, `tg-photo-${photoCount}`);
            });
        }

        if (method === 'deleteMessage') {
            return true;
        }

        return {
            message_id: messageId,
            date: NOW_SECONDS,
            chat: { id: OWNER.id, type: 'private' },
            text: ''
        };
    };
};

/** The only fake: the network itself, answering shop, CDN and Telegram Bot API requests. */
const installNetwork = (log: NetworkLog, imageUrls: readonly string[]) => {
    const original = globalThis.fetch;
    const respondTelegram = createTelegramResponder();
    const html = readFixtureHtml();

    globalThis.fetch = (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit
    ) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input)
        );

        if (url.origin === TELEGRAM_API_ORIGIN) {
            const method = url.pathname.split('/').at(-1) ?? '';
            const body = await readTelegramBody(init);

            log.telegram.push({ method, body });

            return Response.json({
                ok: true,
                result: respondTelegram(method, body)
            });
        }

        if (url.hostname === 'rozetka.com.ua') {
            log.pages.push(url.href);

            return new Response(html, {
                headers: { 'content-type': 'text/html; charset=utf-8' }
            });
        }

        if (isImageHost(url.hostname)) {
            log.images.push(url.href);

            return shopImageResponse(imageIndexOf(url, imageUrls));
        }

        throw new Error(`Unexpected network call in tests: ${url.host}`);
    }) as typeof fetch;

    return () => {
        globalThis.fetch = original;
    };
};

const ROZETKA_IMAGES =
    extractProduct(readFixtureSignals(), ROZETKA_URL)?.images ?? [];

describe('link import end to end in the Mini App', () => {
    let harness: D1Harness;
    let services: LinkImportServiceSet;
    let log: NetworkLog;
    let events: TelemetryFields[];
    let restoreNetwork: () => void;

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            ADMIN_ID: '1',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            APP_IMPORT_LIMITER: undefined,
            LINK_HOST_LIMITER: undefined,
            IMAGE_PROXY_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const createWiredApp = () => {
        const deps = {
            now: () => NOW,
            crypto: createNodeApiCrypto(),
            linkImport: services,
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };

        return createApp({}, {}, {}, deps, deps);
    };

    const callApi = (
        apiPath: string,
        init: { method?: string; body?: unknown } = {}
    ) => {
        return createWiredApp().request(
            `/api/app${apiPath}`,
            {
                method: init.method ?? 'POST',
                headers: {
                    'cf-connecting-ip': CLIENT_IP,
                    'Content-Type': 'application/json',
                    Authorization: `tma ${createSignedInitData({
                        user: OWNER,
                        authDate: NOW_SECONDS
                    })}`
                },
                ...(init.body === undefined
                    ? {}
                    : { body: JSON.stringify(init.body) })
            },
            buildEnv()
        );
    };

    const fetchPreview = (previewUrl: string) => {
        return createWiredApp().request(
            previewUrl,
            { headers: { 'cf-connecting-ip': CLIENT_IP } },
            buildEnv()
        );
    };

    const storedImages = async (wishId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT images FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{ images: string }>();

        return JSON.parse(row?.images ?? '[]') as string[];
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
        await Effect.runPromise(
            harness.repositories.users.create({
                telegramId: OWNER.id,
                username: OWNER.username ?? 'owner',
                usernameSearchable: true,
                createdAt: NOW
            })
        );
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(() => {
        services = createFixtureServices();
        log = { pages: [], images: [], telegram: [] };
        events = [];
        restoreNetwork = installNetwork(log, ROZETKA_IMAGES);
    });

    afterEach(() => {
        restoreNetwork();
    });

    it('imports a link, previews staged photos, saves the wish and stores Telegram file ids', async () => {
        const imported = await callApi('/link-import', {
            body: { url: `${ROZETKA_URL}?utm_source=telegram` }
        });
        const dto = (await imported.json()) as LinkImportDto;

        assert.equal(imported.status, 200);
        assert.equal(dto.outcome, 'ok');
        assert.equal(dto.source, 'jsonld');
        assert.equal(dto.draft.title, ROZETKA_TITLE);
        assert.equal(dto.draft.price, ROZETKA_PRICE);
        assert.equal(dto.draft.currency, 'UAH');
        assert.equal(dto.images.length, ROZETKA_IMAGES.length);
        assert.ok(dto.importToken);
        assert.deepEqual(log.pages, [ROZETKA_URL]);
        assert.equal(log.images.length, 5);

        for (const image of dto.images) {
            assert.equal(image.url.includes('rozetka'), false);
        }

        const stagedPreview = await fetchPreview(dto.images[0]?.url ?? '');

        assert.equal(stagedPreview.status, 200);
        assert.equal(stagedPreview.headers.get('Content-Type'), 'image/jpeg');
        assert.equal(log.images.length, 5);

        const restagedPreview = await fetchPreview(dto.images[6]?.url ?? '');

        assert.equal(restagedPreview.status, 200);
        assert.equal(restagedPreview.headers.get('Content-Type'), 'image/jpeg');
        assert.equal(log.images.length, 6);

        const unsupportedPreview = await fetchPreview(
            dto.images[UNSUPPORTED_IMAGE_INDEX]?.url ?? ''
        );

        assert.equal(
            unsupportedPreview.headers.get('Content-Type'),
            'image/svg+xml'
        );

        const created = await callApi('/wishes', {
            body: {
                title: dto.draft.title,
                description: dto.draft.description,
                link: dto.draft.link,
                price: dto.draft.price,
                currency: dto.draft.currency
            }
        });
        const wish = (await created.json()) as OwnWishDto;

        assert.equal(created.status, 201);

        const first = await callApi(`/wishes/${wish.id}/images/import`, {
            body: { importToken: dto.importToken, index: 0 }
        });

        assert.equal(first.status, 200);
        assert.deepEqual(await storedImages(wish.id), ['tg-photo-1']);

        const unsupported = await callApi(`/wishes/${wish.id}/images/import`, {
            body: {
                importToken: dto.importToken,
                index: UNSUPPORTED_IMAGE_INDEX
            }
        });

        assert.equal(unsupported.status, 415);
        assert.deepEqual(((await unsupported.json()) as ApiErrorBody).error, {
            code: 'unsupportedMedia'
        });

        const second = await callApi(`/wishes/${wish.id}/images/import`, {
            body: { importToken: dto.importToken, index: 2 }
        });
        const saved = (await second.json()) as OwnWishDto;

        assert.equal(second.status, 200);
        assert.equal(saved.images.length, 2);
        assert.deepEqual(await storedImages(wish.id), [
            'tg-photo-1',
            'tg-photo-2'
        ]);
        assert.deepEqual(
            log.telegram.map(call => {
                return call.method;
            }),
            ['sendPhoto', 'deleteMessage', 'sendPhoto', 'deleteMessage']
        );

        const completed = events.filter(event => {
            return event.event === 'link_import_completed';
        });

        assert.equal(completed.length, 1);
        assert.equal(completed[0]?.imagesStaged, 'oneToFour');
        assert.equal(completed[0]?.imagesSkipped, 'oneToFour');

        const serializedEvents = JSON.stringify(events);

        assert.equal(serializedEvents.includes('rozetka.com.ua'), false);
        assert.equal(serializedEvents.includes('iPhone'), false);
        assert.equal(serializedEvents.includes(String(ROZETKA_PRICE)), false);
    });
});

describe('link import end to end in the bot', () => {
    const LL = getMessages('uk');
    const BOT_KEY = 'link-import-e2e';
    const alice = createTestUser(7_101, {
        first_name: 'Alice',
        username: 'alice_e2e'
    });
    let webhook: WebhookHarness;
    let log: NetworkLog;
    let restoreNetwork: () => void;
    let pendingTasks: Promise<unknown>[];

    const deliver = async (update: Update) => {
        const env = {
            ...webhook.d1.env,
            BOT_TOKEN,
            BOT_ENVIRONMENT: 'local',
            APP_IMPORT_LIMITER: undefined,
            LINK_HOST_LIMITER: undefined
        } as unknown as WorkerBindings;

        await handleUpdateWithWishlistBot(
            env,
            update,
            BOT_KEY,
            (botEnv, deps) => {
                return createWishlistBot(botEnv, {
                    ...deps,
                    sleep: () => {
                        return Promise.resolve();
                    }
                });
            },
            {
                waitUntil(promise) {
                    pendingTasks.push(promise);
                }
            },
            undefined,
            createFixtureServices()
        );

        while (pendingTasks.length > 0) {
            await Promise.all(pendingTasks.splice(0));
        }
    };

    before(async () => {
        webhook = await createWebhookHarness();
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();
        await webhook.registerUser(alice);
        pendingTasks = [];
        log = { pages: [], images: [], telegram: [] };
        restoreNetwork = installNetwork(log, ROZETKA_IMAGES);
    });

    afterEach(() => {
        restoreNetwork();
    });

    it('turns a bare link into a wish with an album preview and notes the unsupported photo', async () => {
        await deliver(webhook.builders.callback(alice, 'n:add'));

        assert.equal(
            webhook.lastMessage().text,
            LL.wishlist.add.import.prompt({ max: 200 })
        );

        await deliver(webhook.builders.message(alice, ROZETKA_URL));

        const wishes = await webhook.queryAll<{
            title: string;
            link: string;
            price: number;
            currency: string;
            images: string;
        }>('SELECT title, link, price, currency, images FROM wishes');

        assert.equal(wishes.length, 1);
        assert.equal(wishes[0]?.title, ROZETKA_TITLE);
        assert.equal(wishes[0]?.link, ROZETKA_URL);
        assert.equal(wishes[0]?.price, ROZETKA_PRICE);
        assert.equal(wishes[0]?.currency, 'UAH');
        assert.deepEqual(JSON.parse(wishes[0]?.images ?? '[]'), [
            'tg-photo-1',
            'tg-photo-2',
            'tg-photo-3',
            'tg-photo-4'
        ]);
        assert.deepEqual(log.pages, [ROZETKA_URL]);
        assert.equal(log.images.length, 5);
        assert.deepEqual(
            log.telegram.map(call => {
                return call.method;
            }),
            ['sendMediaGroup', 'sendMessage']
        );

        const texts = webhook.messageTexts();

        assert.ok(texts.includes(LL.wishlist.add.import.searching()));
        assert.ok(
            webhook
                .lastMessage()
                .text.includes(LL.wishlist.add.import.photosUnsupported())
        );
    });
});
