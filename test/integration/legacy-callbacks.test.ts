import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getMessages } from '../../src/bot/content/messages';
import { createTestUser, type TestUser } from '../fixtures/telegram';
import {
    createWebhookHarness,
    type ApiCall,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');

const LEGACY_NAVIGATION: ReadonlyArray<readonly [string, string]> = [
    ['greeting', 'n:home'],
    ['privacy', 'n:priv'],
    ['auth', 'n:auth'],
    ['wishlist', 'n:wl'],
    ['wishlist_add', 'n:add'],
    ['find_list', 'n:find'],
    ['give_list', 'n:gl'],
    ['feedback', 'n:fb'],
    ['stats', 'n:stats'],
    ['donate', 'n:don'],
    ['payments', 'n:pay']
];

const REGISTERED_ONLY_LEGACY = [
    'wishlist',
    'wishlist_add',
    'find_list',
    'give_list',
    'payments'
] as const;

const DEAD_LEGACY_DATA = [
    'edit_64b7f0c2a1e4d3b2c1a09876',
    'remove_64b7f0c2a1e4d3b2c1a09876',
    'give_64b7f0c2a1e4d3b2c1a09876',
    'take_64b7f0c2a1e4d3b2c1a09876',
    'filter_3',
    'filter_reset',
    'username',
    'phone',
    'both',
    'yes',
    'no',
    'clean',
    'share',
    'title',
    'description',
    'images',
    'link',
    'price',
    'priority',
    'visibility',
    'back'
] as const;

const MALFORMED_DATA = [
    '',
    'bogus',
    'n:unknown',
    'w:e:abc',
    'w:e:0',
    'w:e:-3',
    'w:r:y:',
    'w:f:z:4',
    'wl:p:-1',
    'wl:f:9',
    't:f:1:9',
    'l:de',
    'a:z',
    `w:e:${'9'.repeat(40)}`
] as const;

describe('Legacy and malformed callbacks through the Worker on D1', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(301, {
        first_name: 'Alice',
        username: 'alice'
    });
    const bob = createTestUser(302, { first_name: 'Bob', username: 'bob' });

    const tap = (user: TestUser, data: string | undefined) => {
        return webhook.send(webhook.builders.callback(user, data));
    };
    const methodsOf = (calls: readonly ApiCall[]) => {
        return calls.map(call => {
            return call.method;
        });
    };
    const rendered = () => {
        return webhook.sentMessages().map(message => {
            return { text: message.text, markup: message.reply_markup };
        });
    };
    const outdatedShown = () => {
        return (
            webhook.messageTexts().includes(LL.errors.outdatedButton()) ||
            webhook.callsOf('answerCallbackQuery').some(call => {
                return call.payload.text === LL.errors.outdatedButton();
            })
        );
    };
    const rowCounts = async () => {
        const counts: Record<string, number> = {};

        for (const table of ['users', 'wishes', 'gives']) {
            const row = await webhook.queryOne<{ total: number }>(
                `SELECT count(*) AS total FROM ${table}`
            );

            counts[table] = row?.total ?? 0;
        }

        return counts;
    };
    const readWish = (wishId: number) => {
        return webhook.queryOne<Record<string, unknown>>(
            'SELECT * FROM wishes WHERE id = ?',
            wishId
        );
    };
    const pendingInputOf = async (telegramId: number) => {
        const row = await webhook.queryOne<{ state: string }>(
            'SELECT state FROM sessions WHERE telegram_user_id = ?',
            telegramId
        );

        return row
            ? (JSON.parse(row.state) as { pendingInput: unknown }).pendingInput
            : null;
    };

    before(async () => {
        webhook = await createWebhookHarness();
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();
    });

    describe('legacy navigation buttons from old chat history', () => {
        for (const [legacy, current] of LEGACY_NAVIGATION) {
            it(`renders the same screen for "${legacy}" as for "${current}"`, async () => {
                await webhook.registerUser(alice);
                await tap(alice, legacy);

                const fromLegacy = rendered();

                webhook.clearApiCalls();
                await tap(alice, current);

                assert.ok(fromLegacy.length > 0);
                assert.deepEqual(rendered(), fromLegacy);
            });
        }

        for (const legacy of REGISTERED_ONLY_LEGACY) {
            it(`sends a guest who taps "${legacy}" to the guest home menu`, async () => {
                await tap(bob, legacy);

                assert.equal(
                    webhook.lastMessage().text,
                    `${LL.greeting.general()}\n\n${LL.greeting.guest()}`
                );
                assert.equal(
                    await webhook.d1.env.DB.prepare(
                        'SELECT 1 FROM users'
                    ).first(),
                    null
                );
            });
        }
    });

    describe('dead and malformed callbacks', () => {
        for (const data of DEAD_LEGACY_DATA) {
            it(`answers "${data}" with the outdated toast and the home menu`, async () => {
                const owner = await webhook.registerUser(alice);

                await webhook.createWish(owner, 'Keep me');

                const before = await rowCounts();

                await tap(alice, data);

                assert.deepEqual(methodsOf(webhook.outboundCalls()), [
                    'editMessageReplyMarkup',
                    'answerCallbackQuery',
                    'sendMessage'
                ]);
                assert.equal(
                    webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                    LL.errors.outdatedButton()
                );
                assert.equal(webhook.lastMessage().text, LL.greeting.user());
                assert.equal(
                    webhook.messageTexts().includes(LL.errors.unknown()),
                    false
                );
                assert.deepEqual(await rowCounts(), before);
                assert.equal(await pendingInputOf(alice.id), null);
            });
        }

        it('treats the same dead buttons the same way for a guest', async () => {
            for (const data of DEAD_LEGACY_DATA) {
                webhook.clearApiCalls();
                await tap(bob, data);

                assert.equal(
                    webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                    LL.errors.outdatedButton()
                );
                assert.equal(
                    webhook.lastMessage().text,
                    `${LL.greeting.general()}\n\n${LL.greeting.guest()}`
                );
            }

            assert.deepEqual(await rowCounts(), {
                users: 0,
                wishes: 0,
                gives: 0
            });
        });

        for (const data of MALFORMED_DATA) {
            it(`never mutates anything for malformed data "${data.slice(0, 24)}"`, async () => {
                const owner = await webhook.registerUser(alice);

                await webhook.createWish(owner, 'Keep me');

                const before = await rowCounts();

                await tap(alice, data);

                assert.equal(
                    webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                    LL.errors.outdatedButton()
                );
                assert.equal(webhook.lastMessage().text, LL.greeting.user());
                assert.deepEqual(await rowCounts(), before);
            });
        }

        it('treats a callback without data as outdated', async () => {
            await webhook.registerUser(alice);
            await tap(alice, undefined);

            assert.equal(
                webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                LL.errors.outdatedButton()
            );
            assert.equal(webhook.lastMessage().text, LL.greeting.user());
        });

        it('keeps the noop button silent and leaves the keyboard alone', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'x');

            assert.deepEqual(methodsOf(webhook.outboundCalls()), [
                'answerCallbackQuery'
            ]);
        });

        it('clears a pending input when an old button is tapped', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:fb');

            assert.notEqual(await pendingInputOf(alice.id), null);

            await tap(alice, 'edit_64b7f0c2a1e4d3b2c1a09876');

            assert.equal(await pendingInputOf(alice.id), null);
        });
    });

    describe('authorization of entity callbacks', () => {
        const seedAliceWish = async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Private plan', {
                price: 1000
            });

            await webhook.registerUser(bob);

            return { owner, wish };
        };

        it('refuses every owner action on a wish of someone else', async () => {
            const { wish } = await seedAliceWish();
            const original = await readWish(wish.id);
            const attempts = [
                `w:e:${wish.id}`,
                `w:r:${wish.id}`,
                `w:r:y:${wish.id}`,
                `w:r:n:${wish.id}`,
                `w:t:${wish.id}`,
                `w:pm:${wish.id}`,
                `w:v:${wish.id}`,
                `w:f:t:${wish.id}`,
                `w:f:d:${wish.id}`,
                `w:f:i:${wish.id}`,
                `w:f:l:${wish.id}`,
                `w:f:p:${wish.id}`
            ];

            for (const data of attempts) {
                webhook.clearApiCalls();
                await tap(bob, data);

                assert.ok(
                    webhook.messageTexts().includes(LL.errors.outdatedButton()),
                    data
                );
                assert.equal(await pendingInputOf(bob.id), null, data);
            }

            assert.deepEqual(await readWish(wish.id), original);
        });

        it('refuses giving a hidden, removed, own or blocked-owner wish', async () => {
            const { owner, wish } = await seedAliceWish();
            const hidden = await webhook.createWish(owner, 'Hidden', {
                hidden: true
            });
            const removed = await webhook.createWish(owner, 'Removed');
            const carol = createTestUser(303, {
                first_name: 'Carol',
                username: 'carol'
            });
            const carolUser = await webhook.registerUser(carol);
            const blockedWish = await webhook.createWish(
                carolUser,
                'Blocked owner wish'
            );

            await webhook.run(
                webhook.d1.repositories.wishes.softRemove(
                    removed.id,
                    owner.id,
                    false,
                    new Date()
                )
            );
            await webhook.run(
                webhook.d1.repositories.users.markBlockedByTelegramId(
                    carol.id,
                    new Date()
                )
            );

            for (const target of [
                hidden.id,
                removed.id,
                blockedWish.id,
                987654
            ]) {
                webhook.clearApiCalls();
                await tap(bob, `t:g:${target}`);

                assert.equal(
                    webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                    LL.errors.outdatedButton()
                );
            }

            webhook.clearApiCalls();
            await tap(alice, `t:g:${wish.id}`);

            assert.equal(
                webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                LL.errors.outdatedButton()
            );
            assert.equal((await rowCounts()).gives, 0);
        });

        it('lets a user remove only their own give', async () => {
            const { owner, wish } = await seedAliceWish();
            const bobUser = await webhook.registerUser(
                createTestUser(304, { first_name: 'Dan', username: 'dan' })
            );

            await webhook.run(
                webhook.d1.repositories.gives.add(
                    bobUser.id,
                    wish.id,
                    new Date()
                )
            );
            await tap(bob, `g:r:${wish.id}`);

            assert.equal((await rowCounts()).gives, 1);
            assert.equal(
                webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                String(LL.findList.errors.take()).replace(/<[^>]*>/g, '')
            );
            assert.equal(owner.id > 0, true);
        });

        it('refuses entity callbacks from a guest', async () => {
            const { wish } = await seedAliceWish();
            const guest = createTestUser(305, { first_name: 'Guest' });

            for (const data of [
                `w:e:${wish.id}`,
                `t:g:${wish.id}`,
                `g:r:${wish.id}`,
                'wl:clean:y',
                'g:clean:y'
            ]) {
                webhook.clearApiCalls();
                await tap(guest, data);

                assert.ok(outdatedShown(), data);
            }

            assert.equal((await rowCounts()).users, 2);
        });
    });

    describe('stateless buttons', () => {
        it('works after the session row was pruned', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Old list item');

            await webhook.d1.env.DB.prepare('DELETE FROM sessions').run();
            await tap(alice, `w:r:y:${wish.id}`);

            const row = await readWish(wish.id);

            assert.equal(row?.removed, 1);
            assert.equal(row?.done, 1);
            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.remove.gifted())
            );
        });

        it('opens the edit menu for a wish without any session', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Old list item');

            await tap(alice, `w:e:${wish.id}`);

            assert.equal(
                webhook.lastMessage().text,
                LL.wishlist.edit.description()
            );
        });
    });
});
