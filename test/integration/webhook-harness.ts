import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';

import { Effect } from 'effect';
import { Telegram } from 'telegraf';
import type { Update, UserFromGetMe } from 'telegraf/types';

import type { NewUser, UserRecord } from '../../src/db/repositories';
import { clearCachedBotInfo } from '../../src/worker/routes/telegram';
import {
    createTestUser,
    createUpdateBuilders,
    type TestUser,
    type UpdateBuilders
} from '../fixtures/telegram';
import { createD1Harness, createWorkerEnv, type D1Harness } from './d1-harness';

export const BOT_TOKEN = '123456:integration-test-token';
export const WEBHOOK_SECRET = 'integration-webhook-secret';
export const WEBHOOK_PATH = '/telegram/integration-path';
export const DEFAULT_ADMIN_ID = '4242';
export const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

export const BOT_INFO = {
    id: 123456,
    is_bot: true,
    first_name: 'Wishlist',
    username: 'wishlist_test_bot',
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false
} as UserFromGetMe;

export interface ApiCall {
    method: string;
    payload: Record<string, unknown>;
}

export interface TelegraphCall {
    method: string;
    body: Record<string, unknown>;
}

export interface SentMessage {
    chat_id: number | string;
    text: string;
    parse_mode?: string;
    reply_markup?: {
        inline_keyboard?: Array<
            Array<{ text: string; callback_data?: string; url?: string }>
        >;
        keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>;
        remove_keyboard?: boolean;
    };
}

export type ApiResponder = (call: ApiCall) => unknown;

export type TelegraphResponder = (call: TelegraphCall) => {
    status?: number;
    body: Record<string, unknown>;
} | null;

export interface DeliverOptions {
    secret?: string;
    path?: string;
    contentType?: string;
    rawBody?: string;
}

export interface WebhookHarnessOptions {
    adminId?: string | null;
    botEnvironment?: 'local' | 'production' | 'preview';
}

export const createTelegramApiError = (
    code: number,
    description: string,
    parameters?: Record<string, unknown>
) => {
    return Object.assign(new Error(`${code}: ${description}`), {
        response: {
            error_code: code,
            description,
            ...(parameters ? { parameters } : {})
        }
    });
};

export const createForbiddenError = () => {
    return createTelegramApiError(
        403,
        'Forbidden: bot was blocked by the user'
    );
};

const createDefaultApiResult = (call: ApiCall, messageCounter: number) => {
    switch (call.method) {
        case 'getMe':
            return BOT_INFO;
        case 'sendMessage':
        case 'sendPhoto':
            return {
                message_id: messageCounter,
                date: 0,
                chat: { id: call.payload.chat_id, type: 'private' }
            };
        case 'sendMediaGroup':
            return [
                {
                    message_id: messageCounter,
                    date: 0,
                    chat: { id: call.payload.chat_id, type: 'private' }
                }
            ];
        case 'answerCallbackQuery':
        case 'editMessageReplyMarkup':
        case 'deleteMessage':
        case 'setMyCommands':
            return true;
        default:
            throw new Error(
                `Unexpected Telegram API call in tests: ${call.method}`
            );
    }
};

const defaultTelegraphResponse = (call: TelegraphCall, counter: number) => {
    if (call.method === 'createAccount') {
        return { ok: true, result: { access_token: `token-${counter}` } };
    }

    if (call.method === 'createPage') {
        return {
            ok: true,
            result: { url: `https://telegra.ph/wishlist-${counter}` }
        };
    }

    throw new Error(`Unexpected telegra.ph method: ${call.method}`);
};

const getButtons = (message: SentMessage | undefined) => {
    return (message?.reply_markup?.inline_keyboard ?? []).flat();
};

export const callbackDataOf = (message: SentMessage | undefined) => {
    return getButtons(message).flatMap(button => {
        return button.callback_data === undefined ? [] : [button.callback_data];
    });
};

export const urlsOf = (message: SentMessage | undefined) => {
    return getButtons(message).flatMap(button => {
        return button.url === undefined ? [] : [button.url];
    });
};

export const buttonTextsOf = (message: SentMessage | undefined) => {
    return getButtons(message).map(button => {
        return button.text;
    });
};

