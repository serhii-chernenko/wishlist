import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';
import { Telegram } from 'telegraf';
import type { Context } from 'telegraf';
import type { Message, Update, User, UserFromGetMe } from 'telegraf/types';

import { getMessages } from '../src/bot/content/messages';
import {
    createBotRequest,
    createSessionHolder,
    deriveRequest
} from '../src/bot/runtime/context';
import {
    createRouter,
    mergeCallbackTables,
    PENDING_INPUT_SCREENS
} from '../src/bot/runtime/router';
import type {
    BotRequest,
    CallbackTable,
    PendingInput,
    Repositories,
    ScreenExports,
    ScreenId,
    Sender,
    SessionState,
    UserRecord
} from '../src/bot/runtime/types';
import type { WorkerBindings } from '../src/worker/env';

type SenderCall = { method: keyof Sender; args: unknown[] };

const createRecordingSender = () => {
    const calls: SenderCall[] = [];
    const record = (method: keyof Sender) => {
        return async (...args: unknown[]) => {
            calls.push({ method, args });
        };
    };
    const sender: Sender = {
        text: record('text'),
        wish: record('wish'),
        toast: record('toast'),
        removeKeyboard: record('removeKeyboard'),
        replaceKeyboard: record('replaceKeyboard'),
        deleteIncoming: record('deleteIncoming')
    };

    return { sender, calls };
};

const ACTOR: User = {
    id: 100,
    is_bot: false,
    first_name: 'Olena',
    username: 'olena',
    language_code: 'uk'
};

const REGISTERED_USER = {
    id: 1,
    telegramId: ACTOR.id,
    username: 'olena',
    usernameSearchable: true,
    phone: null,
    phoneDigits: null,
    language: null,
    payments: null
} as UserRecord;

const createRequest = (options: {
    user?: UserRecord | null;
    session?: SessionState;
}) => {
    const { sender, calls } = createRecordingSender();
    const holder = createSessionHolder(
        options.session ?? { v: 1, pendingInput: null, find: null }
    );
    const req = createBotRequest(
        {
            ctx: {} as Context,
            env: { ADMIN_ID: '1' } as WorkerBindings,
            locale: 'uk',
            actor: ACTOR,
            user: options.user ?? null,
            sessionLanguage: null,
            repos: {} as Repositories,
            services: {} as BotRequest['services'],
            telemetry: {
                botActionCompleted() {
                    return undefined;
                },
                internalFailure() {
                    return undefined;
                }
            },
            send: sender,
            defer() {
                return undefined;
            }
        },
        holder
    );

    return { req, calls, holder };
};

const createFakeScreens = (
    rendered: ScreenId[],
    inputs: PendingInput[] = []
): ScreenExports[] => {
    const ids: ScreenId[] = [
        'home',
        'privacy',
        'auth',
        'wishlist',
        'wishAdd',
        'wishEdit',
        'wishRemove',
        'findList',
        'thirdWishlist',
        'giveList',
        'feedback',
        'stats',
        'donate',
        'payments',
        'language',
        'releases'
    ];

    return ids.map(id => {
        return {
            screen: {
                id,
                async render() {
                    rendered.push(id);
                },
                async onInput(_req: BotRequest, input: PendingInput) {
                    inputs.push(input);
                }
            },
            callbacks: {}
        };
    });
};

test('callback tables merge and reject duplicates or router-owned types', () => {
    const wishEdit: CallbackTable = {
        async wishEdit() {
            return undefined;
        }
    };
    const merged = mergeCallbackTables([
        { callbacks: wishEdit },
        {
            callbacks: {
                async thirdGive() {
                    return undefined;
                }
            }
        }
    ]);

    assert.deepEqual(Object.keys(merged).sort(), ['thirdGive', 'wishEdit']);
    assert.throws(() => {
        return mergeCallbackTables([
            { callbacks: wishEdit },
            { callbacks: wishEdit }
        ]);
    }, /Duplicate callback handler/);
    assert.throws(() => {
        return mergeCallbackTables([
            {
                callbacks: {
                    async navigate() {
                        return undefined;
                    }
                }
            }
        ]);
    }, /handled by the router/);
});

test('duplicate screen ids are rejected', () => {
    const screens = createFakeScreens([]);

    assert.throws(() => {
        return createRouter([...screens, screens[0] as ScreenExports]);
    }, /Duplicate screen module/);
});

