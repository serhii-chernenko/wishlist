import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    TelegramApiError,
    type SentPhotoMessage,
    type TelegramApi
} from '../src/api/telegram-api';
import {
    drainPendingPhotos,
    type PhotoDrainPorts,
    type PhotoDrainStore
} from '../src/bot/services/list-import/photos';
import { ADAPTERS } from '../src/bot/services/list-import/registry';
import type { DrainCandidate, PendingPhotoWish } from '../src/db/repositories';
import { LIST_IMPORT_PHOTO_PACE_MS } from '../src/shared/app-api';
import {
    GIF_BYTES,
    JPEG_BYTES,
    createFakeSafeFetcher,
    type FakeImageResponse
} from './fixtures/link-import-fakes';

const IMAGE_BASE =
    'https://storage.rewish.io/00000000-0000-0000-0000-0000000000';

interface FakeWish extends PendingPhotoWish {
    userId: number;
    images: string[];
}

const pendingWish = (
    id: number,
    overrides: Partial<FakeWish> = {}
): FakeWish => {
    return {
        id,
        userId: 1,
        sourceRef: `rewish:wish:${id}`,
        sourceImageUrl: `${IMAGE_BASE}${String(id).padStart(2, '0')}_compressed`,
        removed: false,
        done: false,
        giftedHidden: false,
        imageCount: 0,
        images: [],
        ...overrides
    };
};

const originalOf = (wish: FakeWish) => {
    return wish.sourceImageUrl.replace('_compressed', '');
};

interface FakeStore extends PhotoDrainStore {
    wishes: FakeWish[];
    candidates: DrainCandidate[];
    leases: Map<number, number>;
    touched: number[];
}

const createStore = (
    wishes: FakeWish[],
    candidates: DrainCandidate[] = [
        { userId: 1, telegramId: 1001, blocked: false, leaseJobId: 10 }
    ]
): FakeStore => {
    const store: FakeStore = {
        wishes,
        candidates,
        leases: new Map(),
        touched: [],
        async listCandidates(limit, userId) {
            return store.candidates
                .filter(candidate => {
                    const pending = store.wishes.some(wish => {
                        return (
                            wish.userId === candidate.userId &&
                            wish.sourceImageUrl !== ''
                        );
                    });

                    return (
                        pending &&
                        (userId === undefined || candidate.userId === userId)
                    );
                })
                .slice(0, limit);
        },
        async acquireLease(jobId, now, leaseUntil) {
            const current = store.leases.get(jobId);

            if (current !== undefined && current >= now.getTime()) {
                return false;
            }

            store.leases.set(jobId, leaseUntil.getTime());

            return true;
        },
        async releaseLease(jobId, leaseUntil, heldUntil) {
            if (store.leases.get(jobId) !== leaseUntil.getTime()) {
                return;
            }

            if (heldUntil === undefined || heldUntil === null) {
                store.leases.delete(jobId);
            } else {
                store.leases.set(jobId, heldUntil.getTime());
            }
        },
        async listPending(userId, limit) {
            return store.wishes
                .filter(wish => {
                    return wish.userId === userId && wish.sourceImageUrl !== '';
                })
                .slice(0, limit)
                .map(wish => {
                    return { ...wish, imageCount: wish.images.length };
                });
        },
        async appendImage(wishId, userId, fileId) {
            const wish = store.wishes.find(candidate => {
                return candidate.id === wishId && candidate.userId === userId;
            });
            const visible =
                wish !== undefined &&
                (!wish.removed || (wish.done && !wish.giftedHidden));

            if (wish === undefined || !visible || wish.images.length > 0) {
                return false;
            }

            wish.images.push(fileId);
            wish.sourceImageUrl = '';

            return true;
        },
        async clearImage(wishId) {
            const wish = store.wishes.find(candidate => {
                return candidate.id === wishId;
            });

            if (wish === undefined) {
                return false;
            }

            wish.sourceImageUrl = '';

            return true;
        },
        async clearAll(userId) {
            let cleared = 0;

            for (const wish of store.wishes) {
                if (wish.userId === userId && wish.sourceImageUrl !== '') {
                    wish.sourceImageUrl = '';
                    cleared += 1;
                }
            }

            return cleared;
        },
        async touchShare(userId) {
            store.touched.push(userId);
        }
    };

    return store;
};

