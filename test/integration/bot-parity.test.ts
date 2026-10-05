import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getRuntimeCrypto, sha256Hex } from '../../src/api/auth/crypto';
import { getMessages } from '../../src/bot/content/messages';
import {
    getReleases,
    renderReleaseNotes
} from '../../src/bot/content/releases';
import { RELEASE_NOTES_LIMIT } from '../../src/bot/screens/releases';
import type { UserRecord, WishRecord } from '../../src/db/repositories';
import { createTestUser, type TestUser } from '../fixtures/telegram';
import {
    buttonTextsOf,
    callbackDataOf,
    createWebhookHarness,
    type SentMessage,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');
const HASH_PREFIX_LENGTH = 8;

interface WishStateRow {
    removed: number;
    done: number;
    gifted_hidden: number;
}

describe('Bot parity with the Mini App', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(401, {
        first_name: 'Alice',
        username: 'alice'
    });
    const bob = createTestUser(402, { first_name: 'Bob', username: 'bob' });
    const guest = createTestUser(403, { first_name: 'Guest' });

    const tap = (user: TestUser, data: string) => {
        return webhook.send(webhook.builders.callback(user, data));
    };
    const say = (user: TestUser, text: string) => {
        return webhook.send(webhook.builders.message(user, text));
    };
    const readWishState = (wishId: number) => {
        return webhook.queryOne<WishStateRow>(
            'SELECT removed, done, gifted_hidden FROM wishes WHERE id = ?',
            wishId
        );
    };
    const readImages = async (wishId: number) => {
        const row = await webhook.queryOne<{ images: string }>(
            'SELECT images FROM wishes WHERE id = ?',
            wishId
        );

        return JSON.parse(row?.images ?? '[]') as string[];
    };
    const hash8 = async (fileId: string) => {
        return (await sha256Hex(getRuntimeCrypto(), fileId)).slice(
            0,
            HASH_PREFIX_LENGTH
        );
    };
    const markGifted = async (owner: UserRecord, wish: WishRecord) => {
        await webhook.run(
            webhook.d1.repositories.wishes.softRemove(
                wish.id,
                owner.id,
                true,
                new Date()
            )
        );
    };
    const createGiftedWish = async (owner: UserRecord, title: string) => {
        const wish = await webhook.createWish(owner, title);

        await markGifted(owner, wish);

        return wish;
    };
    const messagesWith = (data: string) => {
        return webhook.sentMessages().filter(message => {
            return callbackDataOf(message).includes(data);
        });
    };
    const answeredTexts = () => {
        return webhook.callsOf('answerCallbackQuery').map(call => {
            return call.payload.text;
        });
    };
    const editedKeyboards = () => {
        return webhook.callsOf('editMessageReplyMarkup').map(call => {
            return call.payload.reply_markup as SentMessage['reply_markup'];
        });
    };
    const searchAlice = async () => {
        await tap(bob, 'n:find');
        await say(bob, '@alice');
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

    describe('own gifted wishes', () => {
        it('offers the gifted list from the wishlist only when gifted wishes exist', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Active');
            await tap(alice, 'n:wl');

            assert.equal(
                callbackDataOf(webhook.lastMessage()).includes('wl:g:0'),
                false
            );

            await createGiftedWish(owner, 'Gifted one');
            await createGiftedWish(owner, 'Gifted two');
            webhook.clearApiCalls();
            await tap(alice, 'n:wl');

            const footer = webhook.lastMessage();

            assert.ok(callbackDataOf(footer).includes('wl:g:0'));
            assert.ok(
                buttonTextsOf(footer).includes(
                    LL.wishlist.gifted.entry({ count: 2 })
                )
            );
        });

        it('keeps the gifted entry on an empty list that only has gifted wishes', async () => {
            const owner = await webhook.registerUser(alice);

            await createGiftedWish(owner, 'Gifted');
            await tap(alice, 'n:wl');

            assert.equal(webhook.lastMessage().text, LL.wishlist.empty());
            assert.ok(callbackDataOf(webhook.lastMessage()).includes('wl:g:0'));
        });

        it('lists gifted wishes with restore and hide buttons and leaves out hidden-forever ones', async () => {
            const owner = await webhook.registerUser(alice);
            const shown = await createGiftedWish(owner, 'Kettle');
            const hidden = await createGiftedWish(owner, 'Scarf');

            await webhook.run(
                webhook.d1.repositories.wishes.setGiftedHidden(
                    hidden.id,
                    owner.id,
                    true
                )
            );
            await tap(alice, 'wl:g:0');

            const texts = webhook.messageTexts();

            assert.equal(texts[0], LL.wishlist.gifted.title());
            assert.ok(texts.some(text => text.includes('Kettle')));
            assert.equal(
                texts.some(text => text.includes('Scarf')),
                false
            );
            assert.deepEqual(
                callbackDataOf(messagesWith(`w:gr:${shown.id}`)[0]),
                [`w:gr:${shown.id}`, `w:gh:${shown.id}`]
            );
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                'n:wl',
                'n:home'
            ]);
        });

        it('restores a gifted wish into the active list', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await createGiftedWish(owner, 'Kettle');

            await tap(alice, `w:gr:${wish.id}`);

            assert.deepEqual(await readWishState(wish.id), {
                removed: 0,
                done: 0,
                gifted_hidden: 0
            });
            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.gifted.restored())
            );
            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.filled.before())
            );
        });

        it('treats a second restore press and another user as an outdated button', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await createGiftedWish(owner, 'Kettle');

            await webhook.registerUser(bob);
            await tap(bob, `w:gr:${wish.id}`);

            assert.equal((await readWishState(wish.id))?.removed, 1);
            assert.ok(
                webhook.messageTexts().includes(LL.errors.outdatedButton())
            );

            await tap(alice, `w:gr:${wish.id}`);
            webhook.clearApiCalls();
            await tap(alice, `w:gr:${wish.id}`);

            assert.ok(
                webhook.messageTexts().includes(LL.errors.outdatedButton())
            );
            assert.equal((await readWishState(wish.id))?.removed, 0);
        });

        it('asks before hiding a gifted wish forever and repeats the hint', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await createGiftedWish(owner, 'Kettle <3');

            await tap(alice, `w:gh:${wish.id}`);

            assert.equal(
                webhook.lastMessage().text,
                LL.wishlist.gifted.hideConfirm({ title: 'Kettle &lt;3' })
            );
            assert.ok(
                webhook
                    .lastMessage()
                    .text.includes(
                        'Його не побачиш ні ти, ні друзі. У статистиці залишиться.'
                    )
            );
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                `w:gh:y:${wish.id}`,
                'wl:g:0'
            ]);

            await tap(alice, 'wl:g:0');

            assert.equal((await readWishState(wish.id))?.gifted_hidden, 0);

            webhook.clearApiCalls();
            await tap(alice, `w:gh:y:${wish.id}`);

            assert.equal((await readWishState(wish.id))?.gifted_hidden, 1);
            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.gifted.hidden())
            );

            webhook.clearApiCalls();
            await tap(alice, `w:gh:y:${wish.id}`);

            assert.ok(
                webhook.messageTexts().includes(LL.errors.outdatedButton())
            );
        });

        it('moves a wish removed as done into the gifted list and offers a cancel button', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Lamp');

            await tap(alice, `w:r:${wish.id}`);

            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                `w:r:y:${wish.id}`,
                `w:r:n:${wish.id}`,
                'n:wl'
            ]);
            assert.ok(
                buttonTextsOf(webhook.lastMessage()).includes(
                    LL.wishlist.remove.cancel()
                )
            );

            await tap(alice, 'n:wl');

            assert.equal((await readWishState(wish.id))?.removed, 0);

            await tap(alice, `w:r:y:${wish.id}`);
            webhook.clearApiCalls();
            await tap(alice, 'wl:g:0');

            assert.ok(
                webhook.messageTexts().some(text => text.includes('Lamp'))
            );
        });
    });

    describe('third-party gifted wishes', () => {
        it('shows the active and gifted counts and a gifted button', async () => {
            const owner = await webhook.registerUser(alice, {
                showGifted: true
            });

            await webhook.createWish(owner, 'Active one');
            await createGiftedWish(owner, 'Gifted one');
            await webhook.registerUser(bob);
            await searchAlice();

            const header = webhook.messageTexts().find(text => {
                return text.startsWith(LL.findList.filled.before('@alice'));
            });

            assert.ok(
                header?.endsWith(
                    LL.findList.gifted.counts({ active: 1, gifted: 1 })
                )
            );
            assert.ok(
                callbackDataOf(webhook.lastMessage()).includes(
                    `t:gl:${owner.id}:0`
                )
            );
        });

        it('says there are no active wishes instead of an empty list when only gifted wishes are shown', async () => {
            const owner = await webhook.registerUser(alice, {
                showGifted: true
            });

            await createGiftedWish(owner, 'Gifted one');
            await webhook.registerUser(bob);
            await searchAlice();

            assert.equal(
                webhook.messageTexts().includes(LL.findList.empty()),
                false
            );
            assert.equal(
                webhook.lastMessage().text,
                LL.findList.gifted.noActive()
            );
            assert.ok(
                buttonTextsOf(webhook.lastMessage()).includes(
                    LL.findList.gifted.entry({ count: 1 })
                )
            );
        });

        it('keeps the empty answer when the owner hides gifted wishes', async () => {
            const owner = await webhook.registerUser(alice, {
                showGifted: false
            });

            await createGiftedWish(owner, 'Gifted one');
            await webhook.registerUser(bob);
            await searchAlice();

            assert.ok(webhook.messageTexts().includes(LL.findList.empty()));
            assert.equal(
                webhook.sentMessages().some(message => {
                    return callbackDataOf(message).some(data => {
                        return data.startsWith('t:gl:');
                    });
                }),
                false
            );
        });

        it('lists the gifted wishes without reserve buttons', async () => {
            const owner = await webhook.registerUser(alice, {
                showGifted: true
            });
            const gifted = await createGiftedWish(owner, 'Gifted one');

            await webhook.createWish(owner, 'Active one');
            await webhook.registerUser(bob);
            await searchAlice();
            webhook.clearApiCalls();
            await tap(bob, `t:gl:${owner.id}:0`);

            const texts = webhook.messageTexts();

            assert.equal(texts[0], LL.findList.gifted.title('@alice'));
            assert.ok(texts.some(text => text.includes('Gifted one')));
            assert.equal(
                texts.some(text => text.includes('Active one')),
                false
            );
            assert.equal(
                webhook.sentMessages().some(message => {
                    return callbackDataOf(message).some(data => {
                        return data === `t:g:${gifted.id}`;
                    });
                }),
                false
            );
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                `t:p:${owner.id}:0`,
                'n:home'
            ]);
        });

        it('rejects the gifted button for an owner the viewer did not search', async () => {
            const owner = await webhook.registerUser(alice, {
                showGifted: true
            });

            await createGiftedWish(owner, 'Gifted one');
            await webhook.registerUser(bob);
            await tap(bob, `t:gl:${owner.id}:0`);

            assert.ok(
                webhook.messageTexts().includes(LL.errors.outdatedButton())
            );
            assert.equal(
                webhook
                    .messageTexts()
                    .some(text => text.includes('Gifted one')),
                false
            );
        });
    });

    describe('confirmations', () => {
        it('asks before cancelling one reservation and can keep it', async () => {
            const owner = await webhook.registerUser(alice);
            const viewer = await webhook.registerUser(bob);
            const wish = await webhook.createWish(owner, 'Book', {
                link: 'https://shop.example/book'
            });

            await webhook.run(
                webhook.d1.repositories.gives.add(
                    viewer.id,
                    wish.id,
                    new Date()
                )
            );
            await tap(bob, 'n:gl');
            webhook.clearApiCalls();
            await tap(bob, `g:r:${wish.id}`);

            assert.deepEqual(answeredTexts(), [LL.giveList.remove.confirm()]);
            assert.deepEqual(
                editedKeyboards()[0]
                    ?.inline_keyboard?.flat()
                    .map(button => {
                        return button.callback_data;
                    }),
                [`g:r:y:${wish.id}`, `g:r:n:${wish.id}`]
            );
            assert.deepEqual(webhook.callsOf('sendMessage'), []);

            webhook.clearApiCalls();
            await tap(bob, `g:r:n:${wish.id}`);

            assert.deepEqual(
                editedKeyboards()[0]
                    ?.inline_keyboard?.flat()
                    .map(button => {
                        return button.callback_data ?? button.url;
                    }),
                ['https://shop.example/book', `g:r:${wish.id}`]
            );

            const gives = await webhook.queryAll(
                'SELECT id FROM gives WHERE user_id = ?',
                viewer.id
            );

            assert.equal(gives.length, 1);

            webhook.clearApiCalls();
            await tap(bob, `g:r:y:${wish.id}`);

            assert.deepEqual(answeredTexts(), [
                LL.giveList.success.remove().replace(/<\/?b>/g, '')
            ]);
            assert.deepEqual(
                await webhook.queryAll(
                    'SELECT id FROM gives WHERE user_id = ?',
                    viewer.id
                ),
                []
            );
        });

        it('asks before removing the payment info and keeps it on no', async () => {
            await webhook.registerUser(alice, { payments: 'Jar 123' });
            await tap(alice, 'p:rm');

            assert.equal(
                webhook.lastMessage().text,
                LL.payments.remove.confirm()
            );

            await tap(alice, 'n:pay');

            const row = await webhook.queryOne<{ payments: string | null }>(
                'SELECT payments FROM users WHERE telegram_id = ?',
                alice.id
            );

            assert.equal(row?.payments, 'Jar 123');
        });

        it('asks before removing the delivery address and removes it on yes', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.run(
                webhook.d1.repositories.users.setDeliveryAddress(
                    owner.id,
                    'Nova Poshta 12',
                    new Date()
                )
            );
            await tap(alice, 'dlv:rm');

            assert.equal(
                webhook.lastMessage().text,
                LL.delivery.removeConfirm()
            );
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                'dlv:rm:y',
                'n:dlv'
            ]);

            await tap(alice, 'dlv:rm:y');

            const row = await webhook.queryOne<{
                delivery_address: string | null;
            }>(
                'SELECT delivery_address FROM users WHERE telegram_id = ?',
                alice.id
            );

            assert.equal(row?.delivery_address, null);
            assert.ok(
                webhook.messageTexts().includes(LL.delivery.success.remove())
            );
        });
    });

    describe('single photo removal', () => {
        const seedWishWithImages = async (fileIds: readonly string[]) => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Bicycle');

            await webhook.queryOne(
                'UPDATE wishes SET images = ? WHERE id = ? RETURNING id',
                JSON.stringify(fileIds),
                wish.id
            );

            return wish;
        };

        it('removes the chosen photo and shows the edit menu', async () => {
            const wish = await seedWishWithImages([
                'photo-a',
                'photo-b',
                'photo-c'
            ]);

            await tap(alice, `w:io:${wish.id}`);
            webhook.clearApiCalls();
            await tap(alice, `w:ir:${wish.id}:1:${await hash8('photo-b')}`);

            assert.deepEqual(await readImages(wish.id), ['photo-a', 'photo-c']);
            assert.ok(
                webhook
                    .messageTexts()
                    .includes(LL.wishlist.edit.images.order.removed())
            );
            assert.equal(
                webhook.lastMessage().text,
                LL.wishlist.edit.description()
            );
        });

        it('keeps the photos when the button is stale', async () => {
            const wish = await seedWishWithImages(['photo-a', 'photo-b']);

            await tap(alice, `w:ir:${wish.id}:1:${await hash8('photo-a')}`);

            assert.deepEqual(await readImages(wish.id), ['photo-a', 'photo-b']);
            assert.ok(
                webhook
                    .messageTexts()
                    .includes(LL.wishlist.edit.images.order.removeChanged())
            );
        });
    });

    describe('home entries and releases', () => {
        it('shows the share and releases entries on the registered home menu', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:home');

            const data = callbackDataOf(webhook.lastMessage());

            assert.ok(data.includes('wl:share'));
            assert.ok(data.includes('n:rel'));
            assert.ok(
                buttonTextsOf(webhook.lastMessage()).includes(
                    LL.releases.title()
                )
            );
        });

        it('opens sharing from the home menu', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'wl:share');

            assert.ok(
                webhook.messageTexts().includes(LL.wishlist.share.empty())
            );
        });

        it('pages through older releases, also for guests', async () => {
            const total = getReleases().length;

            assert.ok(total > RELEASE_NOTES_LIMIT);

            await tap(guest, 'n:rel');

            assert.equal(
                webhook.lastMessage().text,
                renderReleaseNotes(RELEASE_NOTES_LIMIT, 'uk')
            );
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                `rel:p:${RELEASE_NOTES_LIMIT}`,
                'n:home'
            ]);

            webhook.clearApiCalls();
            await tap(guest, `rel:p:${RELEASE_NOTES_LIMIT}`);

            const olderPage = webhook.lastMessage();
            const nextOffset = RELEASE_NOTES_LIMIT * 2;

            assert.equal(
                olderPage.text,
                renderReleaseNotes(
                    RELEASE_NOTES_LIMIT,
                    'uk',
                    RELEASE_NOTES_LIMIT
                )
            );
            assert.deepEqual(
                callbackDataOf(olderPage),
                nextOffset < total
                    ? [`rel:p:${nextOffset}`, 'n:home']
                    : ['n:home']
            );
            assert.ok(
                olderPage.text.includes(
                    getReleases()[RELEASE_NOTES_LIMIT]?.version ?? ''
                )
            );
        });
    });
});