test('navigation renders the target screen and clears pending input', async () => {
    const rendered: ScreenId[] = [];
    const router = createRouter(createFakeScreens(rendered));
    const { req, holder } = createRequest({
        user: REGISTERED_USER,
        session: { v: 1, pendingInput: { kind: 'feedback' }, find: null }
    });

    await router.dispatchCallback(req, {
        type: 'navigate',
        screen: 'wishlist'
    });

    assert.deepEqual(rendered, ['wishlist']);
    assert.equal(holder.current.pendingInput, null);
});

test('guests are sent home from registered-only screens and actions', async () => {
    const rendered: ScreenId[] = [];
    const router = createRouter(createFakeScreens(rendered));
    const { req, calls } = createRequest({ user: null });

    await router.dispatchCallback(req, {
        type: 'navigate',
        screen: 'wishlist'
    });
    await router.dispatchCallback(req, { type: 'wishEdit', wishId: 5 });

    assert.deepEqual(rendered, ['home', 'home']);
    assert.deepEqual(
        calls.map(call => {
            return call.method;
        }),
        ['toast']
    );
});

test('outdated callbacks toast and render home; noop does nothing', async () => {
    const rendered: ScreenId[] = [];
    const router = createRouter(createFakeScreens(rendered));
    const { req, calls } = createRequest({ user: REGISTERED_USER });

    await router.dispatchCallback(req, { type: 'noop' });
    assert.deepEqual(rendered, []);

    await router.dispatchCallback(req, { type: 'outdated' });
    assert.deepEqual(rendered, ['home']);
    assert.deepEqual(calls, [
        {
            method: 'toast',
            args: [getMessages('uk').errors.outdatedButton()]
        }
    ]);
});

test('callbacks without a registered handler are treated as outdated', async () => {
    const rendered: ScreenId[] = [];
    const router = createRouter(createFakeScreens(rendered));
    const { req, calls } = createRequest({ user: REGISTERED_USER });

    await router.dispatchCallback(req, { type: 'thirdGive', wishId: 3 });

    assert.deepEqual(rendered, ['home']);
    assert.equal(calls[0]?.method, 'toast');
});

test('callbacks dispatch to the merged handler with the decoded action', async () => {
    const received: unknown[] = [];
    const screens = createFakeScreens([]).map(module => {
        if (module.screen.id !== 'thirdWishlist') {
            return module;
        }

        return {
            ...module,
            callbacks: {
                async thirdGive(_req, action) {
                    received.push(action);
                }
            } satisfies CallbackTable
        };
    });
    const router = createRouter(screens);
    const { req } = createRequest({ user: REGISTERED_USER });

    await router.dispatchCallback(req, { type: 'thirdGive', wishId: 3 });

    assert.deepEqual(received, [{ type: 'thirdGive', wishId: 3 }]);
});

test('input is routed by the pending input kind', async () => {
    const rendered: ScreenId[] = [];
    const inputs: PendingInput[] = [];
    const router = createRouter(createFakeScreens(rendered, inputs));
    const message = { message_id: 1, text: 'hello' } as Message;

    for (const kind of Object.keys(PENDING_INPUT_SCREENS)) {
        const pendingInput = (
            kind === 'wishField'
                ? { kind, wishId: 1, field: 'title' }
                : kind === 'contact'
                  ? { kind, authType: 'phone' }
                  : { kind }
        ) as PendingInput;
        const { req } = createRequest({
            user: REGISTERED_USER,
            session: { v: 1, pendingInput, find: null }
        });

        await router.dispatchInput(req, message);
    }

    assert.deepEqual(
        inputs.map(input => {
            return input.kind;
        }),
        Object.keys(PENDING_INPUT_SCREENS)
    );
    assert.deepEqual(rendered, []);
});

test('input without pending input renders home', async () => {
    const rendered: ScreenId[] = [];
    const router = createRouter(createFakeScreens(rendered));
    const { req } = createRequest({ user: REGISTERED_USER });

    await router.dispatchInput(req, { message_id: 1 } as Message);

    assert.deepEqual(rendered, ['home']);
});

test('guest input for a registered-only flow resets and renders home', async () => {
    const rendered: ScreenId[] = [];
    const inputs: PendingInput[] = [];
    const router = createRouter(createFakeScreens(rendered, inputs));
    const { req, holder } = createRequest({
        user: null,
        session: { v: 1, pendingInput: { kind: 'payments' }, find: null }
    });

    await router.dispatchInput(req, { message_id: 1 } as Message);

    assert.deepEqual(inputs, []);
    assert.deepEqual(rendered, ['home']);
    assert.equal(holder.current.pendingInput, null);
});

