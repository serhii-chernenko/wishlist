import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';
import type { Context } from 'telegraf';
import type {
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message
} from 'telegraf/types';

import {
    encodeCallbackData,
    type EncodableCallbackAction
} from '../../src/bot/callback-data';
import { getMessages } from '../../src/bot/content/messages';
import { WISHES_PAGE_SIZE } from '../../src/bot/content/pagination';
import type {
    BotRequest,
    BotServices,
    CallbackAction,
    CallbackTable,
    SessionState
} from '../../src/bot/runtime/types';
import {
    callbacks as deliveryCallbacks,
    screen as deliveryScreen
} from '../../src/bot/screens/delivery';
import {
    callbacks as disclosureCallbacks,
    screen as disclosureScreen
} from '../../src/bot/screens/disclosure';
import { screen as thirdWishlistScreen } from '../../src/bot/screens/third-wishlist';
import { callbacks as wishlistCallbacks } from '../../src/bot/screens/wishlist';
import type { UserRecord } from '../../src/db/repositories';
import { FALLBACK_RATES } from '../../src/shared/money';
import {
    createD1Harness,
    seedGeneratedWishes,
    type D1Harness
} from './d1-harness';

type SentEvent =
    | { kind: 'text'; html: string; keyboard: unknown }
    | { kind: 'wish'; html: string }
    | { kind: 'toast'; text: string };

const LL = getMessages('uk');
const PHONE = '+380631112233';
const PHONE_FORMATTED = '+380 63 111 22 33';
const RAW_ADDRESS = 'Locker <b>7</b> & "Kyiv"';
const ESCAPED_ADDRESS = 'Locker &lt;b&gt;7&lt;/b&gt; &amp; &quot;Kyiv&quot;';