const photoMessage = (fileId: string, messageId: number) => {
    return {
        message_id: messageId,
        photo: [{ file_id: fileId, width: 800, height: 800 }]
    } as unknown as SentPhotoMessage;
};

interface FakeTelegram extends TelegramApi {
    sentAt: number[];
    chats: (number | string)[];
    deleted: number[];
    failures: (Error | null)[];
}

const createTelegram = (clock: { now: number }): FakeTelegram => {
    let sent = 0;
    const telegram: FakeTelegram = {
        sentAt: [],
        chats: [],
        deleted: [],
        failures: [],
        async sendMessage() {
            throw new Error('unexpected sendMessage');
        },
        async sendPhoto(chatId) {
            const failure = telegram.failures.shift() ?? null;

            telegram.sentAt.push(clock.now);
            telegram.chats.push(chatId);

            if (failure !== null) {
                throw failure;
            }

            sent += 1;

            return photoMessage(`file-${sent}`, sent);
        },
        async sendMediaGroup() {
            throw new Error('unexpected sendMediaGroup');
        },
        async editMessageText() {
            throw new Error('unexpected editMessageText');
        },
        async deleteMessage(_chatId, messageId) {
            telegram.deleted.push(messageId);

            return true;
        },
        async getFile() {
            throw new Error('unexpected getFile');
        },
        async downloadFile() {
            throw new Error('unexpected downloadFile');
        }
    };

    return telegram;
};

const telegramError = (code: number) => {
    return new TelegramApiError('sendPhoto', {
        error_code: code,
        description: `error ${code}`
    });
};

const jpeg: FakeImageResponse = { bytes: JPEG_BYTES };

const setup = (input: {
    wishes: FakeWish[];
    images?: Record<string, FakeImageResponse>;
    candidates?: DrainCandidate[];
    hostAllowed?: boolean;
}) => {
    const clock = { now: 1_000_000 };
    const store = createStore(input.wishes, input.candidates);
    const telegram = createTelegram(clock);
    const fetcher = createFakeSafeFetcher({ images: input.images ?? {} });
    const sleeps: number[] = [];
    const hostRequests: string[] = [];
    const ports: PhotoDrainPorts = {
        store,
        adapters: ADAPTERS,
        fetcher,
        telegram,
        async acquireHostToken(host) {
            hostRequests.push(host);

            return input.hostAllowed ?? true;
        },
        now() {
            return clock.now;
        },
        async sleep(milliseconds) {
            sleeps.push(milliseconds);
            clock.now += milliseconds;
        },
        async waitUntil() {
            return undefined;
        }
    };

    return { clock, store, telegram, fetcher, sleeps, hostRequests, ports };
};

const originalsOk = (wishes: readonly FakeWish[]) => {
    return Object.fromEntries(
        wishes.map(wish => {
            return [originalOf(wish), jpeg];
        })
    );
};

