import assert from 'node:assert/strict';
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
import { callbacks as wishRemoveCallbacks } from '../../src/bot/screens/wish-remove';
import {
    callbacks as wishlistCallbacks,
    screen as wishlistScreen
} from '../../src/bot/screens/wishlist';
import type { UserRecord } from '../../src/db/repositories';
import {
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
        options: { isAdmin?: boolean; session?: SessionState } = {}
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
                REVOLUT_URL: 'https://revolut.test'
            },
            locale: 'uk',
            LL: getMessages('uk'),
            actor: {
                id: user.telegramId,
                is_bot: false,
                first_name: 'Test',
                username: user.username ?? undefined
            },
            user,
            session: options.session ?? {
                v: 1,
                pendingInput: null,
                find: null
            },
            isAdmin: options.isAdmin ?? false,
            repos: harness.repositories,
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
                harness.repositories.wishes.create(owner.id, 'wish', new Date())
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
                harness.repositories.wishes.create(owner.id, 'old', new Date())
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
            assert.ok(lastText(rejected).html.includes('Оновити вартість'));
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
                harness.repositories.wishes.create(owner.id, 'wish', new Date())
            );

            assert.ok(wish);

            const own = createRequest(owner);

            await dispatch(own.request, `w:t:${wish.id}`);
            await dispatch(own.request, `w:v:${wish.id}`);
            assert.equal((await readWish(wish.id))?.['priority'], 1);
            assert.equal((await readWish(wish.id))?.['hidden'], 1);

            const foreign = createRequest(stranger);

            await dispatch(foreign.request, `w:t:${wish.id}`);
            assert.equal((await readWish(wish.id))?.['priority'], 1);
            assert.ok(lastText(foreign.events).html.length > 0);
        });

        it('debounces an album so only the last photo renders the edit menu', async () => {
            const owner = await createUser();
            const wish = await run(
                harness.repositories.wishes.create(owner.id, 'wish', new Date())
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
                harness.repositories.wishes.create(owner.id, 'wish', new Date())
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
                harness.repositories.wishes.create(owner.id, 'wish', new Date())
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

    describe('find and third-party list', () => {
        const createOwnerWithWishes = async () => {
            const owner = await createUser({
                username: 'Alice',
                usernameSearchable: true,
                payments: 'mono <jar>'
            });
            const wish = await run(
                harness.repositories.wishes.create(owner.id, 'Gift', new Date())
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
                harness.repositories.wishes.create(owner.id, 'Gift', new Date())
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

            assert.ok(listed.item.html.includes('Вже хочуть подарувати: 1'));
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
                    'успішно додано'
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
                    'вже додано'
                )
            );

            const take = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await dispatch(take.request, `t:t:${wish.id}`);
            assert.ok(
                (take.events[0] as { text: string }).text.includes(
                    'видалено зі списку'
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
                    new Date()
                )
            );
            const second = await run(
                harness.repositories.wishes.create(
                    phoneOwner.id,
                    'Second',
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
            assert.ok(
                wishes[0]?.item.html.includes('Також хочуть подарувати: 1')
            );
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
            assert.ok(lastText(confirm.events).html.includes('жодного запису'));
        });
    });
});