test('derived requests share live session state', () => {
    const { req, holder } = createRequest({ user: null });
    const derived = deriveRequest(req, {
        user: REGISTERED_USER,
        locale: 'en'
    });

    derived.setSession({
        ...derived.session,
        pendingInput: { kind: 'feedback' }
    });

    assert.deepEqual(req.session.pendingInput, { kind: 'feedback' });
    assert.deepEqual(derived.session, holder.current);
    assert.equal(derived.LL.actions.home(), getMessages('en').actions.home());
    assert.equal(req.user, null);
});

type ApiCall = { method: string; payload: Record<string, unknown> };

const BOT_INFO = {
    id: 999,
    is_bot: true,
    first_name: 'Wishlist',
    username: 'wishlist_test_bot',
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false
} as UserFromGetMe;

const createPipelineRepos = (options: {
    sessionState?: string;
    user?: UserRecord | null;
}) => {
    const savedStates: string[] = [];
    const blocked: number[] = [];
    const repos = {
        users: {
            findByTelegramId() {
                return Effect.succeed(options.user ?? null);
            },
            syncProfile() {
                return Effect.succeed(null);
            },
            markBlockedByTelegramId(telegramId: number) {
                blocked.push(telegramId);
                return Effect.succeed(true);
            }
        },
        sessions: {
            get(telegramUserId: number) {
                return Effect.succeed(
                    options.sessionState === undefined
                        ? null
                        : {
                              telegramUserId,
                              language: null,
                              state: options.sessionState,
                              mediaGroupId: null,
                              mediaGroupMarker: null,
                              updatedAt: new Date()
                          }
                );
            },
            saveState(_telegramUserId: number, state: string | object) {
                savedStates.push(String(state));
                return Effect.succeed(undefined);
            }
        }
    } as unknown as Repositories;

    return { repos, savedStates, blocked };
};

type ApiStub = (
    method: string,
    payload: Record<string, unknown>
) => Promise<unknown>;

const originalCallApi = Telegram.prototype.callApi;

const stubTelegramApi = (stub: ApiStub) => {
    Object.assign(Telegram.prototype, { callApi: stub });
};

const refuseNetwork: ApiStub = async method => {
    throw new Error(`Unexpected Telegram API call in tests: ${method}`);
};

stubTelegramApi(refuseNetwork);

test.afterEach(() => {
    stubTelegramApi(refuseNetwork);
});

test.after(() => {
    Object.assign(Telegram.prototype, { callApi: originalCallApi });
});

const createPipelineBot = async (
    repos: Repositories,
    respond: (call: ApiCall) => unknown = () => {
        return true;
    }
) => {
    const { createWishlistBot } = await import('../src/bot/telegraf/bot');
    const apiCalls: ApiCall[] = [];
    const bot = createWishlistBot({ BOT_TOKEN: '1:test' } as WorkerBindings, {
        repositories: repos,
        sleep: async () => {
            return undefined;
        }
    });

    bot.botInfo = BOT_INFO;
    stubTelegramApi(async (method, payload) => {
        const call = { method, payload };

        apiCalls.push(call);

        return respond(call);
    });

    return { bot, apiCalls };
};

const privateChat = { id: ACTOR.id, type: 'private', first_name: 'Olena' };

const textUpdate = (text: string, chat: object = privateChat): Update => {
    const command = text.startsWith('/') ? text.split(' ')[0] : undefined;

    return {
        update_id: 1,
        message: {
            message_id: 10,
            date: 1_700_000_000,
            chat,
            from: ACTOR,
            text,
            ...(command && {
                entities: [
                    { type: 'bot_command', offset: 0, length: command.length }
                ]
            })
        }
    } as Update;
};

test('/start always resets pending input and the find state', async () => {
    const { repos, savedStates } = createPipelineRepos({
        sessionState: JSON.stringify({
            v: 1,
            pendingInput: { kind: 'feedback' },
            find: { targetUserId: 4, query: '@friend', filter: 1 }
        })
    });
    const { bot, apiCalls } = await createPipelineBot(repos);

    await bot.handleUpdate(textUpdate('/start'));

    assert.deepEqual(savedStates, ['{"v":1,"pendingInput":null,"find":null}']);
    assert.equal(apiCalls[0]?.method, 'sendMessage');
    assert.equal(apiCalls[0]?.payload.parse_mode, 'HTML');
    assert.match(
        String(apiCalls[0]?.payload.text),
        new RegExp(
            getMessages('uk').greeting.user() === '' ? '^$' : 'Вітаннячка'
        )
    );
});