describe('list import photo drain', () => {
    it('reports idle when nobody has pending photos', async () => {
        const { ports } = setup({ wishes: [] });

        assert.deepEqual(
            await drainPendingPhotos(ports, { budgetMs: 20_000 }),
            {
                result: 'idle',
                ingested: 0,
                failed: 0
            }
        );
    });

    it('uploads the original cover photo to the owner chat and keeps uploads 1.2 s apart', async () => {
        const wishes = [pendingWish(1), pendingWish(2), pendingWish(3)];
        const expectedUrls = wishes.map(originalOf);
        const { ports, telegram, store, sleeps, fetcher } = setup({
            wishes,
            images: originalsOk(wishes)
        });
        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.deepEqual(summary, {
            result: 'drained',
            ingested: 3,
            failed: 0
        });
        assert.deepEqual(telegram.chats, [1001, 1001, 1001]);
        assert.deepEqual(sleeps, [
            LIST_IMPORT_PHOTO_PACE_MS,
            LIST_IMPORT_PHOTO_PACE_MS
        ]);

        for (let index = 1; index < telegram.sentAt.length; index += 1) {
            assert.ok(
                (telegram.sentAt[index] as number) -
                    (telegram.sentAt[index - 1] as number) >=
                    LIST_IMPORT_PHOTO_PACE_MS
            );
        }

        assert.deepEqual(
            store.wishes.map(wish => {
                return [wish.images, wish.sourceImageUrl];
            }),
            [
                [['file-1'], ''],
                [['file-2'], ''],
                [['file-3'], '']
            ]
        );
        assert.deepEqual(
            fetcher.imageCalls.map(call => {
                return call.url;
            }),
            expectedUrls
        );
        assert.deepEqual(store.touched, [1]);
        assert.equal(store.leases.size, 0);
    });

    it('falls back to the _compressed URL when the original fails', async () => {
        const wish = pendingWish(4);
        const expectedUrls = [originalOf(wish), wish.sourceImageUrl];
        const { ports, store, fetcher } = setup({
            wishes: [wish],
            images: { [wish.sourceImageUrl]: jpeg }
        });
        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(summary.ingested, 1);
        assert.deepEqual(
            fetcher.imageCalls.map(call => {
                return call.url;
            }),
            expectedUrls
        );
        assert.deepEqual(store.wishes[0]?.images, ['file-1']);
    });

    it('clears the URL when both candidates fail or the image is unsupported', async () => {
        const missing = pendingWish(5);
        const gif = pendingWish(6);
        const { ports, store, telegram } = setup({
            wishes: [missing, gif],
            images: { [originalOf(gif)]: { bytes: GIF_BYTES } }
        });
        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.deepEqual(summary, {
            result: 'drained',
            ingested: 0,
            failed: 2
        });
        assert.equal(telegram.sentAt.length, 0);
        assert.deepEqual(
            store.wishes.map(wish => {
                return wish.sourceImageUrl;
            }),
            ['', '']
        );
    });

    it('clears every pending photo of a user who blocked the bot (403)', async () => {
        const wishes = [pendingWish(7), pendingWish(8), pendingWish(9)];
        const { ports, store, telegram } = setup({
            wishes,
            images: originalsOk(wishes)
        });

        telegram.failures.push(telegramError(403));

        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(summary.ingested, 0);
        assert.equal(telegram.sentAt.length, 1);
        assert.ok(
            store.wishes.every(wish => {
                return wish.sourceImageUrl === '' && wish.images.length === 0;
            })
        );
    });

    it('touches the share when a failed photo is cleared so the page drops the pending state', async () => {
        const wish = pendingWish(40, {
            sourceImageUrl: 'https://evil.test/cover.jpg'
        });
        const { ports, store } = setup({ wishes: [wish] });

        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(summary.failed, 1);
        assert.equal(store.wishes[0]?.sourceImageUrl, '');
        assert.deepEqual(store.touched, [1]);
    });

    it('touches the share when a photo is cleared for a removed wish', async () => {
        const wish = pendingWish(41, { removed: true });
        const { ports, store } = setup({ wishes: [wish] });

        await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(store.wishes[0]?.sourceImageUrl, '');
        assert.deepEqual(store.touched, [1]);
    });

    it('touches the share once when every pending photo of a blocked bot or a 403 user is cleared', async () => {
        const blockedWishes = [pendingWish(42), pendingWish(43)];
        const blocked = setup({
            wishes: blockedWishes,
            candidates: [
                { userId: 1, telegramId: 1001, blocked: true, leaseJobId: 10 }
            ]
        });
        const forbiddenWishes = [pendingWish(44), pendingWish(45)];
        const forbidden = setup({
            wishes: forbiddenWishes,
            images: originalsOk(forbiddenWishes)
        });

        forbidden.telegram.failures.push(telegramError(403));

        await drainPendingPhotos(blocked.ports, { budgetMs: 20_000 });
        await drainPendingPhotos(forbidden.ports, { budgetMs: 20_000 });

        assert.deepEqual(blocked.store.touched, [1]);
        assert.deepEqual(forbidden.store.touched, [1]);
    });

    it('does not touch the share when nothing was cleared or landed', async () => {
        const wishes = [pendingWish(46)];
        const { ports, store } = setup({
            wishes,
            images: originalsOk(wishes),
            hostAllowed: false
        });

        await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.deepEqual(store.touched, []);
        assert.notEqual(store.wishes[0]?.sourceImageUrl, '');
    });

    it('clears a blocked user without downloading anything', async () => {
        const wishes = [pendingWish(10)];
        const { ports, store, fetcher } = setup({
            wishes,
            images: originalsOk(wishes),
            candidates: [
                { userId: 1, telegramId: 1001, blocked: true, leaseJobId: 10 }
            ]
        });

        await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(fetcher.imageCalls.length, 0);
        assert.equal(store.wishes[0]?.sourceImageUrl, '');
    });

    it('stops the run and keeps the URLs when the host limiter refuses', async () => {
        const wishes = [pendingWish(11), pendingWish(12)];
        const { ports, store, fetcher, hostRequests } = setup({
            wishes,
            images: originalsOk(wishes),
            hostAllowed: false
        });
        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(summary.result, 'rateLimited');
        assert.deepEqual(hostRequests, ['storage.rewish.io']);
        assert.equal(fetcher.imageCalls.length, 0);
        assert.ok(
            store.wishes.every(wish => {
                return wish.sourceImageUrl !== '';
            })
        );
        assert.equal(store.leases.size, 0);
    });

    it('stops the run and keeps the URL on a Telegram 429', async () => {
        const wishes = [pendingWish(13), pendingWish(14)];
        const { ports, store, telegram } = setup({
            wishes,
            images: originalsOk(wishes)
        });

        telegram.failures.push(telegramError(429));

        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(summary.result, 'rateLimited');
        assert.equal(telegram.sentAt.length, 1);
        assert.ok(
            store.wishes.every(wish => {
                return wish.sourceImageUrl !== '';
            })
        );
    });

    it('clears a photo Telegram rejects with a 400 and goes on', async () => {
        const wishes = [pendingWish(15), pendingWish(16)];
        const { ports, store, telegram } = setup({
            wishes,
            images: originalsOk(wishes)
        });

        telegram.failures.push(telegramError(400));

        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.deepEqual(summary, {
            result: 'drained',
            ingested: 1,
            failed: 1
        });
        assert.deepEqual(store.wishes[0]?.images, []);
        assert.deepEqual(store.wishes[1]?.images, ['file-1']);
    });

    it('takes one host limiter token per user run', async () => {
        const wishes = [
            pendingWish(17),
            pendingWish(18),
            pendingWish(19, { userId: 2 })
        ];
        const { ports, hostRequests } = setup({
            wishes,
            images: originalsOk(wishes),
            candidates: [
                { userId: 1, telegramId: 1001, blocked: false, leaseJobId: 10 },
                { userId: 2, telegramId: 1002, blocked: false, leaseJobId: 20 }
            ]
        });

        const summary = await drainPendingPhotos(ports, { budgetMs: 60_000 });

        assert.equal(summary.ingested, 3);
        assert.equal(hostRequests.length, 2);
    });

    it('skips a user whose lease another drain holds', async () => {
        const wishes = [pendingWish(20)];
        const { ports, store, clock, telegram } = setup({
            wishes,
            images: originalsOk(wishes)
        });

        store.leases.set(10, clock.now + 60_000);

        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.deepEqual(summary, {
            result: 'drained',
            ingested: 0,
            failed: 0
        });
        assert.equal(telegram.sentAt.length, 0);
        assert.equal(
            store.wishes[0]?.sourceImageUrl,
            wishes[0]?.sourceImageUrl
        );
    });

    it('gives a gifted wish its photo but skips a hidden gifted or removed one', async () => {
        const gifted = pendingWish(21, { removed: true, done: true });
        const hiddenGifted = pendingWish(22, {
            removed: true,
            done: true,
            giftedHidden: true
        });
        const removed = pendingWish(23, { removed: true });
        const withPhoto = pendingWish(24, { images: ['own-photo'] });
        const wishes = [gifted, hiddenGifted, removed, withPhoto];
        const { ports, store, telegram } = setup({
            wishes,
            images: originalsOk(wishes)
        });
        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(summary.ingested, 1);
        assert.equal(telegram.sentAt.length, 1);
        assert.deepEqual(
            store.wishes.map(wish => {
                return [wish.images, wish.sourceImageUrl];
            }),
            [
                [['file-1'], ''],
                [[], ''],
                [[], ''],
                [['own-photo'], '']
            ]
        );
    });

    it('drains the gifted imported wishes of a user the first time a list load kicks', async () => {
        const wishes = [
            pendingWish(1213, { removed: true, done: true }),
            pendingWish(1214, { removed: true, done: true })
        ];
        const { ports, store, telegram } = setup({
            wishes,
            images: originalsOk(wishes)
        });
        const summary = await drainPendingPhotos(ports, {
            budgetMs: 20_000,
            holdLeaseMs: 60_000
        });

        assert.deepEqual(summary, {
            result: 'drained',
            ingested: 2,
            failed: 0
        });
        assert.equal(telegram.sentAt.length, 2);
        assert.deepEqual(
            store.wishes.map(wish => {
                return wish.images.length;
            }),
            [1, 1]
        );
    });

    it('keeps the lease for the hold interval so a repeated load kick does nothing, then drains again', async () => {
        const first = pendingWish(31);
        const second = pendingWish(32);
        const { ports, store, clock, telegram } = setup({
            wishes: [first],
            images: originalsOk([first, second])
        });
        const request = { budgetMs: 20_000, holdLeaseMs: 60_000 };

        await drainPendingPhotos(ports, request);

        assert.equal(telegram.sentAt.length, 1);
        assert.equal(store.leases.size, 1);

        store.wishes.push(second);
        clock.now += 30_000;

        const locked = await drainPendingPhotos(ports, request);

        assert.equal(locked.ingested, 0);
        assert.equal(telegram.sentAt.length, 1);
        assert.equal(second.sourceImageUrl === '', false);

        clock.now += 31_000;

        const reopened = await drainPendingPhotos(ports, request);

        assert.equal(reopened.ingested, 1);
        assert.equal(telegram.sentAt.length, 2);
    });

    it('releases the lease at once when no hold is asked for', async () => {
        const wishes = [pendingWish(33)];
        const { ports, store } = setup({
            wishes,
            images: originalsOk(wishes)
        });

        await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(store.leases.size, 0);
    });

    it('stops at the budget and leaves the rest for the next run', async () => {
        const wishes = [pendingWish(25), pendingWish(26), pendingWish(27)];
        const { ports, store } = setup({
            wishes,
            images: originalsOk(wishes)
        });
        const summary = await drainPendingPhotos(ports, { budgetMs: 6000 });

        assert.equal(summary.result, 'budget');
        assert.ok(summary.ingested >= 1 && summary.ingested < 3);
        assert.ok(
            store.wishes.some(wish => {
                return wish.sourceImageUrl !== '';
            })
        );
        assert.equal(store.leases.size, 0);
    });

    it('refuses image URLs off the adapter image hosts', async () => {
        const offHost = pendingWish(28, {
            sourceImageUrl: 'https://evil.example/photo.jpg'
        });
        const { ports, store, fetcher } = setup({ wishes: [offHost] });
        const summary = await drainPendingPhotos(ports, { budgetMs: 20_000 });

        assert.equal(summary.failed, 1);
        assert.equal(fetcher.imageCalls.length, 0);
        assert.equal(store.wishes[0]?.sourceImageUrl, '');
    });
});
