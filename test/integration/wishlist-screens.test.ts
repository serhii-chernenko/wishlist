import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';
import type { Context } from 'telegraf';
import type {
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message
} from 'telegraf/types';

import { decodeCallbackData } from '../../src/bot/callback-data';
import type {
    BotRequest,
    BotServices,
    CallbackAction,
    CallbackActionType,
    CallbackTable,
    PendingInput,
    SessionState,
    WishMessage
} from '../../src/bot/runtime/types';
import { getMessages } from '../../src/bot/content/messages';
import {
    callbacks as findListCallbacks,
    screen as findListScreen
} from '../../src/bot/screens/find-list';
import {
    callbacks as giveListCallbacks,
    screen as giveListScreen
} from '../../src/bot/screens/give-list';
import {
    callbacks as thirdCallbacks,
    screen as thirdWishlistScreen
} from '../../src/bot/screens/third-wishlist';
import {
    callbacks as wishAddCallbacks,
    screen as wishAddScreen
} from '../../src/bot/screens/wish-add';
import {
    callbacks as wishEditCallbacks,
    screen as wishEditScreen
} from '../../src/bot/screens/wish-edit';
import { callbacks as wishPriorityCallbacks } from '../../src/bot/screens/wish-priority';
import { callbacks as wishRemoveCallbacks } from '../../src/bot/screens/wish-remove';
import {
    callbacks as wishlistCallbacks,
    screen as wishlistScreen
} from '../../src/bot/screens/wishlist';
import type { UserRecord } from '../../src/db/repositories';
import { FALLBACK_RATES, resolveDisplayCurrency } from '../../src/shared/money';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import {
    countRows,
    createD1Harness,
    seedGeneratedWishes,
    type D1Harness
} from './d1-harness';

type SentEvent =
    | { kind: 'text'; html: string; keyboard: unknown }
    | {
          kind: 'wish';
          item: WishMessage;
          keyboard: InlineKeyboardMarkup | undefined;
      }
    | { kind: 'toast'; text: string }
    | { kind: 'replaceKeyboard'; keyboard: InlineKeyboardMarkup }
    | { kind: 'deleteIncoming' };

const allCallbacks: CallbackTable[] = [
    wishlistCallbacks,
    wishEditCallbacks,
    wishPriorityCallbacks,
    wishAddCallbacks,
    wishRemoveCallbacks,
    findListCallbacks,
    thirdCallbacks,
    giveListCallbacks
];

