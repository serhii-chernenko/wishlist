import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';
import type { Update } from 'telegraf/types';

import { encodeCallbackData } from '../../src/bot/callback-data';
import { getMessages } from '../../src/bot/content/messages';
import { createWishlistBot } from '../../src/bot/telegraf/bot';
import type { ListImportService } from '../../src/bot/services/list-import/types';
import type {
    ListImportPreviewDto,
    ListImportStatusDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import { createWorkerListImport } from '../../src/worker/list-import';
import { handleUpdateWithWishlistBot } from '../../src/worker/routes/telegram';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { JPEG_BYTES, padBytes } from '../fixtures/link-import-fakes';
import { createTestUser } from '../fixtures/telegram';
import { createD1Harness, createWorkerEnv, type D1Harness } from './d1-harness';
import {
    BOT_TOKEN,
    callbackDataOf,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

const FIXTURES = path.resolve(
    process.cwd(),
    'test/fixtures/list-import/rewish'
);
const PROFILE_URL = 'https://rewish.io/tESt01';
const FIXTURE_SLUG = 'tESt01';
const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';
const REWISH_API_PREFIX = '/public/api';
const IMAGE_HOST = 'storage.rewish.io';
const PHOTO_SIZE_BYTES = 2048;
const NOW = new Date('2026-10-04T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const CLIENT_IP = '198.51.100.31';
const FALLBACK_CURRENCY = 'EUR';
const EXPECTED_WISHES = 6;
const EXPECTED_GIFTED = 3;
const EXPECTED_PHOTOS = 5;

const OWNER: InitDataUserFixture = {
    id: 7_201,
    first_name: 'Owner',
    username: 'owner_list_e2e',
    language_code: 'en'
};

interface ExpectedWish {
    sourceRef: string;
    removed: number;
    done: number;
    price: number;
    currency: string;
    hasPhoto: boolean;
}

const EXPECTED: readonly ExpectedWish[] = [
    {
        sourceRef: 'rewish:wish:2990647',
        removed: 0,
        done: 0,
        price: 370,
        currency: 'UAH',
        hasPhoto: true
    },
    {
        sourceRef: 'rewish:wish:6116225',
        removed: 1,
        done: 1,
        price: 730,
        currency: 'UAH',
        hasPhoto: true
    },
    {
        sourceRef: 'rewish:wish:6374722',
        removed: 1,
        done: 1,
        price: 0,
        currency: FALLBACK_CURRENCY,
        hasPhoto: true
    },
    {
        sourceRef: 'rewish:wish:6461158',
        removed: 0,
        done: 0,
        price: 170,
        currency: 'PLN',
        hasPhoto: false
    },
    {
        sourceRef: 'rewish:wish:6523062',
        removed: 1,
        done: 1,
        price: 419,
        currency: 'PLN',
        hasPhoto: true
    },
    {
        sourceRef: 'rewish:wish:6565464',
        removed: 0,
        done: 0,
        price: 550,
        currency: 'UAH',
        hasPhoto: true
    }
];

interface StoredWish {
    sourceRef: string;
    hidden: number;
    removed: number;
    done: number;
    price: number;
    currency: string;
    sourceImageUrl: string | null;
    images: string;
}

const STORED_WISHES_QUERY =
    'SELECT source_ref AS sourceRef, hidden, removed, done, price, currency, source_image_url AS sourceImageUrl, images FROM wishes WHERE user_id = ? ORDER BY source_ref';

interface NetworkLog {
    rewish: string[];
    images: string[];
    telegram: { method: string; chatId: unknown }[];
}

interface NetworkOptions {
    throttleFirstPhoto: boolean;
}

const readFixture = (name: string): unknown => {
    return JSON.parse(
        fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')
    );
};

const REWISH_ROUTES: Record<string, string> = {
    [`${REWISH_API_PREFIX}/user/by-code/`]: 'user_by_code',
    [`${REWISH_API_PREFIX}/re-wish/`]: 're_wish_list',
    [`${REWISH_API_PREFIX}/wish/by-rewish-id`]: 'wishes_by_rewish_id_trimmed'
};

const answerRewish = (url: URL) => {
    const route = Object.keys(REWISH_ROUTES).find(prefix => {
        return url.pathname.startsWith(prefix);
    });

    if (route === undefined) {
        return new Response('not found', { status: 404 });
    }

    return Response.json(readFixture(REWISH_ROUTES[route] as string));
};

const answerImage = () => {
    return new Response(padBytes(JPEG_BYTES, PHOTO_SIZE_BYTES).slice(), {
        headers: { 'content-type': 'image/jpeg' }
    });
};

const readChatId = (init: RequestInit | undefined) => {
    const { body } = init ?? {};

    if (body instanceof FormData) {
        return body.get('chat_id');
    }

    return typeof body === 'string'
        ? (JSON.parse(body) as { chat_id?: unknown }).chat_id
        : null;
};

const photoMessage = (messageId: number, fileId: string) => {
    return {
        message_id: messageId,
        date: NOW_SECONDS,
        chat: { id: OWNER.id, type: 'private' },
        photo: [
            {
                file_id: fileId,
                file_unique_id: fileId,
                width: 1280,
                height: 1280
            }
        ]
    };
};

const TOO_MANY_REQUESTS = {
    ok: false,
    error_code: 429,
    description: 'Too Many Requests: retry after 1',
    parameters: { retry_after: 1 }
};

const createTelegramAnswer = (options: NetworkOptions) => {
    let messageId = 900;
    let photoCount = 0;
    let throttlePending = options.throttleFirstPhoto;

    return (method: string) => {
        messageId += 1;

        if (method === 'sendPhoto' && throttlePending) {
            throttlePending = false;

            return Response.json(TOO_MANY_REQUESTS, { status: 429 });
        }

        if (method === 'sendPhoto') {
            photoCount += 1;

            return Response.json({
                ok: true,
                result: photoMessage(messageId, `tg-photo-${photoCount}`)
            });
        }

        return Response.json({ ok: true, result: true });
    };
};

/** The only fake: the network itself, answering rewish.io, its image CDN and the Telegram Bot API. */
const installNetwork = (log: NetworkLog, options: NetworkOptions) => {
    const original = globalThis.fetch;
    const answerTelegram = createTelegramAnswer(options);

    globalThis.fetch = (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit
    ) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input)
        );

        if (url.origin === TELEGRAM_API_ORIGIN) {
            const method = url.pathname.split('/').at(-1) ?? '';

            log.telegram.push({ method, chatId: readChatId(init) });

            return answerTelegram(method);
        }

        if (url.hostname === 'rewish.io') {
            log.rewish.push(url.pathname);

            return answerRewish(url);
        }

        if (url.hostname === IMAGE_HOST) {
            log.images.push(url.href);

            return answerImage();
        }

        throw new Error(`Unexpected network call in tests: ${url.host}`);
    }) as typeof fetch;

    return () => {
        globalThis.fetch = original;
    };
};