describe('contact and disclosure in the bot', () => {
    let harness: D1Harness;
    let telegramIdSequence = 70_000;

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
                username: `user${telegramIdSequence}`,
                usernameSearchable: true,
                ...overrides
            })
        );

        assert.ok(created);

        return created;
    };

    const reload = async (user: UserRecord) => {
        const fresh = await run(harness.repositories.users.findById(user.id));

        assert.ok(fresh);

        return fresh;
    };

    const createOwner = async (disclosure: {
        showPayments?: boolean;
        showPhone?: boolean;
        showAddress?: boolean;
    }) => {
        const owner = await createUser({
            phone: PHONE,
            phoneDigits: PHONE.slice(1),
            payments: 'Jar payments-marker'
        });

        await run(
            harness.repositories.users.setDeliveryAddress(
                owner.id,
                RAW_ADDRESS,
                new Date()
            )
        );
        await run(
            harness.repositories.users.setDisclosure(
                owner.id,
                disclosure,
                new Date()
            )
        );

        return reload(owner);
    };

    const createRequest = (
        user: UserRecord,
        options: { session?: SessionState; isAdmin?: boolean } = {}
    ) => {
        const events: SentEvent[] = [];
        const telemetry: Array<Record<string, unknown>> = [];
        const request = {
            ctx: { update: { update_id: 0 } } as unknown as Context,
            env: { WISHLIST_TG_URL: 'https://t.me/wishlist_ua_bot' },
            locale: 'uk',
            rates: FALLBACK_RATES,
            displayCurrency: 'UAH',
            LL,
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
                wish: async (item: { html: string }) => {
                    events.push({ kind: 'wish', html: item.html });
                },
                toast: async (text: string) => {
                    events.push({ kind: 'toast', text });
                },
                removeKeyboard: async () => {},
                replaceKeyboard: async () => {},
                deleteIncoming: async () => {}
            },
            defer: () => {},
            setSession: (next: SessionState) => {
                request.session = next;
            }
        } as unknown as BotRequest;

        return { request, events, telemetry };
    };

    const searchedSession = (ownerId: number): SessionState => {
        return {
            v: 1,
            pendingInput: null,
            find: { targetUserId: ownerId, query: 'owner', filter: null }
        };
    };

    const allCallbacks: CallbackTable[] = [
        disclosureCallbacks,
        deliveryCallbacks,
        wishlistCallbacks
    ];

    const press = async (
        request: BotRequest,
        action: EncodableCallbackAction
    ) => {
        const handler = allCallbacks
            .map(table => {
                return table[action.type];
            })
            .find(Boolean) as
            | ((req: BotRequest, action: CallbackAction) => Promise<void>)
            | undefined;

        assert.ok(handler, `no handler for ${action.type}`);
        await handler(request, action as CallbackAction);
    };

    const textsOf = (events: SentEvent[]) => {
        return events.flatMap(event => {
            return event.kind === 'text' ? [event.html] : [];
        });
    };

    const lastKeyboardData = (events: SentEvent[]) => {
        const texts = events.filter(event => {
            return event.kind === 'text';
        });
        const last = texts[texts.length - 1] as
            | Extract<SentEvent, { kind: 'text' }>
            | undefined;
        const buttons: InlineKeyboardButton[] = (
            (last?.keyboard as InlineKeyboardMarkup | undefined)
                ?.inline_keyboard ?? []
        ).flat();

        return buttons.flatMap(button => {
            return 'callback_data' in button ? [button.callback_data] : [];
        });
    };

    const textMessage = (text: string) => {
        return {
            message_id: 1,
            date: 0,
            chat: { id: 1, type: 'private' },
            text
        } as unknown as Message;
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

    describe('search view', () => {
        it('shows the escaped contact block on the first page only', async () => {
            const owner = await createOwner({
                showPhone: true,
                showAddress: true
            });

            await seedGeneratedWishes(harness, owner.id, WISHES_PAGE_SIZE + 2);

            const viewer = await createUser();
            const first = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await thirdWishlistScreen.render(first.request, {
                ownerId: owner.id
            });

            const contactText = textsOf(first.events).find(html => {
                return html.startsWith(LL.findList.filled.contact.title());
            });

            assert.ok(contactText);
            assert.ok(contactText.includes(PHONE_FORMATTED));
            assert.ok(contactText.includes(ESCAPED_ADDRESS));
            assert.ok(!contactText.includes(RAW_ADDRESS));

            const second = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await thirdWishlistScreen.render(second.request, {
                ownerId: owner.id,
                offset: WISHES_PAGE_SIZE
            });

            assert.ok(
                textsOf(second.events).every(html => {
                    return !html.includes(PHONE_FORMATTED);
                })
            );
        });

        it('respects hidden payments, a hidden phone and an address without a phone', async () => {
            const owner = await createOwner({
                showPayments: false,
                showPhone: false,
                showAddress: true
            });

            await seedGeneratedWishes(harness, owner.id, 1);

            const viewer = await createUser();
            const { request, events } = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await thirdWishlistScreen.render(request, { ownerId: owner.id });

            const all = JSON.stringify(events);

            assert.ok(!all.includes('payments-marker'));
            assert.ok(!all.includes(PHONE_FORMATTED));
            assert.ok(!all.includes('Locker'));
            assert.ok(!all.includes(PHONE.slice(1)));
        });

        it('shows payments when they are on', async () => {
            const owner = await createOwner({});

            await seedGeneratedWishes(harness, owner.id, 1);

            const viewer = await createUser();
            const { request, events } = createRequest(viewer, {
                session: searchedSession(owner.id)
            });

            await thirdWishlistScreen.render(request, { ownerId: owner.id });

            assert.ok(JSON.stringify(events).includes('payments-marker'));
        });

        it('never shows an admin their own contact', async () => {
            const owner = await createOwner({
                showPhone: true,
                showAddress: true
            });

            await seedGeneratedWishes(harness, owner.id, 1);

            const { request, events } = createRequest(owner, {
                session: searchedSession(owner.id),
                isAdmin: true
            });

            await thirdWishlistScreen.render(request, { ownerId: owner.id });

            assert.ok(events.some(event => event.kind === 'wish'));
            assert.ok(!JSON.stringify(events).includes(PHONE_FORMATTED));
        });
    });

    describe('what others see', () => {
        it('asks for confirmation before showing the phone', async () => {
            const owner = await createOwner({});
            const toggle = createRequest(owner);

            await press(toggle.request, {
                type: 'disclosureToggle',
                field: 'phone'
            });

            assert.equal((await reload(owner)).showPhone, false);
            assert.deepEqual(textsOf(toggle.events), [
                LL.disclosure.confirm.phone()
            ]);
            assert.ok(
                lastKeyboardData(toggle.events).includes(
                    encodeCallbackData({
                        type: 'disclosureConfirm',
                        field: 'phone'
                    })
                )
            );

            const confirm = createRequest(owner);

            await press(confirm.request, {
                type: 'disclosureConfirm',
                field: 'phone'
            });

            assert.equal((await reload(owner)).showPhone, true);
            assert.deepEqual(confirm.telemetry, [
                {
                    action: 'contact_disclosure_changed',
                    field: 'phone',
                    result: 'on'
                }
            ]);
        });

        it('explains what is missing before the address can be shown', async () => {
            const owner = await createOwner({});
            const withoutPhone = createRequest(owner);

            await press(withoutPhone.request, {
                type: 'disclosureToggle',
                field: 'address'
            });

            assert.equal(
                textsOf(withoutPhone.events)[0],
                LL.disclosure.needsPhone()
            );

            const noNumber = await createUser();
            const missing = createRequest(noNumber);

            await press(missing.request, {
                type: 'disclosureToggle',
                field: 'phone'
            });

            assert.equal(
                textsOf(missing.events)[0],
                LL.disclosure.phoneMissing()
            );

            const noAddress = await createUser({
                phone: '+48123456789',
                phoneDigits: '48123456789'
            });
            const addressless = createRequest(noAddress);

            await press(addressless.request, {
                type: 'disclosureToggle',
                field: 'address'
            });

            assert.equal(
                textsOf(addressless.events)[0],
                LL.disclosure.needsAddress()
            );
        });

        it('turns the address off with the phone and payments off directly', async () => {
            const owner = await createOwner({
                showPhone: true,
                showAddress: true
            });

            await press(createRequest(owner).request, {
                type: 'disclosureToggle',
                field: 'phone'
            });

            const afterPhone = await reload(owner);

            assert.equal(afterPhone.showPhone, false);
            assert.equal(afterPhone.showAddress, false);

            await press(createRequest(afterPhone).request, {
                type: 'disclosureToggle',
                field: 'payments'
            });

            assert.equal((await reload(owner)).showPayments, false);
        });

        it('offers the indexing toggle only while sharing and flips it', async () => {
            const owner = await createOwner({});
            const indexingData = encodeCallbackData({
                type: 'wishlistShareIndexing'
            });
            const unshared = createRequest(owner);

            await disclosureScreen.render(unshared.request, undefined);

            assert.ok(
                !lastKeyboardData(unshared.events).includes(indexingData)
            );

            await seedGeneratedWishes(harness, owner.id, 1);
            await run(
                harness.repositories.shares.publish(owner.id, 'O', new Date())
            );

            const shared = createRequest(owner);

            await disclosureScreen.render(shared.request, undefined);

            assert.ok(lastKeyboardData(shared.events).includes(indexingData));
            assert.ok(
                textsOf(shared.events)[0]?.includes(
                    LL.disclosure.indexing.hint()
                )
            );

            const toggle = createRequest(owner);

            await press(toggle.request, { type: 'wishlistShareIndexing' });

            const share = await run(
                harness.repositories.shares.findActiveByUserId(owner.id)
            );

            assert.equal(share?.allowIndexing, false);
            assert.deepEqual(toggle.telemetry, [
                { action: 'wishlist_share_indexing_toggled', result: 'off' }
            ]);
        });

        it('links the share screen to what others see', async () => {
            const owner = await createUser();

            await seedGeneratedWishes(harness, owner.id, 1);
            await run(
                harness.repositories.shares.publish(owner.id, 'O', new Date())
            );

            const { request, events } = createRequest(owner);

            await press(request, { type: 'wishlistShare' });

            assert.ok(
                lastKeyboardData(events).includes(
                    encodeCallbackData({
                        type: 'navigate',
                        screen: 'disclosure'
                    })
                )
            );
        });
    });

    describe('delivery address', () => {
        it('warns about the phone and saves a valid address', async () => {
            const owner = await createUser();
            const prompt = createRequest(owner);

            await deliveryScreen.render(prompt.request, undefined);

            assert.ok(
                textsOf(prompt.events)[0]?.includes(LL.delivery.phoneWarning())
            );
            assert.deepEqual(prompt.request.session.pendingInput, {
                kind: 'deliveryAddress'
            });

            const input = createRequest(owner, {
                session: prompt.request.session
            });

            assert.ok(deliveryScreen.onInput);
            await deliveryScreen.onInput(
                input.request,
                { kind: 'deliveryAddress' },
                textMessage('  Nova Poshta 5\n\nKyiv ')
            );

            assert.equal(
                (await reload(owner)).deliveryAddress,
                'Nova Poshta 5\nKyiv'
            );
            assert.equal(input.request.session.pendingInput, null);
        });

        it('rejects links and keeps the old address', async () => {
            const owner = await createUser();
            const { request, events } = createRequest(owner);

            assert.ok(deliveryScreen.onInput);
            await deliveryScreen.onInput(
                request,
                { kind: 'deliveryAddress' },
                textMessage('Locker http://x.test')
            );

            assert.equal(textsOf(events)[0], LL.delivery.errors.containsLink());
            assert.equal((await reload(owner)).deliveryAddress, null);
        });

        it('removes the address and stops showing it', async () => {
            const owner = await createOwner({
                showPhone: true,
                showAddress: true
            });

            await press(createRequest(owner).request, {
                type: 'deliveryRemove'
            });

            const cleared = await reload(owner);

            assert.equal(cleared.deliveryAddress, null);
            assert.equal(cleared.showAddress, false);
            assert.equal(cleared.showPhone, true);
        });
    });
});
