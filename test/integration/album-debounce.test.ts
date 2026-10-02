import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getMessages } from '../../src/bot/content/messages';
import { ALBUM_DEBOUNCE_MS } from '../../src/bot/screens/wish-edit';
import { createTestUser } from '../fixtures/telegram';
import {
    createTelegramApiError,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');

describe('Album debounce through waitUntil and the D1 marker', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(201, {
        first_name: 'Alice',
        username: 'alice'
    });

    const startImagePrompt = async () => {
        const owner = await webhook.registerUser(alice);
        const wish = await webhook.createWish(owner, 'Bicycle');

        await webhook.send(
            webhook.builders.callback(alice, `w:f:i:${wish.id}`)
        );
        webhook.clearApiCalls();

        return { owner, wish };
    };
    const sendAlbum = async (
        mediaGroupId: string,
        fileIds: readonly string[]
    ) => {
        const updateIds: number[] = [];

        for (const fileId of fileIds) {
            const update = webhook.builders.photo(alice, {
                fileId,
                mediaGroupId
            });

            updateIds.push(update.update_id);
            await webhook.sendHolding(update);
        }

        return updateIds;
    };
    const readImages = async (wishId: number) => {
        const row = await webhook.queryOne<{ images: string }>(
            'SELECT images FROM wishes WHERE id = ?',
            wishId
        );

        return JSON.parse(row?.images ?? '[]') as string[];
    };
    const readSession = async () => {
        const row = await webhook.queryOne<{
            state: string;
            media_group_id: string | null;
            media_group_marker: number | null;
        }>(
            'SELECT state, media_group_id, media_group_marker FROM sessions WHERE telegram_user_id = ?',
            alice.id
        );

        return {
            pendingInput: (
                JSON.parse(row?.state ?? '{}') as {
                    pendingInput?: { kind: string } | null;
                }
            ).pendingInput,
            mediaGroupId: row?.media_group_id ?? null,
            mediaGroupMarker: row?.media_group_marker ?? null
        };
    };
    const editMenuCount = () => {
        return webhook.messageTexts().filter(text => {
            return text === LL.wishlist.edit.description();
        }).length;
    };
    const savedCount = () => {
        return webhook.messageTexts().filter(text => {
            return text.startsWith(LL.wishlist.edit.success.updateImages());
        }).length;
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

    it('stores all three photos at once but renders the edit menu only after the debounce', async () => {
        const { wish } = await startImagePrompt();
        const updateIds = await sendAlbum('album-1', ['p1', 'p2', 'p3']);

        assert.deepEqual(await readImages(wish.id), ['p1', 'p2', 'p3']);
        assert.deepEqual(webhook.sleepRequests, [
            ALBUM_DEBOUNCE_MS,
            ALBUM_DEBOUNCE_MS,
            ALBUM_DEBOUNCE_MS
        ]);
        assert.equal(savedCount(), 0);
        assert.equal(editMenuCount(), 0);
        assert.deepEqual(await readSession(), {
            pendingInput: {
                kind: 'wishField',
                wishId: wish.id,
                field: 'images'
            },
            mediaGroupId: 'album-1',
            mediaGroupMarker: updateIds[2] ?? null
        });
    });

    it('renders one success message and one edit menu with three images', async () => {
        const { wish } = await startImagePrompt();

        await sendAlbum('album-1', ['p1', 'p2', 'p3']);
        await webhook.settle();

        assert.equal(savedCount(), 1);
        assert.equal(editMenuCount(), 1);
        assert.equal(webhook.callsOf('sendMediaGroup').length, 1);
        const mediaGroup = webhook.callsOf('sendMediaGroup')[0];
        const media = (mediaGroup?.payload.media ?? []) as Array<{
            media: string;
        }>;

        assert.deepEqual(
            media.map(item => {
                return item.media;
            }),
            ['p1', 'p2', 'p3']
        );
        assert.deepEqual(await readImages(wish.id), ['p1', 'p2', 'p3']);
        assert.deepEqual(await readSession(), {
            pendingInput: null,
            mediaGroupId: null,
            mediaGroupMarker: null
        });
    });

    it('caps the wish at nine images and tells the user', async () => {
        const { wish } = await startImagePrompt();
        const fileIds = Array.from({ length: 11 }, (_, index) => {
            return `photo-${index + 1}`;
        });

        await sendAlbum('album-big', fileIds);
        await webhook.settle();

        assert.deepEqual(await readImages(wish.id), fileIds.slice(0, 9));
        assert.equal(savedCount(), 1);
        assert.ok(
            webhook
                .messageTexts()
                .includes(
                    `${LL.wishlist.edit.success.updateImages()}\n${LL.wishlist.edit.success.imagesLimit()}`
                )
        );
        assert.equal(editMenuCount(), 1);
    });

    it('stores a repeated file id once', async () => {
        const { wish } = await startImagePrompt();

        await sendAlbum('album-dupes', ['same', 'same', 'other']);
        await webhook.settle();

        assert.deepEqual(await readImages(wish.id), ['same', 'other']);
        assert.equal(editMenuCount(), 1);
    });

    it('renders once for the latest of two albums sent back to back', async () => {
        const { wish } = await startImagePrompt();

        await sendAlbum('album-a', ['a1', 'a2']);
        await sendAlbum('album-b', ['b1']);
        await webhook.settle();

        assert.deepEqual(await readImages(wish.id), ['a1', 'a2', 'b1']);
        assert.equal(savedCount(), 1);
        assert.equal(editMenuCount(), 1);
    });

    it('does not use the debounce for a lone photo', async () => {
        const { wish } = await startImagePrompt();

        await webhook.sendHolding(
            webhook.builders.photo(alice, { fileId: 'single' })
        );

        assert.deepEqual(webhook.sleepRequests, []);
        assert.deepEqual(await readImages(wish.id), ['single']);
        assert.equal(savedCount(), 1);
        assert.equal(editMenuCount(), 1);
        assert.equal((await readSession()).mediaGroupMarker, null);
    });

    it('recovers when the deferred render never runs', async () => {
        const { wish } = await startImagePrompt();

        await sendAlbum('album-lost', ['p1', 'p2']);

        assert.equal(savedCount(), 0);
        assert.equal((await readSession()).pendingInput?.kind, 'wishField');

        await webhook.sendHolding(
            webhook.builders.message(alice, 'did it work?')
        );

        assert.ok(
            webhook
                .messageTexts()
                .includes(LL.wishlist.edit.errors.updateImages())
        );
        assert.deepEqual(await readImages(wish.id), ['p1', 'p2']);
        assert.equal((await readSession()).pendingInput?.kind, 'wishField');
    });

    it('keeps the images and the request healthy when the deferred render fails', async () => {
        const { wish } = await startImagePrompt();

        await sendAlbum('album-flaky', ['p1', 'p2']);
        webhook.respondToApi(call => {
            if (call.method === 'sendMessage') {
                throw createTelegramApiError(500, 'Internal Server Error');
            }

            return undefined;
        });
        await webhook.settle();

        assert.deepEqual(await readImages(wish.id), ['p1', 'p2']);
        assert.equal((await readSession()).mediaGroupMarker, null);
        assert.equal((await readSession()).pendingInput, null);
    });

    it('clears all images with the remove label and deletes the user message', async () => {
        const { wish } = await startImagePrompt();

        await sendAlbum('album-clear', ['p1', 'p2']);
        await webhook.settle();
        await webhook.send(
            webhook.builders.callback(alice, `w:f:i:${wish.id}`)
        );
        webhook.clearApiCalls();

        const removal = webhook.builders.message(alice, LL.actions.remove());

        await webhook.send(removal);

        assert.deepEqual(await readImages(wish.id), []);
        assert.deepEqual(
            webhook.callsOf('deleteMessage').map(call => {
                return call.payload.message_id;
            }),
            [removal.update_id]
        );
        assert.ok(
            webhook
                .messageTexts()
                .includes(LL.wishlist.edit.success.removeImages())
        );
        assert.equal(editMenuCount(), 1);
    });

    it('reports that there is nothing to remove when the wish has no images', async () => {
        const { wish } = await startImagePrompt();

        await webhook.send(
            webhook.builders.message(alice, LL.actions.remove())
        );

        assert.ok(
            webhook
                .messageTexts()
                .includes(LL.wishlist.edit.errors.removeImages())
        );
        assert.deepEqual(await readImages(wish.id), []);
        assert.deepEqual(webhook.callsOf('deleteMessage'), []);
    });
});