const createPendingTasks = () => {
    const pending: Promise<unknown>[] = [];

    return {
        waitUntil(promise: Promise<unknown>) {
            pending.push(promise);
        },
        async settle() {
            while (pending.length > 0) {
                await Promise.all(pending.splice(0));
            }
        }
    };
};

const createService = (events: TelemetryFields[]): ListImportService => {
    return createWorkerListImport({
        sleep: () => {
            return Promise.resolve();
        },
        emitTelemetry: (_env, _context, fields) => {
            events.push(fields);
        }
    });
};

const assertImportedWishes = (
    stored: readonly StoredWish[],
    expectedHidden: number
) => {
    assert.deepEqual(
        stored.map(wish => {
            return {
                sourceRef: wish.sourceRef,
                removed: wish.removed,
                done: wish.done,
                price: wish.price,
                currency: wish.currency,
                hasPhoto: (JSON.parse(wish.images) as string[]).length === 1
            };
        }),
        EXPECTED
    );

    for (const wish of stored) {
        assert.equal(wish.hidden, expectedHidden);
        assert.equal(wish.sourceImageUrl, null);
    }
};

const eventsNamed = (events: readonly TelemetryFields[], name: string) => {
    return events.filter(event => {
        return event.event === name;
    });
};

const assertPrivateTelemetry = (events: readonly TelemetryFields[]) => {
    const serialized = JSON.stringify(events);

    assert.equal(serialized.includes(FIXTURE_SLUG), false);
    assert.equal(serialized.includes(IMAGE_HOST), false);
    assert.equal(serialized.includes('Kukurudza'), false);
};