test('group chats are ignored without a reply', async () => {
    const { repos, savedStates } = createPipelineRepos({});
    const { bot, apiCalls } = await createPipelineBot(repos);

    await bot.handleUpdate(
        textUpdate('/start', { id: -100, type: 'group', title: 'Friends' })
    );

    assert.deepEqual(apiCalls, []);
    assert.deepEqual(savedStates, []);
});

test('legacy callbacks toast once, drop the keyboard and render home', async () => {
    const { repos } = createPipelineRepos({});
    const { bot, apiCalls } = await createPipelineBot(repos);

    await bot.handleUpdate({
        update_id: 2,
        callback_query: {
            id: 'cbq-1',
            from: ACTOR,
            chat_instance: 'ci',
            data: 'edit_64b7f0c2a1e4d3b2c1a09876',
            message: {
                message_id: 11,
                date: 1_700_000_000,
                chat: privateChat,
                text: 'old'
            }
        }
    } as Update);

    const methods = apiCalls.map(call => {
        return call.method;
    });

    assert.deepEqual(methods, [
        'editMessageReplyMarkup',
        'answerCallbackQuery',
        'sendMessage'
    ]);
    assert.equal(
        apiCalls[1]?.payload.text,
        getMessages('uk').errors.outdatedButton()
    );
});

test('a 403 marks the user blocked and sends nothing else', async () => {
    const { repos, blocked } = createPipelineRepos({});
    const { bot, apiCalls } = await createPipelineBot(repos, () => {
        throw Object.assign(new Error('Forbidden'), {
            response: {
                error_code: 403,
                description: 'Forbidden: bot was blocked by the user'
            }
        });
    });

    await bot.handleUpdate(textUpdate('/start'));

    assert.deepEqual(blocked, [ACTOR.id]);
    assert.equal(apiCalls.length, 1);
});

const telegramError = (code: number, extra: object = {}) => {
    return Object.assign(new Error(`Telegram ${code}`), {
        response: { error_code: code, description: `error ${code}`, ...extra }
    });
};

test('sendWithRetry retries short 429s up to three times', async () => {
    const { sendWithRetry } = await import('../src/bot/runtime/send');
    const sleeps: number[] = [];
    const sleep = async (milliseconds: number) => {
        sleeps.push(milliseconds);
    };
    let attempts = 0;

    const result = await sendWithRetry(async () => {
        attempts += 1;

        if (attempts < 3) {
            throw telegramError(429, { parameters: { retry_after: 2 } });
        }

        return 'sent';
    }, sleep);

    assert.equal(result, 'sent');
    assert.deepEqual(sleeps, [2000, 2000]);

    await assert.rejects(
        sendWithRetry(async () => {
            throw telegramError(429, { parameters: { retry_after: 10 } });
        }, sleep),
        /Telegram 429/
    );

    let exhausted = 0;

    await assert.rejects(
        sendWithRetry(async () => {
            exhausted += 1;
            throw telegramError(429, { parameters: { retry_after: 1 } });
        }, sleep),
        /Telegram 429/
    );
    assert.equal(exhausted, 4);
});

const createSenderHarness = async (
    respond: (method: string, args: unknown[]) => unknown = () => {
        return true;
    }
) => {
    const { createSender } = await import('../src/bot/runtime/send');
    const calls: { method: string; args: unknown[] }[] = [];
    const failures: string[] = [];
    const record = (method: string) => {
        return async (...args: unknown[]) => {
            calls.push({ method, args });
            return respond(method, args);
        };
    };
    const ctx = {
        telegram: {
            sendMessage: record('sendMessage'),
            sendPhoto: record('sendPhoto'),
            sendMediaGroup: record('sendMediaGroup')
        }
    } as unknown as Context;
    const sender = createSender({
        ctx,
        chatId: 100,
        telemetry: {
            botActionCompleted() {
                return undefined;
            },
            internalFailure(input) {
                failures.push(input.event);
            }
        },
        async onForbidden() {
            return undefined;
        }
    });

    return { sender, calls, failures };
};

const KEYBOARD = { inline_keyboard: [[{ text: 'x', callback_data: 'x' }]] };

test('wishes with several images send a media group then the text', async () => {
    const { sender, calls } = await createSenderHarness();

    await sender.wish({ html: '<b>Wish</b>', images: ['a', 'b'] }, KEYBOARD);

    assert.deepEqual(
        calls.map(call => {
            return call.method;
        }),
        ['sendMediaGroup', 'sendMessage']
    );
    assert.deepEqual(calls[1]?.args[2], {
        parse_mode: 'HTML',
        reply_markup: KEYBOARD
    });
});

