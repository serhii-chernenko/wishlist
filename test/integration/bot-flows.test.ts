import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getFilterTitle } from '../../src/bot/content/filters';
import { formatCurrency, formatNumber } from '../../src/bot/content/intl';
import { getMessages } from '../../src/bot/content/messages';
import {
    getLatestReleaseVersion,
    renderReleaseNotes
} from '../../src/bot/content/releases';
import { createTestUser, type TestUser } from '../fixtures/telegram';
import { seedGeneratedWishes } from './d1-harness';
import {
    buttonTextsOf,
    callbackDataOf,
    createWebhookHarness,
    DEFAULT_ADMIN_ID,
    urlsOf,
    type SentMessage,
    type WebhookHarness
} from './webhook-harness';

interface UserRow {
    id: number;
    username: string | null;
    username_searchable: number;
    phone: string | null;
    phone_digits: string | null;
    language: string | null;
    telegram_language_code: string | null;
    release_version: string;
    wishlist_filter: number | null;
    telegraph_access_token: string | null;
    payments: string | null;
}

interface WishRow {
    id: number;
    user_id: number | null;
    title: string;
    description: string | null;
    link: string | null;
    images: string;
    priority: number;
    hidden: number;
    removed: number;
    done: number;
    price: number;
}

const LL = getMessages('uk');