describe('list import end to end in the Mini App', () => {
    let harness: D1Harness;
    let ownerId: number;
    let events: TelemetryFields[];
    let log: NetworkLog;
    let restoreNetwork: () => void;
    let tasks: ReturnType<typeof createPendingTasks>;
    let service: ListImportService;

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'local',
            ADMIN_ID: String(OWNER.id),
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            APP_IMPORT_LIMITER: undefined,
            LINK_HOST_LIMITER: undefined,
            IMAGE_PROXY_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const callApi = async <Body>(
        apiPath: string,
        init: { method?: string; body?: unknown } = {}
    ) => {
        const deps = {
            now: () => NOW,
            crypto: createNodeApiCrypto(),
            listImport: service,
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };
        const response = await createApp({}, {}, {}, deps).request(
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
            buildEnv(),
            {
                waitUntil: tasks.waitUntil,
                passThroughOnException: () => undefined,
                props: {}
            } as unknown as ExecutionContext
        );

        return {
            status: response.status,
            body: (await response.json()) as Body
        };
    };

    const readStatus = async (jobId: number) => {
        const response = await callApi<ListImportStatusDto>(
            `/list-import/${jobId}`,
            { method: 'GET' }
        );

        assert.equal(response.status, 200);

        return response.body;
    };

    const storedWishes = async () => {
        const { results } = await harness.env.DB.prepare(STORED_WISHES_QUERY)
            .bind(ownerId)
            .all<StoredWish>();

        return results;
    };

    const countJobs = async () => {
        const row = await harness.env.DB.prepare(
            'SELECT count(*) AS total FROM list_imports WHERE user_id = ?'
        )
            .bind(ownerId)
            .first<{ total: number }>();

        return row?.total ?? 0;
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();

        const owner = await Effect.runPromise(
            harness.repositories.users.create({
                telegramId: OWNER.id,
                username: OWNER.username ?? 'owner',
                usernameSearchable: true,
                createdAt: NOW
            })
        );

        assert.ok(owner);
        ownerId = owner.id;
        await harness.env.DB.prepare(
            'UPDATE users SET currency = ? WHERE id = ?'
        )
            .bind(FALLBACK_CURRENCY, ownerId)
            .run();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(() => {
        events = [];
        log = { rewish: [], images: [], telegram: [] };
        tasks = createPendingTasks();
        service = createService(events);
        restoreNetwork = installNetwork(log, { throttleFirstPhoto: true });
    });

    afterEach(() => {
        restoreNetwork();
    });

    it('previews, commits, polls until done, drains the photos and creates nothing on a re-run', async () => {
        const preview = await callApi<ListImportPreviewDto>(
            '/list-import/preview',
            { body: { url: PROFILE_URL } }
        );

        assert.equal(preview.status, 200);
        assert.equal(preview.body.outcome, 'ok');
        assert.equal(preview.body.kind, 'wishes');
        assert.equal(preview.body.suggestedVisibility, 'public');
        assert.deepEqual(preview.body.counts, {
            found: EXPECTED_WISHES,
            active: EXPECTED_WISHES - EXPECTED_GIFTED,
            gifted: EXPECTED_GIFTED,
            duplicates: 0,
            overLimit: 0,
            withoutPrice: 0,
            withoutPhoto: EXPECTED_WISHES - EXPECTED_PHOTOS
        });
        assert.deepEqual(await storedWishes(), []);

        const jobId = preview.body.jobId as number;
        const committed = await callApi<ListImportStatusDto>(
            `/list-import/${jobId}/commit`,
            { body: { visibility: 'hidden' } }
        );

        assert.equal(committed.status, 200);
        assert.equal(committed.body.state, 'committing');
        assert.equal(committed.body.visibility, 'hidden');
        assert.equal(committed.body.kind, 'wishes');

        await tasks.settle();

        const throttled = await readStatus(jobId);

        assert.equal(throttled.state, 'done');
        assert.equal(throttled.created, EXPECTED_WISHES);
        assert.equal(throttled.createdGifted, EXPECTED_GIFTED);
        assert.equal(throttled.photosPending, EXPECTED_PHOTOS);

        await tasks.settle();

        const settled = await readStatus(jobId);

        assert.equal(settled.photosPending, 0);
        assertImportedWishes(await storedWishes(), 1);
        assert.equal(
            log.telegram.filter(call => {
                return call.method === 'sendPhoto';
            }).length,
            EXPECTED_PHOTOS + 1
        );
        assert.ok(
            log.telegram.every(call => {
                return String(call.chatId) === String(OWNER.id);
            })
        );
        assert.ok(
            log.images.every(url => {
                return !url.endsWith('_compressed');
            })
        );

        const completed = eventsNamed(events, 'list_import_completed');

        assert.equal(completed.length, 1);
        assert.equal(completed[0]?.channel, 'app');
        assert.equal(eventsNamed(events, 'list_import_previewed').length, 1);
        assert.ok(
            eventsNamed(events, 'list_import_photos_drained').length >= 2
        );
        assertPrivateTelemetry(events);

        const rerun = await callApi<ListImportPreviewDto>(
            '/list-import/preview',
            { body: { url: PROFILE_URL } }
        );

        assert.equal(rerun.body.outcome, 'empty');
        assert.equal(rerun.body.jobId, null);
        assert.equal(rerun.body.counts?.duplicates, EXPECTED_WISHES);
        assert.equal(rerun.body.counts?.active, 0);
        assert.equal(rerun.body.counts?.gifted, 0);
        assert.equal((await storedWishes()).length, EXPECTED_WISHES);
        assert.equal(await countJobs(), 1);
    });
});

describe('list import end to end in the bot', () => {
    const LL = getMessages('uk');
    const BOT_KEY = 'list-import-e2e';
    const alice = createTestUser(7_301, {
        first_name: 'Alice',
        username: 'alice_list_e2e'
    });
    let webhook: WebhookHarness;
    let aliceId: number;
    let events: TelemetryFields[];
    let log: NetworkLog;
    let restoreNetwork: () => void;
    let tasks: ReturnType<typeof createPendingTasks>;
    let service: ListImportService;

    const encode = encodeCallbackData;

    const deliver = async (update: Update) => {
        const env = {
            ...createWorkerEnv(webhook.d1, {
                BOT_TOKEN,
                BOT_ENVIRONMENT: 'preview'
            }),
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
            { waitUntil: tasks.waitUntil },
            undefined,
            undefined,
            service
        );
        await tasks.settle();
    };

    const sendCallback = (data: string) => {
        return deliver(webhook.builders.callback(alice, data));
    };

    const sendText = (text: string) => {
        return deliver(webhook.builders.message(alice, text));
    };

    const openImportDialog = async () => {
        await sendCallback(encode({ type: 'navigate', screen: 'settings' }));

        assert.ok(
            callbackDataOf(webhook.lastMessage()).includes(
                encode({ type: 'navigate', screen: 'listImport' })
            )
        );

        await sendCallback(encode({ type: 'navigate', screen: 'listImport' }));
        await sendCallback(
            encode({ type: 'listImportSource', source: 'rewish' })
        );
    };

    const readCommitJobId = () => {
        const commit = callbackDataOf(webhook.lastMessage()).find(data => {
            return data.startsWith('imp:go:');
        });

        assert.ok(commit);

        return Number(commit.split(':').at(-1));
    };

    const storedWishes = async () => {
        return webhook.queryAll<StoredWish>(STORED_WISHES_QUERY, aliceId);
    };

    const editedTexts = () => {
        return webhook.callsOf('editMessageText').map(call => {
            return String(call.payload.text);
        });
    };

    before(async () => {
        webhook = await createWebhookHarness();
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();

        const user = await webhook.registerUser(alice);

        aliceId = user.id;
        await webhook.d1.env.DB.prepare(
            'UPDATE users SET currency = ? WHERE id = ?'
        )
            .bind(FALLBACK_CURRENCY, aliceId)
            .run();
        webhook.respondToApi(call => {
            return call.method === 'editMessageText'
                ? {
                      message_id: Number(call.payload.message_id),
                      date: NOW_SECONDS,
                      chat: { id: alice.id, type: 'private' },
                      text: String(call.payload.text)
                  }
                : undefined;
        });
        events = [];
        log = { rewish: [], images: [], telegram: [] };
        tasks = createPendingTasks();
        service = createService(events);
        restoreNetwork = installNetwork(log, { throttleFirstPhoto: false });
    });

    afterEach(() => {
        restoreNetwork();
    });

    it('imports through the chat with the toggled visibility, drains the photos and finds nothing new on a re-run', async () => {
        await openImportDialog();
        await sendText(PROFILE_URL);

        const previewText = webhook.lastMessage().text;

        assert.ok(
            previewText.includes(
                LL.listImport.preview.active({
                    count: EXPECTED_WISHES - EXPECTED_GIFTED
                })
            )
        );
        assert.ok(
            previewText.includes(
                LL.listImport.preview.gifted({ count: EXPECTED_GIFTED })
            )
        );

        const jobId = readCommitJobId();

        await sendCallback(
            encode({
                type: 'listImportVisibility',
                jobId,
                visibility: 'hidden'
            })
        );
        await sendCallback(encode({ type: 'listImportCommit', jobId }));

        assertImportedWishes(await storedWishes(), 1);
        assert.ok(
            editedTexts()
                .at(-1)
                ?.startsWith(
                    LL.listImport.done.summary({ created: EXPECTED_WISHES })
                )
        );
        assert.equal(
            log.telegram.filter(call => {
                return call.method === 'sendPhoto';
            }).length,
            EXPECTED_PHOTOS
        );

        const completed = eventsNamed(events, 'list_import_completed');

        assert.equal(completed.length, 1);
        assert.equal(completed[0]?.channel, 'bot');
        assert.equal(completed[0]?.visibility, 'hidden');
        assertPrivateTelemetry(events);

        await sendCallback(encode({ type: 'listImportRefresh', jobId }));

        assert.equal(
            webhook.lastMessage().text.includes(LL.listImport.done.photos()),
            false
        );

        await openImportDialog();
        await sendText(PROFILE_URL);

        const rerunText = webhook.lastMessage().text;

        assert.ok(
            rerunText.includes(
                LL.listImport.preview.duplicates({ count: EXPECTED_WISHES })
            )
        );
        assert.ok(rerunText.includes(LL.listImport.preview.nothing()));
        assert.equal(
            callbackDataOf(webhook.lastMessage()).some(data => {
                return data.startsWith('imp:go:');
            }),
            false
        );
        assert.equal((await storedWishes()).length, EXPECTED_WISHES);
    });
});