test('one image uses a caption unless it exceeds 1024 characters', async () => {
    const short = await createSenderHarness();

    await short.sender.wish({ html: '<b>Wish</b>', images: ['a'] }, KEYBOARD);
    assert.deepEqual(
        short.calls.map(call => {
            return call.method;
        }),
        ['sendPhoto']
    );

    const long = await createSenderHarness();

    await long.sender.wish(
        { html: `<b>${'x'.repeat(1100)}</b>`, images: ['a'] },
        KEYBOARD
    );
    assert.deepEqual(
        long.calls.map(call => {
            return call.method;
        }),
        ['sendPhoto', 'sendMessage']
    );
    assert.equal(long.calls[0]?.args.length, 2);
});

const buttonUrlError = () => {
    return telegramError(400, {
        description: 'Bad Request: inline keyboard button URL is invalid'
    });
};

const LINK_KEYBOARD = {
    inline_keyboard: [
        [{ text: 'Open', url: 'https://example.com/a b' }],
        [{ text: 'Give', callback_data: 't:g:1' }]
    ]
};

test('a rejected url button is retried once without it and is not a media failure', async () => {
    const { sender, calls, failures } = await createSenderHarness(
        (method, args) => {
            const options = args.at(-1) as { reply_markup?: unknown };

            if (JSON.stringify(options.reply_markup).includes('"url"')) {
                throw buttonUrlError();
            }

            return method === 'sendMessage' || method === 'sendPhoto';
        }
    );

    await sender.wish({ html: 'Wish', images: [] }, LINK_KEYBOARD);
    await sender.wish({ html: 'Wish', images: ['photo'] }, LINK_KEYBOARD);

    assert.deepEqual(
        calls.map(call => {
            return call.method;
        }),
        ['sendMessage', 'sendMessage', 'sendPhoto', 'sendPhoto']
    );
    assert.deepEqual(failures, []);

    const retried = calls[1]?.args[2] as { reply_markup: unknown } | undefined;

    assert.deepEqual(retried?.reply_markup, {
        inline_keyboard: [[{ text: 'Give', callback_data: 't:g:1' }]]
    });
});

test('a url button error that persists after the retry fails the send without a media fallback', async () => {
    const { sender, calls, failures } = await createSenderHarness(() => {
        throw buttonUrlError();
    });

    await assert.rejects(
        sender.wish({ html: 'Wish', images: ['photo'] }, LINK_KEYBOARD),
        /Telegram 400/
    );
    assert.deepEqual(
        calls.map(call => {
            return call.method;
        }),
        ['sendPhoto', 'sendPhoto']
    );
    assert.deepEqual(failures, []);
});

test('only url button errors are classified as button errors, never a media file error', async () => {
    const { isTelegramButtonUrlError } =
        await import('../src/bot/utils/telegram-errors');
    const withDescription = (description: string) => {
        return telegramError(400, { description });
    };

    assert.equal(
        isTelegramButtonUrlError(
            withDescription('Bad Request: BUTTON_URL_INVALID')
        ),
        true
    );
    assert.equal(
        isTelegramButtonUrlError(
            withDescription('Bad Request: wrong HTTP URL')
        ),
        true
    );
    assert.equal(
        isTelegramButtonUrlError(
            withDescription(
                'Bad Request: wrong file identifier/HTTP URL specified'
            )
        ),
        false
    );
    assert.equal(
        isTelegramButtonUrlError(
            withDescription('Bad Request: failed to get HTTP URL content')
        ),
        false
    );
});

test('a url button error without a url button to strip is rethrown at once', async () => {
    const { sender, calls } = await createSenderHarness(() => {
        throw buttonUrlError();
    });

    await assert.rejects(sender.text('Hello', KEYBOARD), /Telegram 400/);
    assert.equal(calls.length, 1);
});

test('a media 400 falls back to text and reports wish_media_failed', async () => {
    const { sender, calls, failures } = await createSenderHarness(method => {
        if (method === 'sendPhoto') {
            throw telegramError(400);
        }

        return true;
    });

    await sender.wish({ html: 'Wish', images: ['foreign'] }, KEYBOARD);

    assert.deepEqual(
        calls.map(call => {
            return call.method;
        }),
        ['sendPhoto', 'sendMessage']
    );
    assert.deepEqual(failures, ['wish_media_failed']);
});