describe('Bot flows through the Worker on D1', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(101, {
        first_name: 'Alice',
        username: 'alice'
    });
    const bob = createTestUser(102, { first_name: 'Bob', username: 'bob' });
    const carol = createTestUser(103, {
        first_name: 'Carol',
        username: 'carol'
    });
    const dana = createTestUser(104, { first_name: 'Dana' });
    const aliceWithoutLanguageCode = {
        id: alice.id,
        is_bot: false as const,
        first_name: 'Alice',
        username: 'alice'
    };

    const tap = (user: TestUser, data: string) => {
        return webhook.send(webhook.builders.callback(user, data));
    };
    const say = (user: TestUser, text: string) => {
        return webhook.send(webhook.builders.message(user, text));
    };
    const command = (user: TestUser, text: string) => {
        return webhook.send(webhook.builders.command(user, text));
    };
    const shareContact = (
        user: TestUser,
        phoneNumber: string,
        userId?: number
    ) => {
        return webhook.send(
            webhook.builders.contact(user, {
                phoneNumber,
                ...(userId === undefined ? {} : { userId })
            })
        );
    };
    const sendPhoto = (user: TestUser, fileId: string) => {
        return webhook.send(webhook.builders.photo(user, { fileId }));
    };
    const readUser = (telegramId: number) => {
        return webhook.queryOne<UserRow>(
            'SELECT * FROM users WHERE telegram_id = ?',
            telegramId
        );
    };
    const readWishes = (userId: number) => {
        return webhook.queryAll<WishRow>(
            'SELECT * FROM wishes WHERE user_id = ? ORDER BY id',
            userId
        );
    };
    const ownWishes = (user: TestUser) => {
        return webhook.queryAll<WishRow>(
            'SELECT wishes.* FROM wishes JOIN users ON users.id = wishes.user_id WHERE users.telegram_id = ? ORDER BY wishes.id',
            user.id
        );
    };
    const readSession = async (telegramId: number) => {
        const row = await webhook.queryOne<{
            state: string;
            language: string | null;
        }>(
            'SELECT state, language FROM sessions WHERE telegram_user_id = ?',
            telegramId
        );

        return row
            ? {
                  language: row.language,
                  state: JSON.parse(row.state) as {
                      pendingInput: { kind: string } | null;
                      find: object | null;
                  }
              }
            : null;
    };
    const countWhere = async (table: string, clause = '1 = 1') => {
        const row = await webhook.queryOne<{ total: number }>(
            `SELECT count(*) AS total FROM ${table} WHERE ${clause}`
        );

        return row?.total ?? 0;
    };
    const registerWithPhone = (
        user: TestUser,
        phone: string,
        overrides: Record<string, unknown> = {}
    ) => {
        return webhook.registerUser(user, {
            phone,
            phoneDigits: phone.replace(/\D/g, ''),
            ...overrides
        });
    };
    const lastSentTo = (chatId: number) => {
        return webhook.sentMessages().filter(message => {
            return message.chat_id === chatId;
        });
    };
    const lastInlineData = () => {
        return callbackDataOf(webhook.lastMessage());
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

    describe('registration and visibility', () => {
        it('shows the registration choices and strips the clicked keyboard', async () => {
            await tap(alice, 'n:auth');

            assert.deepEqual(lastInlineData(), ['a:u', 'a:p', 'a:b', 'n:home']);
            assert.equal(webhook.callsOf('answerCallbackQuery').length, 1);
            assert.equal(webhook.callsOf('editMessageReplyMarkup').length, 1);
        });

        it('refuses username registration without a Telegram username', async () => {
            await tap(dana, 'a:u');

            assert.equal(
                webhook.sentMessages()[0]?.text,
                LL.auth.errors.username()
            );
            assert.equal(
                webhook.lastMessage().text.includes(LL.greeting.guest()),
                true
            );
            assert.equal(await readUser(dana.id), null);
        });

        it('registers by username and lands on the registered menu', async () => {
            await tap(alice, 'a:u');

            const row = await readUser(alice.id);
            const texts = webhook.messageTexts();

            assert.ok(row);
            assert.equal(row.username, 'alice');
            assert.equal(row.username_searchable, 1);
            assert.equal(row.phone, null);
            assert.equal(row.language, null);
            assert.equal(row.telegram_language_code, 'uk');
            assert.equal(row.release_version, getLatestReleaseVersion());
            assert.equal(
                texts[0],
                LL.auth.success.guest() + LL.auth.success.username('alice')
            );
            assert.equal(texts.at(-1), LL.greeting.user());
            assert.deepEqual(lastInlineData().slice(0, 5), [
                'n:wl',
                'n:gl',
                'n:find',
                'n:auth',
                'n:pay'
            ]);
        });

        it('asks for a contact, rejects a foreign one and accepts the own one', async () => {
            await tap(alice, 'a:b');

            const prompt = webhook.lastMessage();

            assert.equal(prompt.text, LL.auth.sendNumber.description());
            assert.equal(
                prompt.reply_markup?.keyboard?.[0]?.[0]?.request_contact,
                true
            );
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput?.kind,
                'contact'
            );

            await shareContact(alice, '+380670000000', 555);

            assert.equal(
                webhook.lastMessage().text,
                LL.auth.sendNumber.description()
            );
            assert.ok(
                webhook.messageTexts().includes(LL.auth.errors.foreignContact())
            );
            assert.equal(await readUser(alice.id), null);
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput?.kind,
                'contact'
            );

            await shareContact(alice, '+380 50 111 22 33');

            const row = await readUser(alice.id);

            assert.ok(row);
            assert.equal(row.phone, '+380 50 111 22 33');
            assert.equal(row.phone_digits, '380501112233');
            assert.equal(row.username_searchable, 1);
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput,
                null
            );
            assert.equal(webhook.lastMessage().text, LL.greeting.user());
        });

        it('registers by phone only without a username', async () => {
            await tap(dana, 'a:p');
            await shareContact(dana, '+48123456789');

            const row = await readUser(dana.id);

            assert.ok(row);
            assert.equal(row.username, null);
            assert.equal(row.username_searchable, 0);
            assert.equal(row.phone_digits, '48123456789');
        });

        it('refuses both-registration for a nameless user after the contact', async () => {
            await tap(dana, 'a:b');
            await shareContact(dana, '+48123456789');

            assert.ok(
                webhook.messageTexts().includes(LL.auth.errors.username())
            );
            assert.equal(await readUser(dana.id), null);
        });

        it('narrows visibility from both to phone only and then username only', async () => {
            await tap(alice, 'a:b');
            await shareContact(alice, '+380501112233');

            await tap(alice, 'a:p');
            await shareContact(alice, '+380501112233');

            const phoneOnly = await readUser(alice.id);

            assert.equal(phoneOnly?.username_searchable, 0);
            assert.equal(phoneOnly?.phone, '+380501112233');
            assert.equal(
                webhook
                    .messageTexts()
                    .at(-2)
                    ?.startsWith(LL.auth.success.user()),
                true
            );

            await tap(alice, 'a:u');

            const usernameOnly = await readUser(alice.id);

            assert.equal(usernameOnly?.username_searchable, 1);
            assert.equal(usernameOnly?.phone, null);
            assert.equal(usernameOnly?.phone_digits, null);
        });

        it('shows the current visibility on the auth screen of a registered user', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:auth');

            assert.ok(
                webhook
                    .lastMessage()
                    .text.startsWith(
                        LL.auth.description.user(LL.auth.types.username())
                    )
            );
        });

        it('syncs a changed username and the Telegram language code on the next update', async () => {
            await webhook.registerUser(alice, { telegramLanguageCode: 'uk' });
            await command(
                { ...alice, username: 'alice_new', language_code: 'pl' },
                '/start'
            );

            const row = await readUser(alice.id);

            assert.equal(row?.username, 'alice_new');
            assert.equal(row?.telegram_language_code, 'pl');
        });

        it('sends any plain text without pending input to the home menu', async () => {
            await webhook.registerUser(alice);
            await say(alice, 'hello there');

            assert.equal(webhook.lastMessage().text, LL.greeting.user());
        });

        it('resets a pending input on /start', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:fb');

            assert.equal(
                (await readSession(alice.id))?.state.pendingInput?.kind,
                'feedback'
            );

            await command(alice, '/start');

            assert.equal(
                (await readSession(alice.id))?.state.pendingInput,
                null
            );
            assert.equal(webhook.lastMessage().text, LL.greeting.user());
            assert.equal(
                webhook.callsOf('sendMessage').at(-1)?.payload.chat_id,
                alice.id
            );
        });
    });

    describe('wish creation and editing', () => {
        const createWishViaChat = async (title: string) => {
            await tap(alice, 'n:add');
            await say(alice, title);

            const rows = await ownWishes(alice);

            return rows.at(-1) as WishRow;
        };

        it('adds a wish and shows the ten-action edit menu', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:add');

            assert.equal(
                webhook.lastMessage().text,
                LL.wishlist.add.description('200')
            );
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput?.kind,
                'wishTitleNew'
            );

            await say(alice, 'Bicycle');

            const [wish] = await ownWishes(alice);

            assert.ok(wish);
            assert.equal(wish.title, 'Bicycle');

            const texts = webhook.messageTexts();

            assert.ok(texts.includes(LL.wishlist.add.success()));
            assert.equal(texts.at(-1), LL.wishlist.edit.description());
            assert.deepEqual(lastInlineData(), [
                `w:f:t:${wish.id}`,
                `w:f:d:${wish.id}`,
                `w:f:i:${wish.id}`,
                `w:f:l:${wish.id}`,
                `w:t:${wish.id}`,
                `w:v:${wish.id}`,
                `w:f:p:${wish.id}`,
                'w:add',
                `w:back:${wish.id}`,
                'n:home'
            ]);
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput,
                null
            );
        });

        it('rejects a link as a title and keeps waiting', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:add');
            await say(alice, 'see https://example.com');

            assert.ok(webhook.messageTexts().includes(LL.wishlist.add.error()));
            assert.equal(await countWhere('wishes'), 0);
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput?.kind,
                'wishTitleNew'
            );
        });

        it('edits title, description, link and price through prompts', async () => {
            await webhook.registerUser(alice);

            const wish = await createWishViaChat('Bicycle');

            await tap(alice, `w:f:t:${wish.id}`);
            await say(alice, 'see http://example.com');

            assert.ok(
                webhook
                    .messageTexts()
                    .includes(LL.wishlist.edit.errors.title.link())
            );
            assert.equal((await ownWishes(alice))[0]?.title, 'Bicycle');

            await say(alice, 'Red bicycle');
            await tap(alice, `w:f:d:${wish.id}`);
            await say(alice, 'Size M, <fast>');
            await tap(alice, `w:f:l:${wish.id}`);
            await say(alice, 'buy at https://example.com/item?x=1 please');
            await tap(alice, `w:f:p:${wish.id}`);
            await say(alice, '1 500');

            const [row] = await ownWishes(alice);

            assert.equal(row?.title, 'Red bicycle');
            assert.equal(row?.description, 'Size M, <fast>');
            assert.equal(row?.link, 'https://example.com/item?x=1');
            assert.equal(row?.price, 1500);
            assert.ok(
                webhook
                    .messageTexts()
                    .includes(LL.wishlist.edit.success.updatePrice())
            );
            assert.ok(
                urlsOf(webhook.lastMessage()).length === 0 &&
                    webhook.sentMessages().some(message => {
                        return urlsOf(message).includes(
                            'https://example.com/item?x=1'
                        );
                    })
            );
        });

        it('clears description, link and price with the remove label and rejects bad price', async () => {
            await webhook.registerUser(alice);

            const wish = await webhook.createWish(
                (await readUser(alice.id)) as never,
                'Bicycle',
                {
                    description: 'text',
                    link: 'https://example.com/a',
                    price: 700
                }
            );

            await tap(alice, `w:f:p:${wish.id}`);
            await say(alice, 'abc');

            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.edit.errors.price())
            );
            assert.equal((await ownWishes(alice))[0]?.price, 700);

            await say(alice, LL.actions.remove());
            await tap(alice, `w:f:d:${wish.id}`);
            await say(alice, LL.actions.remove());
            await tap(alice, `w:f:l:${wish.id}`);
            await say(alice, LL.actions.remove());

            const [row] = await ownWishes(alice);

            assert.equal(row?.price, 0);
            assert.equal(row?.description, null);
            assert.equal(row?.link, null);
        });

        it('toggles priority and visibility back and forth', async () => {
            await webhook.registerUser(alice);

            const wish = await createWishViaChat('Bicycle');

            await tap(alice, `w:t:${wish.id}`);
            await tap(alice, `w:v:${wish.id}`);

            assert.equal((await ownWishes(alice))[0]?.priority, 1);
            assert.equal((await ownWishes(alice))[0]?.hidden, 1);

            await tap(alice, `w:t:${wish.id}`);
            await tap(alice, `w:v:${wish.id}`);

            assert.equal((await ownWishes(alice))[0]?.priority, 0);
            assert.equal((await ownWishes(alice))[0]?.hidden, 0);
        });

        it('attaches a single photo immediately and renders the wish with it', async () => {
            await webhook.registerUser(alice);

            const wish = await createWishViaChat('Bicycle');

            await tap(alice, `w:f:i:${wish.id}`);
            await sendPhoto(alice, 'photo-large-1');

            assert.equal(
                (await ownWishes(alice))[0]?.images,
                JSON.stringify(['photo-large-1'])
            );
            assert.equal(
                webhook.callsOf('sendPhoto').at(-1)?.payload.photo,
                'photo-large-1'
            );
            assert.ok(
                webhook
                    .messageTexts()
                    .includes(LL.wishlist.edit.success.updateImages())
            );
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput,
                null
            );
        });

        it('opens the edit menu of the clicked wish and goes back to the list', async () => {
            await webhook.registerUser(alice);

            const wish = await createWishViaChat('Bicycle');

            await tap(alice, `w:e:${wish.id}`);

            assert.equal(
                webhook.lastMessage().text,
                LL.wishlist.edit.description()
            );

            await tap(alice, `w:back:${wish.id}`);

            assert.equal(
                webhook
                    .messageTexts()
                    .at(-1)
                    ?.startsWith(LL.wishlist.filled.after()),
                true
            );
        });
    });

    describe('wishlist actions', () => {
        it('removes a wish as done or dropped after a yes/no confirmation', async () => {
            const owner = await webhook.registerUser(alice);
            const done = await webhook.createWish(owner, 'Done');
            const dropped = await webhook.createWish(owner, 'Dropped');

            await tap(alice, `w:r:${done.id}`);

            assert.equal(
                webhook.lastMessage().text,
                LL.wishlist.remove.confirm()
            );
            assert.deepEqual(lastInlineData(), [
                `w:r:y:${done.id}`,
                `w:r:n:${done.id}`
            ]);
            assert.equal((await readWishes(owner.id))[0]?.removed, 0);

            await tap(alice, `w:r:y:${done.id}`);
            await tap(alice, `w:r:n:${dropped.id}`);

            const rows = await readWishes(owner.id);

            assert.deepEqual(
                rows.map(row => {
                    return [row.removed, row.done];
                }),
                [
                    [1, 1],
                    [1, 0]
                ]
            );
            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.remove.success())
            );
        });

        it('asks before cleaning and cleans only after the confirmation', async () => {
            const owner = await webhook.registerUser(alice);
            const taker = await webhook.registerUser(bob);
            const wish = await webhook.createWish(owner, 'One');

            await webhook.createWish(owner, 'Two');
            await webhook.run(
                webhook.d1.repositories.gives.add(taker.id, wish.id, new Date())
            );
            await tap(alice, 'wl:clean');

            assert.equal(
                webhook.lastMessage().text,
                LL.wishlist.clean.confirm()
            );
            assert.equal(await countWhere('wishes', 'removed = 1'), 0);

            await tap(alice, 'wl:clean:y');

            assert.equal(await countWhere('wishes', 'removed = 1'), 2);
            assert.equal(await countWhere('gives'), 0);
            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.clean.success())
            );
            assert.equal(webhook.lastMessage().text, LL.wishlist.empty());
        });

        it('persists the price filter on the user and applies it on the next open', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Cheap', { price: 500 });
            await webhook.createWish(owner, 'Middle', { price: 2500 });
            await tap(alice, 'wl:f:2');

            assert.equal((await readUser(alice.id))?.wishlist_filter, 2);

            webhook.clearApiCalls();
            await tap(alice, 'n:wl');

            const listed = webhook.messageTexts();

            assert.ok(listed.some(text => text.includes('Middle')));
            assert.equal(
                listed.some(text => text.includes('Cheap')),
                false
            );
            assert.ok(
                listed.includes(
                    LL.wishlist.filled.before() +
                        LL.filters.applied(
                            getFilterTitle(LL, 2, value => {
                                return formatCurrency(value, 'uk');
                            })
                        )
                )
            );

            await tap(alice, 'wl:f:x');

            assert.equal((await readUser(alice.id))?.wishlist_filter, null);
        });

        it('applies a newly chosen price filter to the list rendered right after the choice', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Cheap', { price: 500 });
            await webhook.createWish(owner, 'Middle', { price: 2500 });
            await tap(alice, 'wl:f:2');

            const listed = webhook.messageTexts();

            assert.ok(listed.some(text => text.includes('Middle')));
            assert.equal(
                listed.some(text => text.includes('Cheap')),
                false
            );
        });

        it('pages the list ten wishes at a time', async () => {
            const owner = await webhook.registerUser(alice);

            await seedGeneratedWishes(webhook.d1, owner.id, 12);
            await tap(alice, 'n:wl');

            assert.ok(lastInlineData().includes('wl:p:10'));

            webhook.clearApiCalls();
            await tap(alice, 'wl:p:10');

            const withPage = webhook.sentMessages();

            assert.equal(withPage.length, 3);
            assert.equal(lastInlineData().includes('wl:p:10'), false);
        });

        it('shares through telegra.ph, stores the token and reuses it', async () => {
            const owner = await webhook.registerUser(alice, {
                payments: 'Card 1234 5678'
            });

            await webhook.createWish(owner, 'Bicycle', { price: 1000 });
            await webhook.createWish(owner, 'Secret', { hidden: true });
            await tap(alice, 'wl:share');

            assert.deepEqual(
                webhook.telegraphCalls.map(call => {
                    return call.method;
                }),
                ['createAccount', 'createPage']
            );

            const [account, page] = webhook.telegraphCalls;

            assert.equal(account?.body.short_name, 'alice');
            assert.equal(account?.body.author_url, 'https://t.me/alice');
            assert.equal(typeof page?.body.content, 'string');
            assert.ok(String(page?.body.content).includes('Bicycle'));
            assert.equal(String(page?.body.content).includes('Secret'), false);
            assert.ok(String(page?.body.content).includes('Card 1234 5678'));
            assert.equal(page?.body.title, LL.share.title({ name: 'Alice' }));
            assert.ok(
                webhook.messageTexts().includes(
                    LL.wishlist.share.success({
                        url: 'https://telegra.ph/wishlist-3'
                    })
                )
            );
            assert.equal(
                (await readUser(alice.id))?.telegraph_access_token,
                'token-2'
            );

            webhook.telegraphCalls.length = 0;
            await tap(alice, 'wl:share');

            assert.deepEqual(
                webhook.telegraphCalls.map(call => {
                    return call.method;
                }),
                ['createPage']
            );
        });

        it('recreates the telegra.ph account once when the token is invalid', async () => {
            const owner = await webhook.registerUser(alice, {
                telegraphAccessToken: 'stale-token'
            });
            let rejected = false;

            await webhook.createWish(owner, 'Bicycle');
            webhook.respondToTelegraph(call => {
                if (call.method === 'createPage' && !rejected) {
                    rejected = true;

                    return {
                        body: { ok: false, error: 'ACCESS_TOKEN_INVALID' }
                    };
                }

                return null;
            });
            await tap(alice, 'wl:share');

            assert.deepEqual(
                webhook.telegraphCalls.map(call => {
                    return call.method;
                }),
                ['createPage', 'createAccount', 'createPage']
            );
            assert.notEqual(
                (await readUser(alice.id))?.telegraph_access_token,
                'stale-token'
            );
        });

        it('reports an empty wishlist on share without calling telegra.ph', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'wl:share');

            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.share.empty())
            );
            assert.equal(webhook.telegraphCalls.length, 0);
        });

        it('tells the user when telegra.ph fails and keeps the bot alive', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Bicycle');
            webhook.respondToTelegraph(() => {
                return { status: 500, body: { ok: false, error: 'BOOM' } };
            });
            await tap(alice, 'wl:share');

            assert.ok(webhook.messageTexts().includes(LL.errors.unknown()));
        });
    });

    describe('find, give and give list', () => {
        const seedOwner = async () => {
            const owner = await registerWithPhone(alice, '+380501112233', {
                payments: 'Mono jar <1>'
            });
            const wish = await webhook.createWish(owner, 'Bicycle', {
                price: 1000
            });

            await webhook.createWish(owner, 'Hidden one', { hidden: true });

            return { owner, wish };
        };

        it('finds a user by a case-insensitive @username and lists visible wishes', async () => {
            const { wish } = await seedOwner();

            await webhook.registerUser(bob);
            await tap(bob, 'n:find');

            assert.equal(webhook.lastMessage().text, LL.findList.description());
            assert.equal(
                (await readSession(bob.id))?.state.pendingInput?.kind,
                'findQuery'
            );

            await say(bob, '@ALiCe');

            const texts = webhook.messageTexts();

            assert.ok(texts.some(text => text.includes('<b>@ALiCe</b>')));
            assert.ok(texts.some(text => text.includes('Bicycle')));
            assert.equal(
                texts.some(text => text.includes('Hidden one')),
                false
            );
            assert.ok(
                texts.includes(
                    LL.findList.filled.payments('Mono jar &lt;1&gt;')
                )
            );
            assert.ok(
                webhook.sentMessages().some(message => {
                    return callbackDataOf(message).includes(`t:g:${wish.id}`);
                })
            );
            assert.equal(
                (await readSession(bob.id))?.state.find !== null,
                true
            );
        });

        it('finds by a phone substring of ten digits or more only', async () => {
            await seedOwner();
            await webhook.registerUser(bob);
            await tap(bob, 'n:find');
            await say(bob, '05011');

            assert.ok(
                webhook.messageTexts().includes(LL.findList.errors.notFound())
            );

            await say(bob, '0501112233');

            assert.ok(
                webhook.messageTexts().some(text => text.includes('Bicycle'))
            );
        });

        it('keeps asking after a miss and does not find phone-only users by username', async () => {
            await webhook.registerUser(carol, {
                usernameSearchable: false,
                phone: '+380990000000',
                phoneDigits: '380990000000'
            });
            await webhook.registerUser(bob);
            await tap(bob, 'n:find');
            await say(bob, '@carol');

            assert.equal(webhook.lastMessage().text, LL.findList.description());
            assert.ok(
                webhook.messageTexts().includes(LL.findList.errors.notFound())
            );
            assert.equal(
                (await readSession(bob.id))?.state.pendingInput?.kind,
                'findQuery'
            );
        });

        it('blocks searching yourself unless you are the admin', async () => {
            const { owner } = await seedOwner();

            await tap(alice, 'n:find');
            await say(alice, '@alice');

            assert.ok(
                webhook
                    .messageTexts()
                    .includes(LL.findList.errors.foundYourself())
            );

            webhook.setAdminId(String(owner.telegramId));
            webhook.clearApiCalls();
            await say(alice, '@alice');

            assert.ok(
                webhook.messageTexts().some(text => text.includes('Bicycle'))
            );
        });

        it('gives and takes with a toast and an in-place keyboard swap', async () => {
            const { wish } = await seedOwner();
            const giver = await webhook.registerUser(bob);

            await tap(bob, 'n:find');
            await say(bob, '@alice');
            webhook.clearApiCalls();
            await tap(bob, `t:g:${wish.id}`);

            assert.equal(await countWhere('gives', `user_id = ${giver.id}`), 1);
            assert.equal(webhook.callsOf('answerCallbackQuery').length, 1);
            assert.ok(
                String(
                    webhook.callsOf('answerCallbackQuery')[0]?.payload.text
                ).includes('успішно додано')
            );
            assert.deepEqual(webhook.callsOf('sendMessage'), []);
            assert.ok(
                JSON.stringify(
                    webhook.callsOf('editMessageReplyMarkup')[0]?.payload
                ).includes(`t:t:${wish.id}`)
            );

            webhook.clearApiCalls();
            await tap(bob, `t:g:${wish.id}`);

            assert.equal(await countWhere('gives'), 1);
            assert.ok(
                String(
                    webhook.callsOf('answerCallbackQuery')[0]?.payload.text
                ).includes('вже додано')
            );

            webhook.clearApiCalls();
            await tap(bob, `t:t:${wish.id}`);

            assert.equal(await countWhere('gives'), 0);
            assert.ok(
                JSON.stringify(
                    webhook.callsOf('editMessageReplyMarkup')[0]?.payload
                ).includes(`t:g:${wish.id}`)
            );
        });

        it('shows other watchers a givers line and the giver their own', async () => {
            const { wish } = await seedOwner();

            await webhook.registerUser(bob);
            await webhook.registerUser(carol);
            await tap(bob, 'n:find');
            await say(bob, '@alice');
            await tap(bob, `t:g:${wish.id}`);
            await tap(carol, 'n:find');
            await say(carol, '@alice');

            assert.ok(
                webhook.messageTexts().some(text => {
                    return text.endsWith(LL.findList.givers.somebody('1'));
                })
            );

            webhook.clearApiCalls();
            await tap(bob, 'n:find');
            await say(bob, '@alice');

            assert.ok(
                webhook
                    .messageTexts()
                    .some(text => text.endsWith(LL.findList.givers.you()))
            );
        });

        it('lists gives with owner and removes only the caller give', async () => {
            const { wish } = await seedOwner();
            const bobUser = await webhook.registerUser(bob);
            const carolUser = await webhook.registerUser(carol);

            await webhook.run(
                webhook.d1.repositories.gives.add(
                    bobUser.id,
                    wish.id,
                    new Date()
                )
            );
            await webhook.run(
                webhook.d1.repositories.gives.add(
                    carolUser.id,
                    wish.id,
                    new Date()
                )
            );
            await tap(bob, 'n:gl');

            const entry = webhook.sentMessages().find(message => {
                return callbackDataOf(message).includes(`g:r:${wish.id}`);
            });

            assert.ok(entry);
            assert.ok(entry.text.includes(LL.giveList.owner('@alice')));
            assert.ok(entry.text.includes(LL.giveList.givers('1')));

            webhook.clearApiCalls();
            await tap(bob, `g:r:${wish.id}`);

            assert.equal(await countWhere('gives'), 1);
            assert.equal(
                await countWhere('gives', `user_id = ${carolUser.id}`),
                1
            );
            assert.deepEqual(webhook.callsOf('sendMessage'), []);
            assert.ok(
                JSON.stringify(
                    webhook.callsOf('editMessageReplyMarkup')[0]?.payload
                ).includes('"inline_keyboard":[]')
            );
        });

        it('asks before cleaning the give list and renders the empty state', async () => {
            const { wish } = await seedOwner();
            const bobUser = await webhook.registerUser(bob);

            await webhook.run(
                webhook.d1.repositories.gives.add(
                    bobUser.id,
                    wish.id,
                    new Date()
                )
            );
            await tap(bob, 'g:clean');

            assert.equal(
                webhook.lastMessage().text,
                LL.giveList.clean.confirm()
            );
            assert.equal(await countWhere('gives'), 1);

            await tap(bob, 'g:clean:y');

            assert.equal(await countWhere('gives'), 0);
            assert.ok(
                webhook.messageTexts().includes(LL.giveList.success.clean())
            );
            assert.equal(webhook.lastMessage().text, LL.giveList.empty());
        });
    });

    describe('payments, feedback, stats and info screens', () => {
        it('validates, saves, shows and removes payment requisites', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:pay');

            assert.equal(
                callbackDataOf(webhook.lastMessage()).includes('p:rm'),
                false
            );

            await say(alice, 'abc');

            assert.ok(
                webhook.messageTexts().includes(LL.payments.edit.error())
            );
            assert.equal((await readUser(alice.id))?.payments, null);

            await say(alice, 'IBAN UA00 1234 5678');

            assert.equal(
                (await readUser(alice.id))?.payments,
                'IBAN UA00 1234 5678'
            );
            assert.ok(
                webhook.messageTexts().includes(LL.payments.edit.success())
            );
            assert.ok(
                buttonTextsOf(webhook.lastMessage()).includes(
                    LL.payments.title.update()
                )
            );

            await tap(alice, 'n:pay');

            assert.ok(callbackDataOf(webhook.lastMessage()).includes('p:rm'));
            assert.ok(
                webhook.lastMessage().text.includes('IBAN UA00 1234 5678')
            );

            await tap(alice, 'p:rm');

            assert.equal((await readUser(alice.id))?.payments, null);
            assert.ok(
                webhook.messageTexts().includes(LL.payments.remove.success())
            );
        });

        it('forwards escaped feedback to the admin and thanks the user', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:fb');
            await say(alice, 'Love <it> & more');

            const toAdmin = webhook.sentMessages().filter(message => {
                return String(message.chat_id) === DEFAULT_ADMIN_ID;
            });

            assert.equal(toAdmin.length, 1);
            assert.equal(toAdmin[0]?.parse_mode, 'HTML');
            assert.ok(toAdmin[0]?.text.startsWith('#відгук від Alice @alice'));
            assert.ok(toAdmin[0]?.text.endsWith('Love &lt;it&gt; &amp; more'));
            assert.ok(
                lastSentTo(alice.id).some(
                    message => message.text === LL.feedback.success()
                )
            );
            assert.equal(
                (await readSession(alice.id))?.state.pendingInput,
                null
            );
        });

        it('lets a guest send feedback and survives a missing admin id', async () => {
            webhook.setAdminId(null);
            await tap(bob, 'n:fb');
            await say(bob, 'No admin configured');

            assert.deepEqual(
                webhook.sentMessages().filter(message => {
                    return String(message.chat_id) === DEFAULT_ADMIN_ID;
                }),
                []
            );
            assert.ok(webhook.messageTexts().includes(LL.feedback.success()));
        });

        it('counts non-blocked users, all wishes and done wishes in the stats', async () => {
            const first = await webhook.registerUser(alice);
            const second = await webhook.registerUser(bob);

            await webhook.registerUser(carol, { blockedAt: new Date() });

            const wish = await webhook.createWish(first, 'One');

            await webhook.createWish(second, 'Two');
            await webhook.createWish(second, 'Three');
            await webhook.run(
                webhook.d1.repositories.wishes.softRemove(
                    wish.id,
                    first.id,
                    true,
                    new Date()
                )
            );
            await tap(dana, 'n:stats');

            assert.equal(
                webhook.lastMessage().text,
                [
                    `${LL.stats.title()}\n`,
                    LL.stats.users(formatNumber(2, 'uk')),
                    LL.stats.wishes(formatNumber(3, 'uk')),
                    LL.stats.done(formatNumber(1, 'uk'))
                ].join('\n')
            );
        });

        it('offers the donate links and the PayPal address', async () => {
            await tap(alice, 'n:don');

            const message = webhook.lastMessage();

            assert.ok(message.text.includes('contact@chernenko.digital'));
            assert.deepEqual(urlsOf(message), [
                'https://www.buymeacoffee.com/serhiichernenko',
                'https://send.monobank.ua/jar/4ZGhPQqyMh',
                'https://t.me/serhii_chernenko'
            ]);
        });

        it('lists the project links on the privacy screen including X', async () => {
            await tap(alice, 'n:priv');

            const message = webhook.lastMessage();

            assert.deepEqual(urlsOf(message), [
                'https://github.com/serhii-chernenko/wishlist',
                'https://t.me/ixPrincessBot',
                'https://youtube.com/@serhii.chernenko',
                'https://t.me/serhii_chernenko',
                'https://x.com/serhiichernenko'
            ]);
            assert.deepEqual(callbackDataOf(message), ['n:fb', 'n:home']);
            assert.ok(
                message.text.includes(LL.privacy.description.languages())
            );
        });

        it('renders the release notes for /releases', async () => {
            await command(alice, '/releases');

            const message: SentMessage = webhook.lastMessage();

            assert.equal(message.text, renderReleaseNotes(3, 'uk'));
            assert.deepEqual(callbackDataOf(message), ['n:home']);
        });
    });

    describe('language', () => {
        it('offers the four choices on /lang and on the home button', async () => {
            await command(alice, '/lang');

            assert.deepEqual(lastInlineData(), [
                'l:uk',
                'l:en',
                'l:pl',
                'l:auto',
                'n:home'
            ]);
            assert.ok(webhook.lastMessage().text.includes(LL.language.title()));
        });

        it('stores a guest choice on the session and carries it over on registration', async () => {
            await command(alice, '/lang en');

            const en = getMessages('en');

            assert.equal((await readSession(alice.id))?.language, 'en');
            assert.ok(
                webhook
                    .messageTexts()
                    .includes(en.language.success(en.language.names.en()))
            );
            assert.equal(
                webhook.lastMessage().text,
                `${en.greeting.general()}\n\n${en.greeting.guest()}`
            );

            await tap(alice, 'a:u');

            assert.equal((await readUser(alice.id))?.language, 'en');
            assert.equal(
                webhook.messageTexts().at(-2),
                en.auth.success.guest() + en.auth.success.username('alice')
            );
        });

        it('sets and clears the language of a registered user', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'l:pl');

            const pl = getMessages('pl');

            assert.equal((await readUser(alice.id))?.language, 'pl');
            assert.equal(webhook.lastMessage().text, pl.greeting.user());

            await command({ ...alice, language_code: 'pl' }, '/lang auto');

            assert.equal((await readUser(alice.id))?.language, null);
            assert.equal(webhook.lastMessage().text, pl.greeting.user());

            await command(alice, '/lang uk');

            assert.equal((await readUser(alice.id))?.language, 'uk');
        });

        it('resolves Auto from the Telegram language code', async () => {
            await webhook.registerUser(alice);
            await command({ ...alice, language_code: 'de' }, '/start');

            assert.equal(
                webhook.lastMessage().text,
                getMessages('en').greeting.user()
            );

            await command({ ...alice, language_code: 'pl' }, '/start');

            assert.equal(
                webhook.lastMessage().text,
                getMessages('pl').greeting.user()
            );

            await command(aliceWithoutLanguageCode, '/start');

            assert.equal(
                webhook.lastMessage().text,
                getMessages('pl').greeting.user()
            );
        });

        it('keeps the stored Telegram language code for Auto when a callback has no language code', async () => {
            await webhook.registerUser(alice, { telegramLanguageCode: 'pl' });
            await tap(aliceWithoutLanguageCode, 'n:home');

            assert.equal(
                webhook.lastMessage().text,
                getMessages('pl').greeting.user()
            );
            assert.equal(
                (await readUser(alice.id))?.telegram_language_code,
                'pl'
            );

            await tap({ ...alice, language_code: 'en' }, 'n:home');

            assert.equal(
                webhook.lastMessage().text,
                getMessages('en').greeting.user()
            );

            await tap(aliceWithoutLanguageCode, 'n:home');

            assert.equal(
                webhook.lastMessage().text,
                getMessages('en').greeting.user()
            );
            assert.equal(
                (await readUser(alice.id))?.telegram_language_code,
                'en'
            );
        });

        it('applies the stored Telegram language code when switching back to Auto without a language code', async () => {
            await webhook.registerUser(alice, {
                language: 'uk',
                telegramLanguageCode: 'pl'
            });
            await command(aliceWithoutLanguageCode, '/lang auto');

            assert.equal(
                webhook.lastMessage().text,
                getMessages('pl').greeting.user()
            );
            assert.equal((await readUser(alice.id))?.language, null);
        });

        it('rejects an unknown language code', async () => {
            await command(alice, '/lang xx');

            assert.equal(webhook.lastMessage().text, LL.language.invalid('xx'));
            assert.equal(await readSession(alice.id), null);
        });

        it('keeps an explicit choice over the Telegram language code', async () => {
            await webhook.registerUser(alice, { language: 'uk' });
            await command({ ...alice, language_code: 'en' }, '/start');

            assert.equal(webhook.lastMessage().text, LL.greeting.user());
        });

        it('keeps an explicit choice when a callback has no language code', async () => {
            await webhook.registerUser(alice, {
                language: 'uk',
                telegramLanguageCode: 'en'
            });
            await tap(aliceWithoutLanguageCode, 'n:home');

            assert.equal(webhook.lastMessage().text, LL.greeting.user());
        });
    });
});
