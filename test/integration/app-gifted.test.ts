import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { sha256Hex } from '../../src/api/auth/crypto';
import { createSigner } from '../../src/api/auth/signing';
import type { UserRecord, WishRecord } from '../../src/db/repositories';
import {
    APP_PAGE_SIZE,
    APP_THIRD_PARTY_GIFTED_LIMIT,
    type ApiErrorBody,
    type MeDto,
    type OwnerWishListDto,
    type OwnWishDto,
    type SearchResultDto,
    type SharedListDto,
    type WishListDto
} from '../../src/shared/app-api';
import { FALLBACK_RATES, resolvePriceBounds } from '../../src/shared/money';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import {
    createD1Harness,
    seedGeneratedWishes,
    type D1Harness
} from './d1-harness';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const CLIENT_IP = '198.51.100.7';
const EXPENSIVE_FILTER = 4;

const OWNER: InitDataUserFixture = {
    id: 610_000_001,
    first_name: 'Owner',
    username: 'gifted_owner',
    language_code: 'uk'
};
const VIEWER: InitDataUserFixture = {
    id: 610_000_002,
    first_name: 'Viewer',
    username: 'gifted_viewer',
    language_code: 'uk'
};

describe('gifted wishes', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];
    let tick = 0;
    const crypto = createNodeApiCrypto();

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const nextTime = () => {
        tick += 1;

        return new Date(NOW.getTime() - 1_000_000 + tick * 1_000);
    };

    const env = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            ADMIN_ID: '1',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const createTestApp = () => {
        const deps = {
            now: () => NOW,
            crypto,
            selectLimiter: () => null,
            createTelegramApi: () => {
                throw new Error('unexpected Telegram call');
            },
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };

        return createApp({}, {}, { now: () => NOW }, deps, deps);
    };

    const call = (
        as: InitDataUserFixture,
        method: string,
        path: string,
        body?: unknown
    ) => {
        const headers = new Headers({
            Authorization: `tma ${createSignedInitData({ user: as, authDate: NOW_SECONDS })}`
        });

        if (body !== undefined) {
            headers.set('Content-Type', 'application/json');
        }

        return createTestApp().request(
            `/api/app${path}`,
            {
                method,
                headers,
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            },
            env()
        );
    };

    const fetchPath = (path: string) => {
        return createTestApp().request(
            path,
            { headers: { 'cf-connecting-ip': CLIENT_IP } },
            env()
        );
    };

    const readJson = async <Body>(response: Response) => {
        return (await response.json()) as Body;
    };

    const readErrorCode = async (response: Response) => {
        return (await readJson<ApiErrorBody>(response)).error.code;
    };

    const actions = (name: string) => {
        return events.filter(event => {
            return (
                event.event === 'bot_action_completed' && event.action === name
            );
        });
    };

    const registerUser = async (
        fixture: InitDataUserFixture,
        overrides: Partial<
            Parameters<D1Harness['repositories']['users']['create']>[0]
        > = {}
    ): Promise<UserRecord> => {
        const created = await run(
            harness.repositories.users.create({
                telegramId: fixture.id,
                username: fixture.username ?? null,
                usernameSearchable: true,
                language: 'uk',
                currency: 'UAH',
                createdAt: NOW,
                ...overrides
            })
        );

        assert.ok(created);

        return created;
    };

    const addWish = async (
        userId: number,
        title: string,
        fields: Partial<
            Parameters<
                D1Harness['repositories']['wishes']['createWithFields']
            >[1]
        > = {}
    ): Promise<WishRecord> => {
        const created = await run(
            harness.repositories.wishes.createWithFields(
                userId,
                { currency: 'UAH', title, ...fields },
                nextTime()
            )
        );

        assert.ok(created);

        return created;
    };

    const markGifted = async (wish: WishRecord) => {
        assert.ok(wish.userId);
        assert.equal(
            await run(
                harness.repositories.wishes.softRemove(
                    wish.id,
                    wish.userId,
                    true,
                    nextTime()
                )
            ),
            true
        );
    };

    const markDropped = async (wish: WishRecord) => {
        assert.ok(wish.userId);
        await run(
            harness.repositories.wishes.softRemove(
                wish.id,
                wish.userId,
                false,
                nextTime()
            )
        );
    };

    const addGifted = async (
        userId: number,
        title: string,
        fields: Parameters<typeof addWish>[2] = {}
    ) => {
        const wish = await addWish(userId, title, fields);

        await markGifted(wish);

        return wish;
    };

    const setShowGifted = async (owner: UserRecord, show: boolean) => {
        await run(
            harness.repositories.users.setShowGifted(owner.id, show, NOW)
        );
    };

    const readWishRow = (wishId: number) => {
        return harness.env.DB.prepare(
            'SELECT removed, done, gifted_hidden AS giftedHidden FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{ removed: number; done: number; giftedHidden: number }>();
    };

    const appendImage = async (wish: WishRecord, fileId: string) => {
        assert.ok(wish.userId);
        await run(
            harness.repositories.wishes.appendImage(
                wish.id,
                wish.userId,
                fileId,
                nextTime()
            )
        );
    };

    const imageKey = (fileId: string) => {
        return createHash('sha256').update(fileId).digest('hex');
    };

    const imageHash = async (fileId: string) => {
        return (await sha256Hex(crypto, fileId)).slice(0, 16);
    };

    const hasStoredImage = async (fileId: string) => {
        return (await harness.env.IMAGES.get(imageKey(fileId))) !== null;
    };

    const listOwn = async (offset = 0) => {
        const response = await call(
            OWNER,
            'GET',
            offset === 0 ? '/wishes' : `/wishes?offset=${offset}`
        );

        assert.equal(response.status, 200);

        return readJson<WishListDto>(response);
    };

    const tokenFor = async (query: string) => {
        const response = await call(VIEWER, 'POST', '/search', { query });
        const result = await readJson<SearchResultDto>(response);

        assert.equal(result.status, 'found');
        assert.ok('owner' in result && result.owner.token);

        return result.owner.token;
    };

    const titlesOf = (items: readonly { title: string }[] | undefined) => {
        return (items ?? []).map(item => {
            return item.title;
        });
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        events = [];
        await harness.clearApplicationTables();

        const listed = await harness.env.IMAGES.list();

        await Promise.all(
            listed.objects.map(object => {
                return harness.env.IMAGES.delete(object.key);
            })
        );
    });

    describe('own list', () => {
        it('follows every active wish with gifted ones, newest gift first, across the page boundary', async () => {
            const owner = await registerUser(OWNER);
            const activeCount = APP_PAGE_SIZE - 1;

            for (let index = 0; index < activeCount; index += 1) {
                await addWish(owner.id, `active ${index}`);
            }

            await addGifted(owner.id, 'gifted oldest');
            await addGifted(owner.id, 'gifted middle');
            await addGifted(owner.id, 'gifted newest');
            await markDropped(await addWish(owner.id, 'dropped'));

            const hiddenGifted = await addGifted(owner.id, 'gifted hidden');

            await run(
                harness.repositories.wishes.setGiftedHidden(
                    hiddenGifted.id,
                    owner.id,
                    true
                )
            );

            const first = await listOwn();

            assert.equal(first.items.length, APP_PAGE_SIZE);
            assert.equal(first.total, activeCount);
            assert.equal(first.giftedTotal, 3);
            assert.equal(first.nextOffset, APP_PAGE_SIZE);
            assert.ok(
                first.items.slice(0, activeCount).every(wish => {
                    return wish.gifted === undefined;
                })
            );
            assert.equal(first.items[activeCount]?.title, 'gifted newest');
            assert.equal(first.items[activeCount]?.gifted, true);

            const second = await listOwn(APP_PAGE_SIZE);

            assert.deepEqual(titlesOf(second.items), [
                'gifted middle',
                'gifted oldest'
            ]);
            assert.equal(second.nextOffset, null);
            assert.equal(second.total, activeCount);
        });

        it('applies the price filter to gifted wishes too', async () => {
            const owner = await registerUser(OWNER);

            await addWish(owner.id, 'active cheap', { price: 100 });
            await addWish(owner.id, 'active expensive', { price: 50_000 });
            await addGifted(owner.id, 'gifted cheap', { price: 100 });
            await addGifted(owner.id, 'gifted expensive', { price: 50_000 });

            const page = await run(
                harness.repositories.wishes.listOwnedWithGifted(owner.id, {
                    filter: resolvePriceBounds(
                        EXPENSIVE_FILTER,
                        'UAH',
                        FALLBACK_RATES
                    ),
                    offset: 0,
                    limit: APP_PAGE_SIZE
                })
            );

            assert.deepEqual(titlesOf(page.items), [
                'active expensive',
                'gifted expensive'
            ]);
            assert.equal(page.total, 1);
            assert.equal(page.giftedTotal, 1);
        });

        it('restores a gifted wish idempotently and only for its owner', async () => {
            const owner = await registerUser(OWNER);

            await registerUser(VIEWER);

            const gifted = await addGifted(owner.id, 'Kettle');
            const dropped = await addWish(owner.id, 'Dropped');

            await markDropped(dropped);

            assert.equal(
                await readErrorCode(
                    await call(VIEWER, 'POST', `/wishes/${gifted.id}/restore`)
                ),
                'notFound'
            );
            assert.equal(
                await readErrorCode(
                    await call(OWNER, 'POST', `/wishes/${dropped.id}/restore`)
                ),
                'notFound'
            );

            const restored = await call(
                OWNER,
                'POST',
                `/wishes/${gifted.id}/restore`
            );

            assert.equal(restored.status, 200);

            const body = await readJson<OwnWishDto>(restored);

            assert.equal(body.id, gifted.id);
            assert.equal(body.gifted, undefined);
            assert.deepEqual(await readWishRow(gifted.id), {
                removed: 0,
                done: 0,
                giftedHidden: 0
            });

            const again = await call(
                OWNER,
                'POST',
                `/wishes/${gifted.id}/restore`
            );

            assert.equal(again.status, 200);
            assert.equal(actions('wish_restored').length, 1);
            assert.deepEqual(titlesOf((await listOwn()).items), ['Kettle']);
        });

        it('refuses to restore past the active wish limit', async () => {
            const owner = await registerUser(OWNER);
            const gifted = await addGifted(owner.id, 'One more');

            await seedGeneratedWishes(harness, owner.id, 500);

            const response = await call(
                OWNER,
                'POST',
                `/wishes/${gifted.id}/restore`
            );

            assert.equal(response.status, 409);
            assert.equal(await readErrorCode(response), 'wishLimit');
            assert.equal((await readWishRow(gifted.id))?.removed, 1);
        });

        it('hides a gifted wish for everyone, keeps it gifted for the statistics and can undo', async () => {
            const owner = await registerUser(OWNER);

            await registerUser(VIEWER);

            const gifted = await addGifted(owner.id, 'Scarf');
            const active = await addWish(owner.id, 'Active');
            const path = `/wishes/${gifted.id}/gifted-hidden`;

            assert.equal(
                await readErrorCode(
                    await call(VIEWER, 'PUT', path, { hidden: true })
                ),
                'notFound'
            );
            assert.equal(
                await readErrorCode(
                    await call(
                        OWNER,
                        'PUT',
                        `/wishes/${active.id}/gifted-hidden`,
                        { hidden: true }
                    )
                ),
                'notFound'
            );
            assert.equal(
                (await call(OWNER, 'PUT', path, { hidden: 'yes' })).status,
                422
            );

            assert.equal(
                (await call(OWNER, 'PUT', path, { hidden: true })).status,
                204
            );
            assert.equal(
                (await call(OWNER, 'PUT', path, { hidden: true })).status,
                204
            );
            assert.deepEqual(await readWishRow(gifted.id), {
                removed: 1,
                done: 1,
                giftedHidden: 1
            });
            assert.deepEqual(titlesOf((await listOwn()).items), ['Active']);
            assert.equal((await listOwn()).giftedTotal, 0);
            assert.deepEqual(
                actions('gifted_hidden').map(event => event.result),
                ['on', 'on']
            );

            assert.equal(
                (await call(OWNER, 'PUT', path, { hidden: false })).status,
                204
            );
            assert.deepEqual(titlesOf((await listOwn()).items), [
                'Active',
                'Scarf'
            ]);
        });

        it('stores the share setting and reports it in /me', async () => {
            await registerUser(OWNER);

            const response = await call(OWNER, 'PUT', '/me/show-gifted', {
                show: true
            });

            assert.equal(response.status, 200);
            assert.equal((await readJson<MeDto>(response)).showGifted, true);
            assert.equal(
                (await readJson<MeDto>(await call(OWNER, 'GET', '/me')))
                    .showGifted,
                true
            );
            await call(OWNER, 'PUT', '/me/show-gifted', { show: true });
            assert.deepEqual(
                actions('show_gifted_changed').map(event => event.result),
                ['on']
            );
            assert.equal(
                (await call(OWNER, 'PUT', '/me/show-gifted', {})).status,
                422
            );
        });
    });

    describe('third-party views', () => {
        const seedOwnerWithGifts = async () => {
            const owner = await registerUser(OWNER);

            await registerUser(VIEWER);
            await addWish(owner.id, 'Active wish');
            await addGifted(owner.id, 'Hidden from others', { hidden: true });

            const visible = await addGifted(owner.id, 'Visible gift');
            const giftedHidden = await addGifted(owner.id, 'Hidden for good');

            await run(
                harness.repositories.wishes.setGiftedHidden(
                    giftedHidden.id,
                    owner.id,
                    true
                )
            );

            return { owner, visible };
        };

        it('appends gifted wishes only when the owner allows it, without reserving', async () => {
            const { owner, visible } = await seedOwnerWithGifts();
            const token = await tokenFor(OWNER.username ?? '');
            const listPath = `/lists/${token}/wishes`;
            const off = await readJson<OwnerWishListDto>(
                await call(VIEWER, 'GET', listPath)
            );

            assert.deepEqual(titlesOf(off.items), ['Active wish']);
            assert.equal(off.gifted, undefined);

            await setShowGifted(owner, true);

            const on = await readJson<OwnerWishListDto>(
                await call(VIEWER, 'GET', listPath)
            );

            assert.deepEqual(titlesOf(on.items), ['Active wish']);
            assert.equal(on.total, 1);
            assert.deepEqual(titlesOf(on.gifted), ['Visible gift']);
            assert.equal(on.gifted?.[0]?.gifted, true);
            assert.equal(on.gifted?.[0] && 'givers' in on.gifted[0], false);

            const give = await call(
                VIEWER,
                'POST',
                `/lists/${token}/wishes/${visible.id}/give`
            );

            assert.equal(give.status, 404);
        });

        it('sends gifted wishes with the last page only and caps them', async () => {
            const owner = await registerUser(OWNER);

            await registerUser(VIEWER);
            await setShowGifted(owner, true);
            await seedGeneratedWishes(harness, owner.id, APP_PAGE_SIZE + 1);

            for (
                let index = 0;
                index <= APP_THIRD_PARTY_GIFTED_LIMIT;
                index += 1
            ) {
                await addGifted(owner.id, `gift ${index}`);
            }

            const token = await tokenFor(OWNER.username ?? '');
            const first = await readJson<OwnerWishListDto>(
                await call(VIEWER, 'GET', `/lists/${token}/wishes`)
            );

            assert.equal(first.gifted, undefined);

            const last = await readJson<OwnerWishListDto>(
                await call(
                    VIEWER,
                    'GET',
                    `/lists/${token}/wishes?offset=${APP_PAGE_SIZE}`
                )
            );

            assert.equal(last.nextOffset, null);
            assert.equal(last.gifted?.length, APP_THIRD_PARTY_GIFTED_LIMIT);
            assert.equal(
                last.gifted?.[0]?.title,
                `gift ${APP_THIRD_PARTY_GIFTED_LIMIT}`
            );
        });

        it('adds gifted wishes to a shared link preview with share photo URLs', async () => {
            const { owner } = await seedOwnerWithGifts();
            const photoGift = await addWish(owner.id, 'Photo gift');

            await appendImage(photoGift, 'shared-gift-photo');
            await markGifted(photoGift);

            const share = await run(
                harness.repositories.shares.publish(owner.id, 'Owner', NOW)
            );
            const path = `/shared/${share.publicId}`;
            const off = await readJson<SharedListDto>(
                await call(VIEWER, 'GET', path)
            );

            assert.equal(off.gifted, undefined);

            await setShowGifted(owner, true);

            const on = await readJson<SharedListDto>(
                await call(VIEWER, 'GET', path)
            );

            assert.deepEqual(titlesOf(on.gifted), [
                'Photo gift',
                'Visible gift'
            ]);
            assert.equal(
                on.gifted?.[0]?.images[0]?.url,
                `/img/s/${share.publicId}/${photoGift.id}/0/${await imageHash('shared-gift-photo')}`
            );
        });
    });

    describe('photos', () => {
        const signedAppUrl = async (
            wishId: number,
            fileId: string,
            audience: 'owner' | 'viewer' = 'owner'
        ) => {
            return createSigner({
                botToken: TEST_BOT_TOKEN,
                environment: 'production',
                crypto
            }).buildImageUrl(
                { wishId, index: 0, hash: await imageHash(fileId), audience },
                NOW
            );
        };

        const storeImage = async (fileId: string) => {
            await harness.env.IMAGES.put(imageKey(fileId), 'bytes', {
                httpMetadata: { contentType: 'image/jpeg' }
            });
        };

        it('serves app photos of visible gifted wishes only', async () => {
            const owner = await registerUser(OWNER);
            const gifted = await addWish(owner.id, 'Gifted camera');
            const dropped = await addWish(owner.id, 'Dropped camera');

            await appendImage(gifted, 'gifted-photo');
            await appendImage(dropped, 'dropped-photo');
            await storeImage('gifted-photo');
            await storeImage('dropped-photo');
            await markGifted(gifted);
            await markDropped(dropped);

            const giftedUrl = await signedAppUrl(gifted.id, 'gifted-photo');

            assert.equal((await fetchPath(giftedUrl)).status, 200);
            assert.equal(
                (
                    await fetchPath(
                        await signedAppUrl(dropped.id, 'dropped-photo')
                    )
                ).status,
                404
            );

            await run(
                harness.repositories.wishes.setGiftedHidden(
                    gifted.id,
                    owner.id,
                    true
                )
            );
            assert.equal((await fetchPath(giftedUrl)).status, 404);
        });

        it('serves viewer photo urls only while the wish stays visible to others', async () => {
            const owner = await registerUser(OWNER);
            const gifted = await addWish(owner.id, 'Gifted kettle');
            const active = await addWish(owner.id, 'Active kettle');

            await appendImage(gifted, 'viewer-gift');
            await appendImage(active, 'viewer-active');
            await storeImage('viewer-gift');
            await storeImage('viewer-active');
            await markGifted(gifted);
            await setShowGifted(owner, true);

            const giftedViewerUrl = await signedAppUrl(
                gifted.id,
                'viewer-gift',
                'viewer'
            );
            const giftedOwnerUrl = await signedAppUrl(gifted.id, 'viewer-gift');
            const activeViewerUrl = await signedAppUrl(
                active.id,
                'viewer-active',
                'viewer'
            );
            const activeOwnerUrl = await signedAppUrl(
                active.id,
                'viewer-active'
            );
            const statusOf = async (url: string) => {
                return (await fetchPath(url)).status;
            };

            assert.equal(await statusOf(giftedViewerUrl), 200);
            assert.equal(await statusOf(activeViewerUrl), 200);
            assert.equal(
                await statusOf(giftedViewerUrl.replace('&a=v', '')),
                403
            );

            await setShowGifted(owner, false);
            assert.equal(await statusOf(giftedViewerUrl), 404);
            assert.equal(await statusOf(giftedOwnerUrl), 200);

            await harness.env.DB.prepare(
                'UPDATE wishes SET hidden = 1 WHERE id = ?'
            )
                .bind(active.id)
                .run();
            assert.equal(await statusOf(activeViewerUrl), 404);
            assert.equal(await statusOf(activeOwnerUrl), 200);

            await harness.env.DB.prepare(
                'UPDATE wishes SET hidden = 0 WHERE id = ?'
            )
                .bind(active.id)
                .run();
            assert.equal(await statusOf(activeViewerUrl), 200);
            await harness.env.DB.prepare(
                'UPDATE users SET blocked_at = 1 WHERE id = ?'
            )
                .bind(owner.id)
                .run();
            assert.equal(await statusOf(activeViewerUrl), 404);
        });

        it('serves share photos of gifted wishes only while the owner shows them', async () => {
            const owner = await registerUser(OWNER);
            const gifted = await addWish(owner.id, 'Gifted lamp');

            await appendImage(gifted, 'share-gift');
            await storeImage('share-gift');
            await markGifted(gifted);

            const share = await run(
                harness.repositories.shares.publish(owner.id, 'Owner', NOW)
            );
            const url = `/img/s/${share.publicId}/${gifted.id}/0/${await imageHash('share-gift')}`;

            assert.equal((await fetchPath(url)).status, 404);
            await setShowGifted(owner, true);
            assert.equal((await fetchPath(url)).status, 200);
        });

        it('keeps R2 copies while a gifted wish is visible and releases them once it is hidden', async () => {
            const owner = await registerUser(OWNER);
            const gifted = await addWish(owner.id, 'Gifted');
            const dropped = await addWish(owner.id, 'Dropped');

            await appendImage(gifted, 'keep-while-gifted');
            await appendImage(dropped, 'release-now');
            await storeImage('keep-while-gifted');
            await storeImage('release-now');

            await call(OWNER, 'POST', `/wishes/${gifted.id}/remove`, {
                done: true
            });
            await call(OWNER, 'POST', `/wishes/${dropped.id}/remove`, {
                done: false
            });
            assert.equal(await hasStoredImage('keep-while-gifted'), true);
            assert.equal(await hasStoredImage('release-now'), false);

            await call(OWNER, 'POST', `/wishes/${gifted.id}/restore`);
            assert.equal(await hasStoredImage('keep-while-gifted'), true);

            await call(OWNER, 'POST', `/wishes/${gifted.id}/remove`, {
                done: true
            });
            await call(OWNER, 'PUT', `/wishes/${gifted.id}/gifted-hidden`, {
                hidden: true
            });
            assert.equal(await hasStoredImage('keep-while-gifted'), false);
        });
    });

    describe('share page', () => {
        const fetchSharePage = async (publicId: string) => {
            const response = await createTestApp().request(
                `/ua/w/${publicId}`,
                {},
                env()
            );

            assert.equal(response.status, 200);

            return {
                etag: response.headers.get('ETag'),
                html: await response.text()
            };
        };

        it('appends gifted wishes with the band when the owner allows it, and the fingerprint follows', async () => {
            const owner = await registerUser(OWNER);

            await addWish(owner.id, 'Active book');

            const gifted = await addGifted(owner.id, 'Gifted mug', {
                priorityLevel: 3
            });
            const share = await run(
                harness.repositories.shares.publish(owner.id, 'Owner', NOW)
            );
            const hiddenSetting = await fetchSharePage(share.publicId);

            assert.doesNotMatch(hiddenSetting.html, /Gifted mug/);
            assert.doesNotMatch(hiddenSetting.html, /wish-gifted/);

            await setShowGifted(owner, true);

            const shown = await fetchSharePage(share.publicId);

            assert.notEqual(shown.etag, hiddenSetting.etag);
            assert.match(shown.html, /<li class="wish wish-gifted">/);
            assert.match(shown.html, /data-band="Подароване"/);
            assert.ok(
                shown.html.indexOf('Active book') <
                    shown.html.indexOf('Gifted mug')
            );
            assert.doesNotMatch(
                shown.html.slice(shown.html.indexOf('wish-gifted')),
                /priority-badge/
            );

            await run(
                harness.repositories.wishes.setGiftedHidden(
                    gifted.id,
                    owner.id,
                    true
                )
            );

            const afterHiding = await fetchSharePage(share.publicId);

            assert.notEqual(afterHiding.etag, shown.etag);
            assert.doesNotMatch(afterHiding.html, /Gifted mug/);
        });
    });
});