export const createWebhookHarness = async (
    options: WebhookHarnessOptions = {}
) => {
    const d1 = await createD1Harness();

    await d1.applyMigrations();

    const apiCalls: ApiCall[] = [];
    const telegraphCalls: TelegraphCall[] = [];
    const pendingTasks: Promise<unknown>[] = [];
    const sleepGates: Array<() => void> = [];
    const sleepRequests: number[] = [];
    const builders: UpdateBuilders = createUpdateBuilders(1);
    let apiResponder: ApiResponder | null = null;
    let telegraphResponder: TelegraphResponder | null = null;
    let adminId: string | null =
        options.adminId === undefined ? DEFAULT_ADMIN_ID : options.adminId;
    let holdSleeps = true;
    let messageCounter = 1;
    let telegraphCounter = 1;

    const loggedErrors: string[] = [];
    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };
    const originalCallApi = Telegram.prototype.callApi;
    const originalFetch = globalThis.fetch;
    const subtle = crypto.subtle as unknown as Record<string, unknown>;
    const originalTimingSafeEqual = subtle.timingSafeEqual;
    const schedulerDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        'scheduler'
    );

    console.log = () => undefined;
    console.info = () => undefined;
    console.warn = (...args: unknown[]) => {
        loggedErrors.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
        loggedErrors.push(args.map(String).join(' '));
    };
    Object.assign(Telegram.prototype, {
        callApi: async (method: string, payload: Record<string, unknown>) => {
            const call: ApiCall = { method, payload: payload ?? {} };

            apiCalls.push(call);
            messageCounter += 1;

            const override = apiResponder?.(call);

            return override === undefined
                ? createDefaultApiResult(call, messageCounter)
                : override;
        }
    });
    subtle.timingSafeEqual = (left: ArrayBuffer, right: ArrayBuffer) => {
        return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
    };
    globalThis.fetch = (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
    ) => {
        const url = new URL(String(input));

        if (url.origin !== 'https://api.telegra.ph') {
            throw new Error(`Unexpected network call in tests: ${url.href}`);
        }

        const call: TelegraphCall = {
            method: url.pathname.slice(1),
            body: JSON.parse(String(init?.body ?? '{}')) as Record<
                string,
                unknown
            >
        };

        telegraphCalls.push(call);
        telegraphCounter += 1;

        const override = telegraphResponder?.(call);
        const body =
            override?.body ?? defaultTelegraphResponse(call, telegraphCounter);

        return new Response(JSON.stringify(body), {
            status: override?.status ?? 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }) as typeof fetch;
    Object.defineProperty(globalThis, 'scheduler', {
        configurable: true,
        writable: true,
        value: {
            wait: (milliseconds: number) => {
                sleepRequests.push(milliseconds);

                if (!holdSleeps) {
                    return Promise.resolve();
                }

                return new Promise<void>(resolve => {
                    sleepGates.push(resolve);
                });
            }
        }
    });

    const { default: worker } = await import('../../src/worker/index');

    clearCachedBotInfo();

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const deliver = (
        update: Update | object,
        deliverOptions: DeliverOptions = {}
    ) => {
        const env = createWorkerEnv(d1, {
            BOT_TOKEN,
            TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET,
            TELEGRAM_WEBHOOK_PATH: WEBHOOK_PATH,
            BOT_ENVIRONMENT: options.botEnvironment ?? 'production',
            ...(adminId === null ? { ADMIN_ID: '' } : { ADMIN_ID: adminId })
        });

        return worker.fetch(
            new Request(
                `https://example.test${deliverOptions.path ?? WEBHOOK_PATH}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            deliverOptions.contentType ?? 'application/json',
                        [SECRET_HEADER]: deliverOptions.secret ?? WEBHOOK_SECRET
                    },
                    body: deliverOptions.rawBody ?? JSON.stringify(update)
                }
            ),
            env,
            {
                waitUntil(promise: Promise<unknown>) {
                    pendingTasks.push(promise);
                },
                passThroughOnException() {
                    return undefined;
                }
            } as never
        );
    };

    const settle = async () => {
        holdSleeps = false;

        try {
            for (const release of sleepGates.splice(0)) {
                release();
            }

            while (pendingTasks.length > 0) {
                await Promise.all(pendingTasks.splice(0));
            }
        } finally {
            holdSleeps = true;
        }
    };

    const send = async (update: Update | object) => {
        const response = await deliver(update);

        assert.equal(response.status, 200);

        const result = (await response.json()) as Record<string, unknown>;

        await settle();

        return result;
    };

    const sendHolding = async (update: Update | object) => {
        const response = await deliver(update);

        assert.equal(response.status, 200);

        return (await response.json()) as Record<string, unknown>;
    };

    const callsOf = (method: string) => {
        return apiCalls.filter(call => {
            return call.method === method;
        });
    };

    const outboundCalls = () => {
        return apiCalls.filter(call => {
            return call.method !== 'getMe';
        });
    };

    const sentMessages = () => {
        return callsOf('sendMessage').map(call => {
            return call.payload as unknown as SentMessage;
        });
    };

    const lastMessage = () => {
        const messages = sentMessages();

        assert.ok(messages.length > 0, 'no sendMessage call was recorded');

        return messages[messages.length - 1] as SentMessage;
    };

    const messageTexts = () => {
        return sentMessages().map(message => {
            return message.text;
        });
    };

    const queryOne = <Row>(sql: string, ...bindings: unknown[]) => {
        return d1.env.DB.prepare(sql)
            .bind(...bindings)
            .first<Row>();
    };

    const queryAll = async <Row>(sql: string, ...bindings: unknown[]) => {
        const { results } = await d1.env.DB.prepare(sql)
            .bind(...bindings)
            .all<Row>();

        return results;
    };

    const registerUser = async (
        user: TestUser,
        overrides: Partial<NewUser> = {}
    ): Promise<UserRecord> => {
        const created = await run(
            d1.repositories.users.create({
                telegramId: user.id,
                username: user.username ?? null,
                usernameSearchable: Boolean(user.username),
                ...overrides
            })
        );

        assert.ok(created);

        return created;
    };

    const createWish = async (
        owner: UserRecord,
        title: string,
        patch: Partial<{
            description: string;
            link: string;
            price: number;
            priority: boolean;
            hidden: boolean;
        }> = {}
    ) => {
        const wish = await run(
            d1.repositories.wishes.create(owner.id, title, new Date())
        );

        assert.ok(wish);

        const { priority, hidden, ...fields } = patch;

        if (Object.keys(fields).length > 0) {
            await run(
                d1.repositories.wishes.updateFields(
                    wish.id,
                    owner.id,
                    fields,
                    new Date()
                )
            );
        }

        if (priority) {
            await run(
                d1.repositories.wishes.togglePriority(
                    wish.id,
                    owner.id,
                    new Date()
                )
            );
        }

        if (hidden) {
            await run(
                d1.repositories.wishes.toggleHidden(
                    wish.id,
                    owner.id,
                    new Date()
                )
            );
        }

        return wish;
    };

    const reset = async () => {
        await settle();
        await d1.clearApplicationTables();
        apiCalls.length = 0;
        telegraphCalls.length = 0;
        loggedErrors.length = 0;
        sleepRequests.length = 0;
        apiResponder = null;
        telegraphResponder = null;
        adminId =
            options.adminId === undefined ? DEFAULT_ADMIN_ID : options.adminId;
        clearCachedBotInfo();
    };

    const dispose = async () => {
        await settle();
        Object.assign(console, originalConsole);
        Object.assign(Telegram.prototype, { callApi: originalCallApi });
        subtle.timingSafeEqual = originalTimingSafeEqual;
        globalThis.fetch = originalFetch;

        if (schedulerDescriptor) {
            Object.defineProperty(globalThis, 'scheduler', schedulerDescriptor);
        } else {
            Reflect.deleteProperty(globalThis, 'scheduler');
        }

        await d1.dispose();
    };

    return {
        d1: d1 as D1Harness,
        apiCalls,
        telegraphCalls,
        loggedErrors,
        sleepRequests,
        builders,
        deliver,
        send,
        sendHolding,
        settle,
        reset,
        dispose,
        callsOf,
        outboundCalls,
        sentMessages,
        lastMessage,
        messageTexts,
        queryOne,
        queryAll,
        run,
        registerUser,
        createWish,
        createUser: createTestUser,
        respondToApi(responder: ApiResponder | null) {
            apiResponder = responder;
        },
        respondToTelegraph(responder: TelegraphResponder | null) {
            telegraphResponder = responder;
        },
        setAdminId(next: string | null) {
            adminId = next;
        },
        clearApiCalls() {
            apiCalls.length = 0;
        }
    };
};

export type WebhookHarness = Awaited<ReturnType<typeof createWebhookHarness>>;
