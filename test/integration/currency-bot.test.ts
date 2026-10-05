import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getMessages } from '../../src/bot/content/messages';
import { createTestUser, type TestUser } from '../fixtures/telegram';
import {
    buttonTextsOf,
    callbackDataOf,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

interface UserCurrencyRow {
    currency: string;
}

interface WishCurrencyRow {
    id: number;
    price: number;
    currency: string;
}

const LL = getMessages('uk');
const LL_EN = getMessages('en');

describe('Currency flows in the bot', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(201, {
        first_name: 'Alice',
        username: 'alice'
    });
    const bella = createTestUser(202, {
        first_name: 'Bella',
        username: 'bella',
        language_code: 'en'
    });
    const celina = createTestUser(203, {
        first_name: 'Celina',
        username: 'celina',
        language_code: 'pl'
    });

    const tap = (user: TestUser, data: string) => {
        return webhook.send(webhook.builders.callback(user, data));
    };
    const say = (user: TestUser, text: string) => {
        return webhook.send(webhook.builders.message(user, text));
    };
    const readUserCurrency = async (user: TestUser) => {
        const row = await webhook.queryOne<UserCurrencyRow>(
            'SELECT currency FROM users WHERE telegram_id = ?',
            user.id
        );

        return row?.currency;
    };
    const readWish = (wishId: number) => {
        return webhook.queryOne<WishCurrencyRow>(
            'SELECT id, price, currency FROM wishes WHERE id = ?',
            wishId
        );
    };
    const createWishFor = async (user: TestUser, price = 0) => {
        const owner = await webhook.registerUser(user);

        return webhook.createWish(owner, 'Bicycle', { price });
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

    describe('registration', () => {
        it('gives a new user the currency of the Telegram language', async () => {
            await tap(alice, 'a:u');
            await tap(bella, 'a:u');
            await tap(celina, 'a:u');

            assert.equal(await readUserCurrency(alice), 'UAH');
            assert.equal(await readUserCurrency(bella), 'EUR');
            assert.equal(await readUserCurrency(celina), 'PLN');
        });
    });

    describe('currency screen', () => {
        it('lists every currency and marks the current one', async () => {
            await webhook.registerUser(bella, { currency: 'EUR' });
            await tap(bella, 'n:cur');

            const message = webhook.lastMessage();
            const labels = buttonTextsOf(message);

            assert.deepEqual(callbackDataOf(message), [
                'cur:UAH',
                'cur:USD',
                'cur:EUR',
                'cur:PLN',
                'n:set',
                'n:home'
            ]);
            assert.equal(
                labels.filter(label => {
                    return label.startsWith('✅');
                }).length,
                1
            );
            assert.ok(labels[2]?.startsWith('✅'));
        });

        it('saves the chosen currency and confirms it', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'cur:USD');

            assert.equal(await readUserCurrency(alice), 'USD');
            assert.ok(
                webhook.messageTexts().includes(
                    LL.currency.success({
                        currency: LL.currency.options.USD()
                    })
                )
            );
            assert.equal(
                webhook.callsOf('sendMessage').at(-1)?.payload.chat_id,
                alice.id
            );
        });

        it('does not touch the currency of existing wishes', async () => {
            const wish = await createWishFor(alice, 500);

            await tap(alice, 'cur:PLN');

            assert.equal((await readWish(wish.id))?.currency, 'UAH');
        });

        it('sends a guest to the home menu instead of creating a user', async () => {
            await tap(bella, 'cur:USD');

            assert.equal(await readUserCurrency(bella), undefined);
        });
    });

    describe('wish price prompt', () => {
        it('offers the other three currencies next to the prompt', async () => {
            const wish = await createWishFor(alice);

            await tap(alice, `w:f:p:${wish.id}`);

            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                `w:cu:${wish.id}:USD`,
                `w:cu:${wish.id}:EUR`,
                `w:cu:${wish.id}:PLN`
            ]);
        });

        it('switches the wish currency and keeps waiting for the price', async () => {
            const wish = await createWishFor(alice);

            await tap(alice, `w:f:p:${wish.id}`);
            await tap(alice, `w:cu:${wish.id}:EUR`);

            assert.equal((await readWish(wish.id))?.currency, 'EUR');
            assert.deepEqual(callbackDataOf(webhook.lastMessage()), [
                `w:cu:${wish.id}:UAH`,
                `w:cu:${wish.id}:USD`,
                `w:cu:${wish.id}:PLN`
            ]);

            await say(alice, '99');

            const row = await readWish(wish.id);

            assert.equal(row?.price, 99);
            assert.equal(row?.currency, 'EUR');
        });

        it('takes the currency from a marker typed with the price', async () => {
            const wish = await createWishFor(alice);

            await tap(alice, `w:f:p:${wish.id}`);
            await say(alice, '$20');

            const row = await readWish(wish.id);

            assert.equal(row?.price, 20);
            assert.equal(row?.currency, 'USD');
        });

        it('keeps the wish currency when the price has no marker', async () => {
            const wish = await createWishFor(alice);

            await tap(alice, `w:cu:${wish.id}:PLN`);
            await tap(alice, `w:f:p:${wish.id}`);
            await say(alice, '1 500');

            const row = await readWish(wish.id);

            assert.equal(row?.price, 1500);
            assert.equal(row?.currency, 'PLN');
        });

        it('refuses to change the currency of somebody else wish', async () => {
            const wish = await createWishFor(alice);

            await webhook.registerUser(bella);
            await tap(bella, `w:cu:${wish.id}:USD`);

            assert.equal((await readWish(wish.id))?.currency, 'UAH');
            assert.ok(
                webhook.messageTexts().includes(LL_EN.errors.outdatedButton())
            );
        });
    });
});
