import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getRuntimeCrypto, sha256Hex } from '../../src/api/auth/crypto';
import { encodeCallbackData } from '../../src/bot/callback-data';
import { getMessages } from '../../src/bot/content/messages';
import { createTestUser } from '../fixtures/telegram';
import {
    buttonTextsOf,
    callbackDataOf,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');
const HASH_PREFIX_LENGTH = 8;
const FILE_IDS = ['photo-a', 'photo-b', 'photo-c'] as const;

describe('Bot photo order', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(301, {
        first_name: 'Alice',
        username: 'alice'
    });
    const bob = createTestUser(302, { first_name: 'Bob', username: 'bob' });

    const hash8 = async (fileId: string) => {
        return (await sha256Hex(getRuntimeCrypto(), fileId)).slice(
            0,
            HASH_PREFIX_LENGTH
        );
    };

    const seedWishWithImages = async (
        fileIds: readonly string[] = FILE_IDS
    ) => {
        const owner = await webhook.registerUser(alice);
        const wish = await webhook.createWish(owner, 'Bicycle');

        await webhook.queryOne(
            'UPDATE wishes SET images = ? WHERE id = ? RETURNING id',
            JSON.stringify(fileIds),
            wish.id
        );

        return wish;
    };

    const readImages = async (wishId: number) => {
        const row = await webhook.queryOne<{ images: string }>(
            'SELECT images FROM wishes WHERE id = ?',
            wishId
        );

        return JSON.parse(row?.images ?? '[]') as string[];
    };

    const press = async (data: string, user = alice) => {
        await webhook.send(webhook.builders.callback(user, data));
    };

    const albumFileIds = () => {
        return webhook.callsOf('sendMediaGroup').map(call => {
            return (call.payload.media as Array<{ media: string }>).map(
                item => item.media
            );
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
    });

    it('offers the photo order button on the edit menu only with two or more photos', async () => {
        const wish = await seedWishWithImages();

        await press(`w:e:${wish.id}`);

        assert.ok(
            callbackDataOf(webhook.lastMessage()).includes(`w:io:${wish.id}`)
        );

        await webhook.queryOne(
            'UPDATE wishes SET images = ? WHERE id = ? RETURNING id',
            JSON.stringify(['photo-a']),
            wish.id
        );
        webhook.clearApiCalls();
        await press(`w:e:${wish.id}`);

        assert.ok(
            !callbackDataOf(webhook.lastMessage()).includes(`w:io:${wish.id}`)
        );
    });

    it('sends the album in the current order with a make-first button for every photo after the first', async () => {
        const wish = await seedWishWithImages();

        webhook.clearApiCalls();
        await press(`w:io:${wish.id}`);

        assert.deepEqual(albumFileIds(), [[...FILE_IDS]]);

        const picker = webhook.lastMessage();
        const expectedCodes = [
            `w:if:${wish.id}:1:${await hash8('photo-b')}`,
            `w:if:${wish.id}:2:${await hash8('photo-c')}`,
            `w:e:${wish.id}`
        ];

        assert.equal(picker.text, LL.wishlist.edit.images.order.prompt());
        assert.deepEqual(
            callbackDataOf(picker).filter(code => code.startsWith('w:')),
            expectedCodes
        );
        assert.deepEqual(buttonTextsOf(picker).slice(0, 2), [
            LL.wishlist.edit.images.order.makeFirst({ n: 2 }),
            LL.wishlist.edit.images.order.makeFirst({ n: 3 })
        ]);
        assert.ok(
            (picker.reply_markup?.inline_keyboard ?? []).every(row => {
                return row.length === 1;
            })
        );
    });

    it('moves the chosen photo to the front and shows the edit menu', async () => {
        const wish = await seedWishWithImages();

        await press(`w:io:${wish.id}`);
        webhook.clearApiCalls();
        await press(`w:if:${wish.id}:2:${await hash8('photo-c')}`);

        assert.deepEqual(await readImages(wish.id), [
            'photo-c',
            'photo-a',
            'photo-b'
        ]);
        assert.ok(
            webhook
                .messageTexts()
                .includes(LL.wishlist.edit.images.order.success())
        );
        assert.equal(
            webhook.lastMessage().text,
            LL.wishlist.edit.description()
        );
        assert.deepEqual(albumFileIds(), [['photo-c', 'photo-a', 'photo-b']]);
    });

    it('answers changed for a stale button and leaves the order alone', async () => {
        const wish = await seedWishWithImages();
        const staleButton = `w:if:${wish.id}:1:${await hash8('photo-b')}`;

        await press(`w:if:${wish.id}:2:${await hash8('photo-c')}`);
        webhook.clearApiCalls();
        await press(staleButton);

        assert.deepEqual(await readImages(wish.id), [
            'photo-c',
            'photo-a',
            'photo-b'
        ]);
        assert.ok(
            webhook
                .messageTexts()
                .includes(LL.wishlist.edit.images.order.changed())
        );
        assert.deepEqual(albumFileIds(), [['photo-c', 'photo-a', 'photo-b']]);
        assert.ok(
            callbackDataOf(webhook.lastMessage()).includes(
                `w:if:${wish.id}:1:${await hash8('photo-a')}`
            )
        );
    });

    it('answers changed when the photo index no longer exists', async () => {
        const wish = await seedWishWithImages(['photo-a', 'photo-b']);

        webhook.clearApiCalls();
        await press(
            encodeCallbackData({
                type: 'wishImageFirst',
                wishId: wish.id,
                index: 5,
                hash8: await hash8('photo-b')
            })
        );

        assert.deepEqual(await readImages(wish.id), ['photo-a', 'photo-b']);
        assert.ok(
            webhook
                .messageTexts()
                .includes(LL.wishlist.edit.images.order.changed())
        );
    });

    it('treats another user pressing the button as an outdated wish', async () => {
        const wish = await seedWishWithImages();

        await webhook.registerUser(bob);
        webhook.clearApiCalls();
        await press(`w:if:${wish.id}:1:${await hash8('photo-b')}`, bob);

        assert.deepEqual(await readImages(wish.id), [...FILE_IDS]);
        assert.ok(webhook.messageTexts().includes(LL.errors.outdatedButton()));
        assert.deepEqual(albumFileIds(), []);
    });

    it('falls back to the edit menu when fewer than two photos are left', async () => {
        const wish = await seedWishWithImages(['photo-a']);

        webhook.clearApiCalls();
        await press(`w:io:${wish.id}`);

        assert.deepEqual(albumFileIds(), []);
        assert.equal(
            webhook.lastMessage().text,
            LL.wishlist.edit.description()
        );
    });
});