describe('wishlist screens on D1', () => {
    let harness: D1Harness;
    let telegramIdSequence = 5_000;
    let updateIdSequence = 100;

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const createUser = async (
        overrides: Partial<
            Parameters<D1Harness['repositories']['users']['create']>[0]
        > = {}
    ) => {
        telegramIdSequence += 1;

        const created = await run(
            harness.repositories.users.create({
                telegramId: telegramIdSequence,
                ...overrides
            })
        );

        assert.ok(created);

        return created;
    };

    const createRequest = (
        user: UserRecord,
        options: {
            isAdmin?: boolean;
            session?: SessionState;
            publicOrigin?: string;
            environment?: string;
            actorName?: string;
            repos?: BotRequest['repos'];
        } = {}
    ) => {
        const events: SentEvent[] = [];
        const deferred: Array<{ task: () => Promise<void>; delayMs: number }> =
            [];
        const savedSessions: SessionState[] = [];
        const telemetry: Array<Record<string, unknown>> = [];
        const request = {
            ctx: { update: { update_id: 0 } } as unknown as Context,
            env: {
                WISHLIST_TG_URL: 'https://t.me/wishlist_ua_bot',
                MONOBANK_URL: 'https://mono.test',
                KOFI_URL: 'https://kofi.test',
                PAYPAL_URL: 'https://paypal.test',
                REVOLUT_URL: 'https://revolut.test',
                ...(options.environment === undefined
                    ? {}
                    : { BOT_ENVIRONMENT: options.environment })
            },
            locale: 'uk',
            rates: FALLBACK_RATES,
            displayCurrency: resolveDisplayCurrency(user.currency, 'uk'),
            LL: getMessages('uk'),
            actor: {
                id: user.telegramId,
                is_bot: false,
                first_name: options.actorName ?? 'Test',
                username: user.username ?? undefined
            },
            ...(options.publicOrigin === undefined
                ? {}
                : { publicOrigin: options.publicOrigin }),
            user,
            session: options.session ?? {
                v: 1,
                pendingInput: null,
                find: null
            },
            isAdmin: options.isAdmin ?? false,
            repos: options.repos ?? harness.repositories,
            services: {} as BotServices,
            telemetry: {
                botActionCompleted: (input: Record<string, unknown>) => {
                    telemetry.push(input);
                },
                internalFailure: (input: Record<string, unknown>) => {
                    telemetry.push(input);
                }
            },
            send: {
                text: async (html: string, keyboard?: unknown) => {
                    events.push({ kind: 'text', html, keyboard });
                },
                wish: async (
                    item: WishMessage,
                    keyboard?: InlineKeyboardMarkup
                ) => {
                    events.push({ kind: 'wish', item, keyboard });
                },
                toast: async (text: string) => {
                    events.push({ kind: 'toast', text });
                },
                removeKeyboard: async () => {},
                replaceKeyboard: async (keyboard: InlineKeyboardMarkup) => {
                    events.push({ kind: 'replaceKeyboard', keyboard });
                },
                deleteIncoming: async () => {
                    events.push({ kind: 'deleteIncoming' });
                }
            },
            defer: (task: () => Promise<void>, delayMs: number) => {
                deferred.push({ task, delayMs });
            },
            setSession: (next: SessionState) => {
                savedSessions.push(next);
                request.session = next;
            }
        } as unknown as BotRequest;

        return { request, events, deferred, savedSessions, telemetry };
    };

    const searchedSession = (ownerId: number): SessionState => {
        return {
            v: 1,
            pendingInput: null,
            find: { targetUserId: ownerId, query: 'alice', filter: null }
        };
    };

    const dispatch = async (request: BotRequest, data: string) => {
        const action = decodeCallbackData(data);
        const handler = allCallbacks
            .map(table => {
                return table[action.type as CallbackActionType];
            })
            .find(Boolean) as
            | ((req: BotRequest, action: CallbackAction) => Promise<void>)
            | undefined;

        assert.ok(handler, `no handler for ${data}`);
        await handler(request, action);
    };

    const textMessage = (text: string) => {
        return {
            message_id: 1,
            date: 0,
            chat: { id: 1, type: 'private' },
            text
        } as unknown as Message;
    };

    const photoMessage = (fileId: string, mediaGroupId?: string) => {
        return {
            message_id: 2,
            date: 0,
            chat: { id: 1, type: 'private' },
            photo: [
                {
                    file_id: `${fileId}-small`,
                    width: 90,
                    height: 90,
                    file_unique_id: 'a'
                },
                {
                    file_id: fileId,
                    width: 1280,
                    height: 960,
                    file_unique_id: 'b'
                }
            ],
            ...(mediaGroupId ? { media_group_id: mediaGroupId } : {})
        } as unknown as Message;
    };

    const buttonsOf = (keyboard: unknown): InlineKeyboardButton[] => {
        return (
            (keyboard as InlineKeyboardMarkup).inline_keyboard ?? []
        ).flat();
    };

    const callbackDataOf = (keyboard: unknown) => {
        return buttonsOf(keyboard).flatMap(button => {
            return 'callback_data' in button ? [button.callback_data] : [];
        });
    };

    const lastText = (events: SentEvent[]) => {
        const texts = events.filter(event => {
            return event.kind === 'text';
        });

        return texts[texts.length - 1] as Extract<SentEvent, { kind: 'text' }>;
    };

    const readWish = async (wishId: number) => {
        return harness.env.DB.prepare('SELECT * FROM wishes WHERE id = ?')
            .bind(wishId)
            .first<Record<string, unknown>>();
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

    describe('wishlist', () => {
        it('paginates ten wishes per page with a more button', async () => {
            const owner = await createUser({ username: 'owner' });

            await seedGeneratedWishes(harness, owner.id, 25);

            const first = createRequest(owner);

            await wishlistScreen.render(first.request, undefined);

            const firstWishes = first.events.filter(event => {
                return event.kind === 'wish';
            });

            assert.equal(firstWishes.length, 10);
            assert.equal(first.events[0]?.kind, 'text');
            assert.ok(
                callbackDataOf(lastText(first.events).keyboard).includes(
                    'wl:p:10'
                )
            );
            assert.ok(lastText(first.events).html.includes('1-10'));

            const second = createRequest(owner);

            await dispatch(second.request, 'wl:p:10');

            assert.equal(second.events[0]?.kind, 'wish');
            assert.ok(
                callbackDataOf(lastText(second.events).keyboard).includes(
                    'wl:p:20'
                )
            );

            const last = createRequest(owner);

            await dispatch(last.request, 'wl:p:20');

            assert.equal(
                last.events.filter(event => {
                    return event.kind === 'wish';
                }).length,
                5
            );
            assert.equal(
                callbackDataOf(lastText(last.events).keyboard).some(data => {
                    return data?.startsWith('wl:p:');
                }),
                false
            );
        });

        it('shows the empty state and the filter marker', async () => {
            const owner = await createUser();
            const { request, events } = createRequest(owner);

            await wishlistScreen.render(request, undefined);

            assert.equal(events.length, 1);
            assert.ok(lastText(events).html.includes('жодного запису'));
            assert.equal(
                callbackDataOf(lastText(events).keyboard).includes('wl:clean'),
                false
            );
            assert.ok(
                buttonsOf(lastText(events).keyboard).some(button => {
                    return button.text.endsWith('🔴');
                })
            );
        });

        it('persists the owner filter and reports empty filtered results', async () => {
            const owner = await createUser();
            const created = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'cheap',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(created);

            const set = createRequest(owner);

            await dispatch(set.request, 'wl:f:4');

            const persisted = await run(
                harness.repositories.users.findById(owner.id)
            );

            assert.equal(persisted?.wishlistFilter, 4);
            assert.ok(
                set.events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('Фільтр встановлений')
                    );
                })
            );

            const refreshed = createRequest(persisted as UserRecord);

            await wishlistScreen.render(refreshed.request, undefined);
            assert.ok(lastText(refreshed.events).html.includes('фільтрацією'));

            const reset = createRequest(persisted as UserRecord);

            await dispatch(reset.request, 'wl:f:x');
            assert.equal(
                (await run(harness.repositories.users.findById(owner.id)))
                    ?.wishlistFilter,
                null
            );
        });

        it('cleans only after confirmation and removes gives', async () => {
            const owner = await createUser();
            const giver = await createUser({
                username: 'giver',
                usernameSearchable: true
            });
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'wish',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);
            await run(
                harness.repositories.gives.add(giver.id, wish.id, new Date())
            );

            const ask = createRequest(owner);

            await dispatch(ask.request, 'wl:clean');
            assert.ok(
                callbackDataOf(lastText(ask.events).keyboard).includes(
                    'wl:clean:y'
                )
            );
            assert.equal((await readWish(wish.id))?.['removed'], 0);

            const confirm = createRequest(owner);

            await dispatch(confirm.request, 'wl:clean:y');
            assert.equal((await readWish(wish.id))?.['removed'], 1);
            assert.equal(
                (
                    await harness.env.DB.prepare(
                        'SELECT count(*) AS c FROM gives'
                    ).first<{ c: number }>()
                )?.c,
                0
            );
        });
    });

    describe('share', () => {
        const ORIGIN = 'https://preview-wishlist.chernenko.workers.dev';

        const toShareLinks = (publicId: string | undefined) => {
            return {
                appUrl: `https://t.me/wishlist_ua_bot?startapp=s_${publicId}`,
                pageUrl: `${ORIGIN}/w/${publicId}`
            };
        };

        const createSharingOwner = async () => {
            const owner = await createUser({ username: 'sharer' });

            await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'Bicycle',
                    'UAH',
                    new Date()
                )
            );

            return owner;
        };

        const readShareRow = (ownerId: number) => {
            return harness.env.DB.prepare(
                'SELECT * FROM wishlist_shares WHERE user_id = ?'
            )
                .bind(ownerId)
                .first<{
                    public_id: string;
                    display_name: string | null;
                    revoked_at: number | null;
                    show_username: number;
                }>();
        };

        const createSearchableSharingOwner = async (
            username = 'public_owner'
        ) => {
            const owner = await createUser({
                username,
                usernameSearchable: true
            });

            await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'Bicycle',
                    'UAH',
                    new Date()
                )
            );

            return owner;
        };

        const usernameLabels = () => {
            const { showUsername, hideUsername } =
                getMessages('uk').wishlist.share.actions;

            return { show: showUsername(), hide: hideUsername() };
        };

        const toggleTextOf = (keyboard: unknown) => {
            return buttonsOf(keyboard).find(button => {
                return (
                    'callback_data' in button &&
                    button.callback_data === 'wl:share:u'
                );
            })?.text;
        };

        it('shows the consent screen with the name and the request host', async () => {
            const owner = await createSharingOwner();
            const { request, events, telemetry } = createRequest(owner, {
                publicOrigin: ORIGIN,
                actorName: 'Ann <b>'
            });

            await dispatch(request, 'wl:share');

            const consent = lastText(events);

            assert.equal(
                consent.html,
                getMessages('uk').wishlist.share.consent({
                    name: 'Ann &lt;b&gt;',
                    host: 'preview-wishlist.chernenko.workers.dev'
                })
            );
            assert.deepEqual(callbackDataOf(consent.keyboard), [
                'wl:share:y',
                'n:wl'
            ]);
            assert.equal(await readShareRow(owner.id), null);
            assert.deepEqual(telemetry, []);
        });

        it('falls back to the production origin when the request has none', async () => {
            const owner = await createSharingOwner();
            const { request, events } = createRequest(owner);

            await dispatch(request, 'wl:share');

            assert.ok(lastText(events).html.includes('wishlist.chernenko.dev'));

            await dispatch(request, 'wl:share:y');

            const row = await readShareRow(owner.id);

            assert.ok(
                lastText(events).html.includes(
                    `https://wishlist.chernenko.dev/w/${row?.public_id}`
                )
            );
        });

        it('publishes, then reports existing for later presses', async () => {
            const owner = await createSharingOwner();
            const { request, events, telemetry } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:y');

            const row = await readShareRow(owner.id);
            const links = toShareLinks(row?.public_id);

            assert.ok(row);
            assert.equal(row.display_name, 'Test');
            assert.equal(
                lastText(events).html,
                getMessages('uk').wishlist.share.ready(links)
            );

            const buttons = buttonsOf(lastText(events).keyboard);

            assert.deepEqual(
                buttons.flatMap(button => {
                    return 'url' in button ? [button.url] : [];
                }),
                [
                    links.appUrl,
                    links.pageUrl,
                    `https://t.me/share/url?url=${encodeURIComponent(links.appUrl)}&text=${encodeURIComponent(getMessages('uk').wishlist.share.sendText({ pageUrl: links.pageUrl }))}`
                ]
            );

            await dispatch(request, 'wl:share');

            assert.equal(
                (await readShareRow(owner.id))?.public_id,
                row.public_id
            );
            assert.deepEqual(telemetry, [
                { action: 'wishlist_shared', result: 'published' },
                { action: 'wishlist_shared', result: 'existing' }
            ]);
        });

        it('refreshes a changed display name when share is pressed again', async () => {
            const owner = await createSharingOwner();

            await dispatch(
                createRequest(owner, { publicOrigin: ORIGIN }).request,
                'wl:share:y'
            );
            await dispatch(
                createRequest(owner, {
                    publicOrigin: ORIGIN,
                    actorName: 'Renamed'
                }).request,
                'wl:share'
            );

            assert.equal(
                (await readShareRow(owner.id))?.display_name,
                'Renamed'
            );
        });

        it('stops after confirmation and re-renders the wishlist', async () => {
            const owner = await createSharingOwner();
            const { request, events, telemetry } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:y');
            await dispatch(request, 'wl:share:stop');

            assert.equal(
                lastText(events).html,
                getMessages('uk').wishlist.share.stopConfirm()
            );
            assert.equal((await readShareRow(owner.id))?.revoked_at, null);

            await dispatch(request, 'wl:share:stop:y');

            const row = await readShareRow(owner.id);

            assert.notEqual(row?.revoked_at, null);
            assert.equal(row?.display_name, null);
            assert.ok(
                events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html ===
                            getMessages('uk').wishlist.share.stopped()
                    );
                })
            );
            assert.ok(
                events.some(event => {
                    return event.kind === 'wish';
                })
            );
            assert.deepEqual(telemetry.at(-1), {
                action: 'wishlist_share_stopped',
                result: 'success'
            });
        });

        describe('an active share without visible wishes', () => {
            const requestSharePage = (publicId: string) => {
                const app = createApp({}, {}, {});

                return app.request(`/ua/w/${publicId}`, {}, {
                    ...harness.env,
                    BOT_ENVIRONMENT: 'production'
                } as unknown as WorkerBindings);
            };

            const assertManageableThenStop = async (
                owner: UserRecord,
                context: ReturnType<typeof createRequest>
            ) => {
                const { request, events, telemetry } = context;
                const row = await readShareRow(owner.id);

                assert.ok(row);
                assert.ok(
                    callbackDataOf(lastText(events).keyboard).includes(
                        'wl:share'
                    )
                );

                await dispatch(request, 'wl:share');

                const link = lastText(events);
                const links = toShareLinks(row.public_id);

                assert.equal(
                    link.html,
                    `${getMessages('uk').wishlist.share.ready(links)}\n\n${getMessages('uk').wishlist.share.pageEmpty()}`
                );
                assert.deepEqual(callbackDataOf(link.keyboard), [
                    'wl:share:new',
                    'wl:share:stop',
                    'n:wl'
                ]);
                assert.equal(
                    telemetry.some(entry => {
                        return entry['result'] === 'empty';
                    }),
                    false
                );
                assert.equal(
                    (await requestSharePage(row.public_id)).status,
                    200
                );

                await dispatch(request, 'wl:share:stop');
                await dispatch(request, 'wl:share:stop:y');

                assert.notEqual(
                    (await readShareRow(owner.id))?.revoked_at,
                    null
                );
                assert.deepEqual(telemetry.at(-1), {
                    action: 'wishlist_share_stopped',
                    result: 'success'
                });
                assert.equal(
                    (await requestSharePage(row.public_id)).status,
                    410
                );
            };

            it('stays manageable after the list is cleaned', async () => {
                const owner = await createSharingOwner();
                const context = createRequest(owner, { publicOrigin: ORIGIN });

                await dispatch(context.request, 'wl:share:y');
                await dispatch(context.request, 'wl:clean:y');
                await assertManageableThenStop(owner, context);

                assert.equal(
                    callbackDataOf(lastText(context.events).keyboard).includes(
                        'wl:share'
                    ),
                    false
                );
            });

            it('stays manageable after every wish is hidden', async () => {
                const owner = await createUser({ username: 'hider' });
                const wish = await run(
                    harness.repositories.wishes.create(
                        owner.id,
                        'Bicycle',
                        'UAH',
                        new Date()
                    )
                );

                assert.ok(wish);

                const context = createRequest(owner, { publicOrigin: ORIGIN });

                await dispatch(context.request, 'wl:share:y');
                await run(
                    harness.repositories.wishes.toggleHidden(
                        wish.id,
                        owner.id,
                        new Date()
                    )
                );
                await wishlistScreen.render(context.request, undefined);
                await assertManageableThenStop(owner, context);
            });

            it('does not offer sharing on an empty list without an active share', async () => {
                const owner = await createUser();
                const { request, events } = createRequest(owner);

                await wishlistScreen.render(request, undefined);

                assert.equal(
                    callbackDataOf(lastText(events).keyboard).includes(
                        'wl:share'
                    ),
                    false
                );
            });
        });

        it('keeps the username off by default and offers the toggle to owners with a public username', async () => {
            const owner = await createSearchableSharingOwner();
            const { request, events } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:y');

            assert.equal((await readShareRow(owner.id))?.show_username, 0);
            assert.deepEqual(callbackDataOf(lastText(events).keyboard), [
                'wl:share:u',
                'wl:share:new',
                'wl:share:stop',
                'n:wl'
            ]);
            assert.equal(
                toggleTextOf(lastText(events).keyboard),
                usernameLabels().show
            );
        });

        it('hides the toggle when the owner has no public username', async () => {
            const notSearchable = await createSharingOwner();
            const noUsername = await createUser({
                usernameSearchable: true
            });

            await run(
                harness.repositories.wishes.create(
                    noUsername.id,
                    'Book',
                    'UAH',
                    new Date()
                )
            );

            for (const owner of [notSearchable, noUsername]) {
                const { request, events } = createRequest(owner, {
                    publicOrigin: ORIGIN
                });

                await dispatch(request, 'wl:share:y');

                assert.equal(
                    callbackDataOf(lastText(events).keyboard).includes(
                        'wl:share:u'
                    ),
                    false
                );
            }
        });

        it('toggles the username on and off and records the result', async () => {
            const owner = await createSearchableSharingOwner();
            const { request, events, telemetry } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:y');

            const created = await readShareRow(owner.id);
            const links = toShareLinks(created?.public_id);

            await dispatch(request, 'wl:share:u');

            const enabled = await readShareRow(owner.id);

            assert.equal(enabled?.show_username, 1);
            assert.equal(enabled?.public_id, created?.public_id);
            assert.equal(
                lastText(events).html,
                getMessages('uk').wishlist.share.ready(links)
            );
            assert.equal(
                toggleTextOf(lastText(events).keyboard),
                usernameLabels().hide
            );

            await dispatch(request, 'wl:share:u');

            assert.equal((await readShareRow(owner.id))?.show_username, 0);
            assert.equal(
                toggleTextOf(lastText(events).keyboard),
                usernameLabels().show
            );
            assert.deepEqual(telemetry.slice(1), [
                { action: 'wishlist_share_username_toggled', result: 'on' },
                { action: 'wishlist_share_username_toggled', result: 'off' }
            ]);
        });

        it('keeps the chosen username state when the share is pressed again', async () => {
            const owner = await createSearchableSharingOwner();
            const { request, events } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:y');
            await dispatch(request, 'wl:share:u');
            await dispatch(request, 'wl:share');

            assert.equal((await readShareRow(owner.id))?.show_username, 1);
            assert.equal(
                toggleTextOf(lastText(events).keyboard),
                usernameLabels().hide
            );
        });

        it('does not enable the username for an owner who is not searchable', async () => {
            const owner = await createSharingOwner();
            const { request, telemetry } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:y');
            await dispatch(request, 'wl:share:u');

            assert.equal((await readShareRow(owner.id))?.show_username, 0);
            assert.deepEqual(telemetry, [
                { action: 'wishlist_shared', result: 'published' }
            ]);
        });

        it('sends a caller without a share to the consent screen and leaves other shares alone', async () => {
            const sharer = await createSearchableSharingOwner();
            const stranger =
                await createSearchableSharingOwner('stranger_user');
            const sharerRequest = createRequest(sharer, {
                publicOrigin: ORIGIN
            });
            const strangerRequest = createRequest(stranger, {
                publicOrigin: ORIGIN
            });

            await dispatch(sharerRequest.request, 'wl:share:y');
            await dispatch(strangerRequest.request, 'wl:share:u');

            assert.deepEqual(
                callbackDataOf(lastText(strangerRequest.events).keyboard),
                ['wl:share:y', 'n:wl']
            );
            assert.equal(await readShareRow(stranger.id), null);
            assert.equal((await readShareRow(sharer.id))?.show_username, 0);
            assert.deepEqual(strangerRequest.telemetry, []);
        });

        it('forgets the username choice after stopping and sharing again', async () => {
            const owner = await createSearchableSharingOwner();
            const { request } = createRequest(owner, { publicOrigin: ORIGIN });

            await dispatch(request, 'wl:share:y');
            await dispatch(request, 'wl:share:u');
            await dispatch(request, 'wl:share:stop:y');
            await dispatch(request, 'wl:share:y');

            const row = await readShareRow(owner.id);

            assert.equal(row?.revoked_at, null);
            assert.equal(row?.show_username, 0);
        });

        it('rotates the public id after confirmation', async () => {
            const owner = await createSharingOwner();
            const { request, events, telemetry } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:y');

            const before = await readShareRow(owner.id);

            await dispatch(request, 'wl:share:new');
            assert.equal(
                lastText(events).html,
                getMessages('uk').wishlist.share.newConfirm()
            );
            assert.equal(
                (await readShareRow(owner.id))?.public_id,
                before?.public_id
            );

            await dispatch(request, 'wl:share:new:y');

            const after = await readShareRow(owner.id);

            assert.notEqual(after?.public_id, before?.public_id);
            assert.equal(
                lastText(events).html,
                getMessages('uk').wishlist.share.rotated(
                    toShareLinks(after?.public_id)
                )
            );
            assert.deepEqual(telemetry.at(-1), {
                action: 'wishlist_share_rotated',
                result: 'success'
            });
        });

        it('shows the consent screen when rotating without an active share', async () => {
            const owner = await createSharingOwner();
            const { request, events } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:new:y');

            assert.deepEqual(callbackDataOf(lastText(events).keyboard), [
                'wl:share:y',
                'n:wl'
            ]);
        });

        it('reports an empty list without writing a share', async () => {
            const owner = await createUser();
            const { request, events, telemetry } = createRequest(owner);

            await dispatch(request, 'wl:share');
            await dispatch(request, 'wl:share:y');

            assert.ok(
                events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html === getMessages('uk').wishlist.share.empty()
                    );
                })
            );
            assert.equal(await readShareRow(owner.id), null);
            assert.deepEqual(telemetry, [
                { action: 'wishlist_shared', result: 'empty' },
                { action: 'wishlist_shared', result: 'empty' }
            ]);
        });

        it('builds the canonical link in production whatever the request origin is', async () => {
            const owner = await createSharingOwner();
            const { request, events } = createRequest(owner, {
                publicOrigin: ORIGIN,
                environment: 'production'
            });

            await dispatch(request, 'wl:share');

            assert.ok(lastText(events).html.includes('wishlist.chernenko.dev'));
            assert.equal(lastText(events).html.includes(ORIGIN), false);

            await dispatch(request, 'wl:share:y');

            const row = await readShareRow(owner.id);

            assert.ok(
                lastText(events).html.includes(
                    `https://wishlist.chernenko.dev/w/${row?.public_id}`
                )
            );
        });

        it('shows the current state instead of stopped when there is nothing to stop', async () => {
            const owner = await createSharingOwner();
            const { request, events, telemetry } = createRequest(owner, {
                publicOrigin: ORIGIN
            });

            await dispatch(request, 'wl:share:stop:y');

            assert.equal(
                events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html ===
                            getMessages('uk').wishlist.share.stopped()
                    );
                }),
                false
            );
            assert.deepEqual(callbackDataOf(lastText(events).keyboard), [
                'wl:share:y',
                'n:wl'
            ]);
            assert.deepEqual(telemetry, []);
        });

        it('rejects every share callback from a guest', async () => {
            const owner = await createUser();
            const guest = createRequest(owner);

            guest.request.user = null;

            for (const data of [
                'wl:share',
                'wl:share:y',
                'wl:share:stop',
                'wl:share:stop:y',
                'wl:share:new',
                'wl:share:new:y',
                'wl:share:u'
            ]) {
                await assert.rejects(dispatch(guest.request, data), {
                    name: 'BotUserError'
                });
            }

            assert.equal(guest.events.length, 0);
        });

        it('records share_failed and keeps the bot alive when saving fails', async () => {
            const owner = await createSharingOwner();
            const failing = {
                ...harness.repositories,
                shares: {
                    ...harness.repositories.shares,
                    publish: () => {
                        return Effect.fail(new Error('database unavailable'));
                    }
                }
            } as unknown as BotRequest['repos'];
            const { request, events, telemetry } = createRequest(owner, {
                repos: failing
            });

            await dispatch(request, 'wl:share:y');

            assert.deepEqual(telemetry[0], {
                action: 'wishlist_shared',
                result: 'failed'
            });
            assert.equal(telemetry[1]?.event, 'share_failed');
            assert.ok(
                events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html === getMessages('uk').errors.unknown()
                    );
                })
            );
            assert.equal(await readShareRow(owner.id), null);
        });
    });

    describe('wish add and edit', () => {
        it('creates a wish from the title and opens the ten-action edit menu', async () => {
            const owner = await createUser();
            const { request, events, savedSessions } = createRequest(owner);

            await wishAddScreen.render(request, undefined);
            assert.deepEqual(savedSessions.at(-1)?.pendingInput, {
                kind: 'wishTitleNew'
            });

            await wishAddScreen.onInput?.(
                request,
                { kind: 'wishTitleNew' },
                textMessage('  Кавоварка  ')
            );

            const menu = lastText(events);

            assert.equal(buttonsOf(menu.keyboard).length, 10);
            assert.equal(savedSessions.at(-1)?.pendingInput, null);

            const stored = await harness.env.DB.prepare(
                'SELECT title FROM wishes'
            ).first<{
                title: string;
            }>();

            assert.equal(stored?.title, 'Кавоварка');
        });

        it('rejects a title with a link and keeps waiting for input', async () => {
            const owner = await createUser();
            const { request, savedSessions } = createRequest(owner);

            await wishAddScreen.onInput?.(
                request,
                { kind: 'wishTitleNew' },
                textMessage('buy http://shop.test')
            );

            assert.deepEqual(savedSessions.at(-1)?.pendingInput, {
                kind: 'wishTitleNew'
            });
            assert.equal(
                (
                    await harness.env.DB.prepare(
                        'SELECT count(*) AS c FROM wishes'
                    ).first<{ c: number }>()
                )?.c,
                0
            );
        });

        it('updates price, link, description and title through field prompts', async () => {
            const owner = await createUser();
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'old',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);

            const fieldInput = async (
                field: 'title' | 'description' | 'link' | 'price',
                text: string
            ) => {
                const { request, events } = createRequest(owner);
                const pending: PendingInput = {
                    kind: 'wishField',
                    wishId: wish.id,
                    field
                };

                await wishEditScreen.onInput?.(
                    request,
                    pending,
                    textMessage(text)
                );

                return events;
            };

            await fieldInput('price', '1 500');
            assert.equal((await readWish(wish.id))?.['price'], 1500);

            const rejected = await fieldInput('price', 'abc');

            assert.ok(
                rejected.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('Некоректна вартість')
                    );
                })
            );
            assert.ok(
                rejected.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('Оновити вартість')
                    );
                })
            );
            assert.equal((await readWish(wish.id))?.['price'], 1500);

            await fieldInput('price', '❌ Видалити');
            assert.equal((await readWish(wish.id))?.['price'], 0);

            await fieldInput('link', 'look https://shop.test/a?b=1 please');
            assert.equal(
                (await readWish(wish.id))?.['link'],
                'https://shop.test/a?b=1'
            );

            await fieldInput('link', '❌ Remove');
            assert.equal((await readWish(wish.id))?.['link'], null);

            await fieldInput('description', 'Опис <b>');
            assert.equal(
                (await readWish(wish.id))?.['description'],
                'Опис <b>'
            );

            await fieldInput('title', 'Нова назва');
            assert.equal((await readWish(wish.id))?.['title'], 'Нова назва');
        });

        it('toggles priority and visibility for the owner only', async () => {
            const owner = await createUser();
            const stranger = await createUser();
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'wish',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);

            const own = createRequest(owner);

            await dispatch(own.request, `w:pl:${wish.id}:3`);
            await dispatch(own.request, `w:v:${wish.id}`);
            assert.equal((await readWish(wish.id))?.['priority'], 1);
            assert.equal((await readWish(wish.id))?.['hidden'], 1);

            const foreign = createRequest(stranger);

            await dispatch(foreign.request, `w:pl:${wish.id}:0`);
            assert.equal((await readWish(wish.id))?.['priority'], 1);
            assert.ok(lastText(foreign.events).html.length > 0);
        });

        it('debounces an album so only the last photo renders the edit menu', async () => {
            const owner = await createUser();
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'wish',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);

            const pending: PendingInput = {
                kind: 'wishField',
                wishId: wish.id,
                field: 'images'
            };
            const session: SessionState = {
                v: 1,
                pendingInput: pending,
                find: null
            };
            const photos = [0, 1, 2].map(() => {
                updateIdSequence += 1;

                const created = createRequest(owner, { session });

                (
                    created.request.ctx.update as { update_id: number }
                ).update_id = updateIdSequence;

                return created;
            });

            for (const [index, created] of photos.entries()) {
                await wishEditScreen.onInput?.(
                    created.request,
                    pending,
                    photoMessage(`file-${index}`, 'album-1')
                );
            }

            assert.deepEqual(
                photos.map(created => {
                    return created.deferred.length;
                }),
                [1, 1, 1]
            );
            assert.equal(photos[0]?.deferred[0]?.delayMs, 1500);
            assert.equal(
                photos.reduce((total, created) => {
                    return total + created.events.length;
                }, 0),
                0
            );

            for (const created of photos) {
                await created.deferred[0]?.task();
            }

            assert.equal(photos[0]?.events.length, 0);
            assert.equal(photos[1]?.events.length, 0);
            assert.equal(photos[2]?.events.length, 3);
            assert.ok(photos[2]?.events[0]?.kind === 'text');
            assert.deepEqual(
                JSON.parse(String((await readWish(wish.id))?.['images'])),
                ['file-0', 'file-1', 'file-2']
            );

            const savedSession = await run(
                harness.repositories.sessions.get(owner.telegramId)
            );

            assert.deepEqual(JSON.parse(savedSession?.state ?? '{}'), {
                v: 1,
                pendingInput: null,
                find: null,
                album: { mediaGroupId: 'album-1', wishId: wish.id }
            });
            assert.equal(savedSession?.mediaGroupMarker, null);
        });

        it('caps images at nine and clears them with the remove label', async () => {
            const owner = await createUser();
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'wish',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);

            const pending: PendingInput = {
                kind: 'wishField',
                wishId: wish.id,
                field: 'images'
            };

            for (let index = 0; index < 10; index += 1) {
                const created = createRequest(owner);

                await wishEditScreen.onInput?.(
                    created.request,
                    pending,
                    photoMessage(`file-${index}`)
                );

                if (index === 9) {
                    assert.ok(
                        created.events.some(event => {
                            return (
                                event.kind === 'text' &&
                                event.html.includes('9')
                            );
                        })
                    );
                }
            }

            assert.equal(
                JSON.parse(String((await readWish(wish.id))?.['images']))
                    .length,
                9
            );

            const clear = createRequest(owner);

            await wishEditScreen.onInput?.(
                clear.request,
                pending,
                textMessage('❌ Видалити')
            );
            assert.equal((await readWish(wish.id))?.['images'], '[]');
            assert.ok(
                clear.events.some(event => {
                    return event.kind === 'deleteIncoming';
                })
            );
        });

        it('removes a wish as done or dropped with confirmation', async () => {
            const owner = await createUser();
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'wish',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);

            const ask = createRequest(owner);

            await dispatch(ask.request, `w:r:${wish.id}`);
            assert.deepEqual(callbackDataOf(lastText(ask.events).keyboard), [
                `w:r:y:${wish.id}`,
                `w:r:n:${wish.id}`
            ]);

            const confirm = createRequest(owner);

            await dispatch(confirm.request, `w:r:y:${wish.id}`);
            assert.equal((await readWish(wish.id))?.['removed'], 1);
            assert.equal((await readWish(wish.id))?.['done'], 1);
        });
    });

    describe('wish limit and R2 cleanup', () => {
        const imageKey = (fileId: string) => {
            return createHash('sha256').update(fileId).digest('hex');
        };

        const putObject = async (fileId: string) => {
            await harness.env.IMAGES.put(imageKey(fileId), 'bytes');
        };

        const hasObject = async (fileId: string) => {
            return (await harness.env.IMAGES.get(imageKey(fileId))) !== null;
        };

        const withImages = (created: ReturnType<typeof createRequest>) => {
            created.request.env = {
                ...created.request.env,
                IMAGES: harness.env.IMAGES
            };

            return created;
        };

        const flushDeferred = async (
            created: ReturnType<typeof createRequest>
        ) => {
            for (const { task } of created.deferred) {
                await task();
            }
        };

        const seedWishWithImages = async (
            userId: number,
            fileIds: string[]
        ) => {
            const wish = await run(
                harness.repositories.wishes.create(
                    userId,
                    'wish',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);

            for (const fileId of fileIds) {
                await run(
                    harness.repositories.wishes.appendImage(
                        wish.id,
                        userId,
                        fileId,
                        new Date()
                    )
                );
                await putObject(fileId);
            }

            return wish;
        };

        beforeEach(async () => {
            const listed = await harness.env.IMAGES.list();

            await Promise.all(
                listed.objects.map(object => {
                    return harness.env.IMAGES.delete(object.key);
                })
            );
        });

        it('refuses to start the add flow at 500 active wishes and tells the user', async () => {
            const owner = await createUser();

            await seedGeneratedWishes(harness, owner.id, 500);

            const { request, events, savedSessions } = createRequest(owner);

            await wishAddScreen.render(request, undefined);

            assert.equal(
                lastText(events).html,
                getMessages('uk').wishlist.add.limit()
            );
            assert.equal(savedSessions.at(-1)?.pendingInput, null);
        });

        it('refuses a submitted title at 500 active wishes without creating a wish', async () => {
            const owner = await createUser();

            await seedGeneratedWishes(harness, owner.id, 500);

            const { request, events } = createRequest(owner);

            await wishAddScreen.onInput?.(
                request,
                { kind: 'wishTitleNew' },
                textMessage('One too many')
            );

            assert.equal(
                lastText(events).html,
                getMessages('uk').wishlist.add.limit()
            );
            assert.equal(await countRows(harness, 'wishes'), 500);
        });

        it('lets a user below the limit add a wish, and removed wishes do not count', async () => {
            const owner = await createUser();

            await seedGeneratedWishes(harness, owner.id, 500);
            await harness.env.DB.prepare(
                'UPDATE wishes SET removed = 1 WHERE id = (SELECT min(id) FROM wishes)'
            ).run();

            const { request } = createRequest(owner);

            await wishAddScreen.onInput?.(
                request,
                { kind: 'wishTitleNew' },
                textMessage('Fits')
            );

            assert.equal(await countRows(harness, 'wishes'), 501);
        });

        it('deletes the R2 objects after the confirmed wish removal, keeping objects another wish uses', async () => {
            const owner = await createUser();
            const wish = await seedWishWithImages(owner.id, ['gone', 'kept']);

            await seedWishWithImages(owner.id, ['kept']);

            const confirm = withImages(createRequest(owner));

            await dispatch(confirm.request, `w:r:y:${wish.id}`);
            assert.equal(confirm.deferred.length, 1);
            await flushDeferred(confirm);
            assert.equal(await hasObject('gone'), false);
            assert.equal(await hasObject('kept'), true);
        });

        it('deletes the R2 objects of every wish when the list is cleaned', async () => {
            const owner = await createUser();
            const stranger = await createUser();

            await seedWishWithImages(owner.id, ['a']);
            await seedWishWithImages(owner.id, ['b']);
            await seedWishWithImages(stranger.id, ['c']);

            const confirm = withImages(createRequest(owner));

            await dispatch(confirm.request, 'wl:clean:y');
            await flushDeferred(confirm);
            assert.equal(await hasObject('a'), false);
            assert.equal(await hasObject('b'), false);
            assert.equal(await hasObject('c'), true);
        });

        it('deletes the R2 objects when the photos are cleared with the remove label', async () => {
            const owner = await createUser();
            const wish = await seedWishWithImages(owner.id, ['x', 'y']);
            const clear = withImages(createRequest(owner));

            await wishEditScreen.onInput?.(
                clear.request,
                { kind: 'wishField', wishId: wish.id, field: 'images' },
                textMessage('❌ Видалити')
            );
            await flushDeferred(clear);
            assert.equal(await hasObject('x'), false);
            assert.equal(await hasObject('y'), false);
        });
    });

    describe('find and third-party list', () => {
        const createOwnerWithWishes = async () => {
            const owner = await createUser({
                username: 'Alice',
                usernameSearchable: true,
                payments: 'mono <jar>'
            });
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'Gift',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);

            return { owner, wish };
        };

        it('finds a user case-insensitively and renders the list with payments', async () => {
            const { owner } = await createOwnerWithWishes();
            const viewer = await createUser({
                username: 'bob',
                usernameSearchable: true
            });
            const { request, events, savedSessions } = createRequest(viewer);

            await findListScreen.render(request, undefined);
            await findListScreen.onInput?.(
                request,
                { kind: 'findQuery' },
                textMessage('@aLiCe')
            );

            assert.deepEqual(savedSessions.at(-1)?.find, {
                targetUserId: owner.id,
                query: '@aLiCe',
                filter: null
            });
            assert.equal(savedSessions.at(-1)?.pendingInput, null);
            assert.ok(
                events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('<b>@aLiCe</b>')
                    );
                })
            );
            assert.ok(
                events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('mono &lt;jar&gt;')
                    );
                })
            );
            assert.equal(
                events.filter(event => {
                    return event.kind === 'wish';
                }).length,
                1
            );
        });

        it('keeps the third-party filter when the same person is searched again', async () => {
            const { owner } = await createOwnerWithWishes();
            const viewer = await createUser();
            const { request } = createRequest(viewer);

            await findListScreen.render(request, undefined);
            await findListScreen.onInput?.(
                request,
                { kind: 'findQuery' },
                textMessage('alice')
            );
            await dispatch(request, `t:f:${owner.id}:4`);
            assert.equal(request.session.find?.filter, 4);

            await findListScreen.render(request, undefined);
            await findListScreen.onInput?.(
                request,
                { kind: 'findQuery' },
                textMessage('alice')
            );
            assert.equal(request.session.find?.filter, 4);

            await findListScreen.onInput?.(
                request,
                { kind: 'findQuery' },
                textMessage('Alice')
            );
            assert.equal(request.session.find?.filter, null);
        });

        it('reports unknown users and blocks self-search except for admins', async () => {
            const { owner } = await createOwnerWithWishes();
            const missing = createRequest(owner);

            await findListScreen.onInput?.(
                missing.request,
                { kind: 'findQuery' },
                textMessage('nobody')
            );
            assert.ok(
                missing.events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('не знайдена')
                    );
                })
            );
            assert.deepEqual(missing.savedSessions.at(-1)?.pendingInput, {
                kind: 'findQuery'
            });

            const self = createRequest(owner);

            await findListScreen.onInput?.(
                self.request,
                { kind: 'findQuery' },
                textMessage('alice')
            );
            assert.ok(
                self.events.some(event => {
                    return (
                        event.kind === 'text' && event.html.includes('хитра')
                    );
                })
            );

            const admin = createRequest(owner, { isAdmin: true });

            await findListScreen.onInput?.(
                admin.request,
                { kind: 'findQuery' },
                textMessage('alice')
            );
            assert.equal(
                admin.events.filter(event => {
                    return event.kind === 'wish';
                }).length,
                1
            );
        });

        it('finds by phone digits and ignores short numbers', async () => {
            const owner = await createUser({
                phone: '+380501234567',
                phoneDigits: '380501234567'
            });
            const viewer = await createUser();

            await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'Gift',
                    'UAH',
                    new Date()
                )
            );

            const hit = createRequest(viewer);

            await findListScreen.onInput?.(
                hit.request,
                { kind: 'findQuery' },
                textMessage('+38 (050) 123-45-67')
            );
            assert.equal(
                hit.events.filter(event => {
                    return event.kind === 'wish';
                }).length,
                1
            );

            const short = createRequest(viewer);

            await findListScreen.onInput?.(
                short.request,
                { kind: 'findQuery' },
                textMessage('0501234')
            );
            assert.ok(
                short.events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('не знайдена')
                    );
                })
            );
        });

        it('hides hidden wishes and applies the session price filter', async () => {
            const { owner, wish } = await createOwnerWithWishes();
            const viewer = await createUser();

            await run(
                harness.repositories.wishes.toggleHidden(
                    wish.id,
                    owner.id,
                    new Date()
                )
            );
            await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'Visible',
                    'UAH',
                    new Date()
                )
            );

            const { request, events } = createRequest(viewer);

            await thirdWishlistScreen.render(request, { ownerId: owner.id });

            const wishes = events.filter(event => {
                return event.kind === 'wish';
            });

            assert.equal(wishes.length, 1);

            const filtered = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await dispatch(filtered.request, `t:f:${owner.id}:4`);
            assert.ok(
                filtered.events.some(event => {
                    return (
                        event.kind === 'text' &&
                        event.html.includes('фільтрацією')
                    );
                })
            );
            assert.equal(filtered.savedSessions.at(-1)?.find?.filter, 4);
        });

        it('gives and takes with a toast and in-place keyboard edit', async () => {
            const { owner, wish } = await createOwnerWithWishes();
            const viewer = await createUser();
            const other = await createUser();

            await run(
                harness.repositories.gives.add(other.id, wish.id, new Date())
            );

            const listing = createRequest(viewer);

            await thirdWishlistScreen.render(listing.request, {
                ownerId: owner.id
            });

            const listed = listing.events.find(event => {
                return event.kind === 'wish';
            }) as Extract<SentEvent, { kind: 'wish' }>;

            assert.ok(listed.item.html.includes('Забронювали: 1'));
            assert.deepEqual(callbackDataOf(listed.keyboard), [
                `t:g:${wish.id}`
            ]);

            const give = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await dispatch(give.request, `t:g:${wish.id}`);
            assert.deepEqual(
                give.events.map(event => event.kind),
                ['toast', 'replaceKeyboard']
            );
            assert.ok(
                (give.events[0] as { text: string }).text.includes(
                    'Заброньовано!'
                )
            );
            assert.deepEqual(
                callbackDataOf(
                    (give.events[1] as { keyboard: InlineKeyboardMarkup })
                        .keyboard
                ),
                [`t:t:${wish.id}`]
            );

            const again = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await dispatch(again.request, `t:g:${wish.id}`);
            assert.ok(
                (again.events[0] as { text: string }).text.includes(
                    'Уже заброньовано'
                )
            );

            const take = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await dispatch(take.request, `t:t:${wish.id}`);
            assert.ok(
                (take.events[0] as { text: string }).text.includes(
                    'Бронь скасовано'
                )
            );
            assert.deepEqual(
                callbackDataOf(
                    (take.events[1] as { keyboard: InlineKeyboardMarkup })
                        .keyboard
                ),
                [`t:g:${wish.id}`]
            );
        });

        it('refuses to give your own, hidden or unknown wishes', async () => {
            const { owner, wish } = await createOwnerWithWishes();
            const own = createRequest(owner);

            await dispatch(own.request, `t:g:${wish.id}`);
            assert.deepEqual(
                own.events.map(event => event.kind),
                ['toast']
            );

            const viewer = await createUser();

            await run(
                harness.repositories.wishes.toggleHidden(
                    wish.id,
                    owner.id,
                    new Date()
                )
            );

            const hidden = createRequest(viewer);

            await dispatch(hidden.request, `t:g:${wish.id}`);
            assert.deepEqual(
                hidden.events.map(event => event.kind),
                ['toast']
            );
            assert.equal(
                (
                    await harness.env.DB.prepare(
                        'SELECT count(*) AS c FROM gives'
                    ).first<{ c: number }>()
                )?.c,
                0
            );
        });
    });

    describe('give list', () => {
        it('lists gives with owner and other givers and removes only own give', async () => {
            const owner = await createUser({
                username: 'Alice',
                usernameSearchable: true
            });
            const phoneOwner = await createUser({
                username: 'hidden-name',
                usernameSearchable: false,
                phone: '+380501112233',
                phoneDigits: '380501112233'
            });
            const viewer = await createUser();
            const other = await createUser();
            const first = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'First',
                    'UAH',
                    new Date()
                )
            );
            const second = await run(
                harness.repositories.wishes.create(
                    phoneOwner.id,
                    'Second',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(first && second);
            await run(
                harness.repositories.gives.add(viewer.id, first.id, new Date())
            );
            await run(
                harness.repositories.gives.add(viewer.id, second.id, new Date())
            );
            await run(
                harness.repositories.gives.add(other.id, first.id, new Date())
            );

            const { request, events } = createRequest(viewer);

            await giveListScreen.render(request, undefined);

            const wishes = events.filter(event => {
                return event.kind === 'wish';
            }) as Array<Extract<SentEvent, { kind: 'wish' }>>;

            assert.equal(wishes.length, 2);
            assert.ok(wishes[0]?.item.html.includes('Також забронювали: 1'));
            assert.ok(wishes[0]?.item.html.includes('<b>@Alice</b>'));
            assert.ok(!wishes[1]?.item.html.includes('380501112233'));
            assert.equal(wishes[1]?.item.html.includes('hidden-name'), false);
            assert.deepEqual(callbackDataOf(wishes[0]?.keyboard), [
                `g:r:${first.id}`
            ]);

            const remove = createRequest(viewer);

            await dispatch(remove.request, `g:r:${first.id}`);
            assert.deepEqual(
                remove.events.map(event => event.kind),
                ['toast', 'replaceKeyboard']
            );
            assert.deepEqual(
                (remove.events[1] as { keyboard: InlineKeyboardMarkup })
                    .keyboard.inline_keyboard,
                []
            );

            const rows = await harness.env.DB.prepare(
                'SELECT user_id, wish_id FROM gives ORDER BY id'
            ).all<{ user_id: number; wish_id: number }>();

            assert.deepEqual(
                rows.results.map(row => [row.user_id, row.wish_id]),
                [
                    [viewer.id, second.id],
                    [other.id, first.id]
                ]
            );
        });

        it('hides wishes of blocked owners and cleans after confirmation', async () => {
            const owner = await createUser({
                username: 'Alice',
                usernameSearchable: true
            });
            const viewer = await createUser();
            const wish = await run(
                harness.repositories.wishes.create(
                    owner.id,
                    'First',
                    'UAH',
                    new Date()
                )
            );

            assert.ok(wish);
            await run(
                harness.repositories.gives.add(viewer.id, wish.id, new Date())
            );
            await run(
                harness.repositories.users.markBlockedByTelegramId(
                    owner.telegramId,
                    new Date()
                )
            );

            const { request, events } = createRequest(viewer);

            await giveListScreen.render(request, undefined);

            assert.equal(
                events.some(event => {
                    return event.kind === 'wish';
                }),
                false
            );

            const ask = createRequest(viewer);

            await dispatch(ask.request, 'g:clean');
            assert.ok(
                callbackDataOf(lastText(ask.events).keyboard).includes(
                    'g:clean:y'
                )
            );

            const confirm = createRequest(viewer);

            await dispatch(confirm.request, 'g:clean:y');
            assert.equal(
                (
                    await harness.env.DB.prepare(
                        'SELECT count(*) AS c FROM gives'
                    ).first<{ c: number }>()
                )?.c,
                0
            );
            assert.ok(
                lastText(confirm.events).html.includes('поки що нічого немає')
            );
        });
    });
});
