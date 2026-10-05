import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { createSigner } from '../../src/api/auth/signing';
import type { UserRecord, WishRecord } from '../../src/db/repositories';
import {
    APP_OWNER_TOKEN_TTL_SECONDS,
    APP_PAGE_SIZE,
    APP_THIRD_PARTY_PAYMENTS_MAX_LENGTH,
    type ApiErrorBody,
    type GiveListDto,
    type OwnerWishListDto,
    type SearchResultDto,
    type SharedListDto,
    type ThirdWishDto
} from '../../src/shared/app-api';
import type { TelemetryFields } from '../../src/worker/telemetry';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const HOUR_MS = 60 * 60 * 1000;
const ADMIN_TELEGRAM_ID = 777_000_111;
const SHARE_ID_PATTERN_LENGTH = 26;

const VIEWER: InitDataUserFixture = {
    id: 111_000_001,
    first_name: 'Viewer',
    username: 'viewer_v'
};
const OWNER_A: InitDataUserFixture = {
    id: 222_000_002,
    first_name: 'Alice',
    username: 'alice_a'
};
const STRANGER: InitDataUserFixture = {
    id: 333_000_003,
    first_name: 'Stranger',
    username: 'stranger_c'
};
const ADMIN: InitDataUserFixture = {
    id: ADMIN_TELEGRAM_ID,
    first_name: 'Admin',
    username: 'admin_user'
};

describe('Mini App API third-party lists, search and gives', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const env = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            ADMIN_ID: String(ADMIN_TELEGRAM_ID),
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const call = (
        as: InitDataUserFixture,
        method: string,
        path: string,
        body?: unknown
    ) => {
        const app = createApp(
            {},
            {},
            {},
            {
                now: () => NOW,
                crypto: createNodeApiCrypto(),
                emitTelemetry: (_env, _context, fields) => {
                    events.push(fields);
                }
            }
        );
        const headers = new Headers({
            Authorization: `tma ${createSignedInitData({ user: as, authDate: NOW_SECONDS })}`
        });

        if (body !== undefined) {
            headers.set('Content-Type', 'application/json');
        }

        return app.request(
            `/api/app${path}`,
            {
                method,
                headers,
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            },
            env()
        );
    };

    const search = async (as: InitDataUserFixture, query: string) => {
        const response = await call(as, 'POST', '/search', { query });

        assert.equal(response.status, 200);

        return (await response.json()) as SearchResultDto;
    };

    const tokenFor = async (as: InitDataUserFixture, query: string) => {
        const result = await search(as, query);

        assert.equal(result.status, 'found');
        assert.ok('owner' in result);
        assert.ok(result.owner.token);

        return result.owner.token;
    };

    const readErrorCode = async (response: Response) => {
        return ((await response.json()) as ApiErrorBody).error.code;
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
                NOW
            )
        );

        assert.ok(created);

        return created;
    };

    const makeUnfindable = async (owner: UserRecord) => {
        await run(
            harness.repositories.users.setVisibility(
                owner.id,
                {
                    usernameSearchable: false,
                    phone: null,
                    phoneDigits: null,
                    username: owner.username
                },
                NOW
            )
        );
    };

    const readSessionState = async (telegramId: number) => {
        return run(harness.repositories.sessions.get(telegramId));
    };

    const eventsNamed = (name: string) => {
        return events.filter(event => {
            return event.event === name;
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
    });

    describe('POST /search', () => {
        it('finds a searchable owner and mints a token only on success', async () => {
            await registerUser(VIEWER);
            await registerUser(OWNER_A, { payments: 'IBAN 1' });
            const result = await search(VIEWER, '@Alice_A');

            assert.equal(result.status, 'found');
            assert.ok('owner' in result);
            assert.equal(result.owner.label, '@Alice_A');
            assert.equal(result.owner.source, 'search');
            assert.equal(result.owner.canGive, true);
            assert.equal(result.owner.payments, 'IBAN 1');
            assert.match(
                result.owner.token ?? '',
                /^[0-9a-z]+\.[0-9a-z]+\.[\w-]{43}$/
            );
        });

        it('answers notFound, tooLong and self without a token', async () => {
            const viewer = await registerUser(VIEWER);

            await registerUser(OWNER_A, { usernameSearchable: false });

            assert.deepEqual(await search(VIEWER, '@nobody'), {
                status: 'notFound'
            });
            assert.deepEqual(await search(VIEWER, '@alice_a'), {
                status: 'notFound'
            });
            assert.deepEqual(await search(VIEWER, 'x'.repeat(65)), {
                status: 'tooLong'
            });
            assert.deepEqual(await search(VIEWER, `@${viewer.username}`), {
                status: 'self'
            });
            assert.deepEqual(
                eventsNamed('bot_action_completed').map(event => {
                    return [event.action, event.result, event.channel];
                }),
                [
                    ['wishlist_searched', 'notFound', 'app'],
                    ['wishlist_searched', 'notFound', 'app'],
                    ['wishlist_searched', 'tooLong', 'app'],
                    ['wishlist_searched', 'self', 'app']
                ]
            );
        });

        it('accepts a 64 character query and rejects an empty or invalid body', async () => {
            await registerUser(VIEWER);

            assert.deepEqual(await search(VIEWER, 'y'.repeat(64)), {
                status: 'notFound'
            });

            const empty = await call(VIEWER, 'POST', '/search', {
                query: '  '
            });

            assert.equal(empty.status, 422);
            assert.equal(await readErrorCode(empty), 'validation');

            const wrongType = await call(VIEWER, 'POST', '/search', {
                query: 5
            });

            assert.equal(wrongType.status, 422);
        });

        it('finds a phone by international, national and local formats and nothing else', async () => {
            await registerUser(VIEWER, { language: 'uk' });
            await registerUser(OWNER_A, {
                phone: '+380501234567',
                phoneDigits: '380501234567'
            });
            const statuses = async (queries: string[]) => {
                return Promise.all(
                    queries.map(async query => {
                        return (await search(VIEWER, query)).status;
                    })
                );
            };

            assert.deepEqual(
                await statuses([
                    '+380501234567',
                    '+38 (050) 123-45-67',
                    '380501234567',
                    '0501234567',
                    '050 123 45 67',
                    '501234567'
                ]),
                ['found', 'found', 'found', 'found', 'found', 'found']
            );
            assert.deepEqual(
                await statuses([
                    '38050123456',
                    '80501234567',
                    '3805012345678',
                    '0501234568',
                    '501234568'
                ]),
                ['notFound', 'notFound', 'notFound', 'notFound', 'notFound']
            );
        });

        it('reads a nine-digit number as Polish for Polish searchers and refuses it for others', async () => {
            await registerUser(OWNER_A, {
                phone: '+48512345678',
                phoneDigits: '48512345678'
            });
            await registerUser(VIEWER, { language: 'pl', currency: 'PLN' });

            assert.equal((await search(VIEWER, '512 345 678')).status, 'found');

            await harness.clearApplicationTables();
            await registerUser(OWNER_A, {
                phone: '+48512345678',
                phoneDigits: '48512345678'
            });
            await registerUser(VIEWER, { language: 'en', currency: 'USD' });

            assert.deepEqual(await search(VIEWER, '512 345 678'), {
                status: 'needsCountryCode'
            });
            assert.equal(
                (await search(VIEWER, '+48 512 345 678')).status,
                'found'
            );
            assert.deepEqual(
                events
                    .filter(event => {
                        return event.action === 'wishlist_searched';
                    })
                    .map(event => {
                        return event.result;
                    }),
                ['found', 'needsCountryCode', 'found']
            );
        });

        it('never matches a phone through letters mixed into a username query', async () => {
            await registerUser(VIEWER, { language: 'uk' });
            await registerUser(OWNER_A, {
                phone: '+380501234567',
                phoneDigits: '380501234567',
                usernameSearchable: false
            });

            assert.deepEqual(await search(VIEWER, 'x380501234567'), {
                status: 'notFound'
            });
        });

        it('lets the admin search themselves and refuses guests', async () => {
            await registerUser(ADMIN);

            const result = await search(ADMIN, '@admin_user');

            assert.equal(result.status, 'found');
            assert.ok('owner' in result);
            assert.ok(result.owner.token);

            const guest = await call(STRANGER, 'POST', '/search', {
                query: '@alice_a'
            });

            assert.equal(guest.status, 403);
            assert.equal(await readErrorCode(guest), 'registrationRequired');
        });

        it('never writes session.find', async () => {
            await registerUser(VIEWER);
            await registerUser(OWNER_A);

            const token = await tokenFor(VIEWER, '@alice_a');

            await call(VIEWER, 'GET', `/lists/${token}/wishes`);

            assert.equal(await readSessionState(VIEWER.id), null);
        });
    });

    describe('GET /lists/:token/wishes', () => {
        it('lists visible wishes with givers, wish currency and truncated payments', async () => {
            const viewer = await registerUser(VIEWER, { currency: 'PLN' });
            const other = await registerUser(STRANGER);
            const owner = await registerUser(OWNER_A, {
                currency: 'EUR',
                payments: 'p'.repeat(APP_THIRD_PARTY_PAYMENTS_MAX_LENGTH + 500)
            });
            const plain = await addWish(owner.id, 'Plain', {
                price: 100,
                currency: 'EUR'
            });
            const taken = await addWish(owner.id, 'Taken', {
                priorityLevel: 3
            });
            const mine = await addWish(owner.id, 'Mine');
            const hidden = await addWish(owner.id, 'Hidden', { hidden: true });
            const removed = await addWish(owner.id, 'Removed');

            await run(
                harness.repositories.wishes.softRemove(
                    removed.id,
                    owner.id,
                    false,
                    NOW
                )
            );
            await run(harness.repositories.gives.add(other.id, taken.id, NOW));
            await run(harness.repositories.gives.add(viewer.id, mine.id, NOW));
            await run(harness.repositories.gives.add(other.id, mine.id, NOW));

            const token = await tokenFor(VIEWER, '@alice_a');
            const response = await call(
                VIEWER,
                'GET',
                `/lists/${token}/wishes`
            );

            assert.equal(response.status, 200);

            const body = (await response.json()) as OwnerWishListDto;
            const byTitle = new Map<string, ThirdWishDto>(
                body.items.map(item => {
                    return [item.title, item];
                })
            );

            assert.equal(body.total, 3);
            assert.equal(body.nextOffset, null);
            assert.deepEqual([...byTitle.keys()].sort(), [
                'Mine',
                'Plain',
                'Taken'
            ]);
            assert.equal(byTitle.has(hidden.title), false);
            assert.equal('hidden' in (byTitle.get('Plain') ?? {}), false);
            assert.deepEqual(byTitle.get('Plain')?.givers, {
                kind: 'none',
                count: 0
            });
            assert.deepEqual(byTitle.get('Taken')?.givers, {
                kind: 'somebody',
                count: 1
            });
            assert.deepEqual(byTitle.get('Mine')?.givers, {
                kind: 'somebodyAndYou',
                count: 1
            });
            assert.equal(plain.price, byTitle.get('Plain')?.price);
            assert.equal(byTitle.get('Plain')?.currency, 'EUR');
            assert.equal('currency' in body.owner, false);
            assert.equal(body.owner.token, token);
            assert.equal(body.owner.label, '@alice_a');
            assert.equal(
                Array.from(body.owner.payments ?? '').length,
                APP_THIRD_PARTY_PAYMENTS_MAX_LENGTH
            );
        });

        it('paginates and filters by price', async () => {
            await registerUser(VIEWER);
            const owner = await registerUser(OWNER_A);

            for (let index = 0; index < APP_PAGE_SIZE + 2; index += 1) {
                await addWish(owner.id, `Wish ${index}`, {
                    price: index === 0 ? 5000 : 10
                });
            }

            const token = await tokenFor(VIEWER, '@alice_a');
            const first = (await (
                await call(VIEWER, 'GET', `/lists/${token}/wishes`)
            ).json()) as OwnerWishListDto;
            const second = (await (
                await call(
                    VIEWER,
                    'GET',
                    `/lists/${token}/wishes?offset=${APP_PAGE_SIZE}`
                )
            ).json()) as OwnerWishListDto;
            const expensive = (await (
                await call(VIEWER, 'GET', `/lists/${token}/wishes?filter=3`)
            ).json()) as OwnerWishListDto;

            assert.equal(first.items.length, APP_PAGE_SIZE);
            assert.equal(first.nextOffset, APP_PAGE_SIZE);
            assert.equal(second.items.length, 2);
            assert.equal(second.nextOffset, null);
            assert.equal(expensive.total, 1);

            const invalid = await call(
                VIEWER,
                'GET',
                `/lists/${token}/wishes?filter=9`
            );

            assert.equal(invalid.status, 422);
        });

        it('filters by the viewer euro ranges converted into the owner hryvnias', async () => {
            await registerUser(VIEWER, { language: 'en', currency: 'EUR' });
            const owner = await registerUser(OWNER_A);

            await addWish(owner.id, 'Below', { price: 980 });
            await addWish(owner.id, 'Edge', { price: 1010 });
            await addWish(owner.id, 'Above', { price: 1011 });

            const token = await tokenFor(VIEWER, '@alice_a');
            const titlesFor = async (filter: number) => {
                const page = (await (
                    await call(
                        VIEWER,
                        'GET',
                        `/lists/${token}/wishes?filter=${filter}`
                    )
                ).json()) as OwnerWishListDto;

                return page.items
                    .map(item => {
                        return item.title;
                    })
                    .sort();
            };

            assert.deepEqual(await titlesFor(0), ['Below', 'Edge']);
            assert.deepEqual(await titlesFor(1), ['Above']);
        });

        it('rejects a token minted for another viewer with 403', async () => {
            await registerUser(VIEWER);
            await registerUser(STRANGER);
            await registerUser(OWNER_A);

            const token = await tokenFor(VIEWER, '@alice_a');
            const response = await call(
                STRANGER,
                'GET',
                `/lists/${token}/wishes`
            );

            assert.equal(response.status, 403);
            assert.equal(await readErrorCode(response), 'tokenInvalid');

            const tampered = await call(
                VIEWER,
                'GET',
                `/lists/${token}x/wishes`
            );

            assert.equal(tampered.status, 403);

            const garbage = await call(VIEWER, 'GET', '/lists/nope/wishes');

            assert.equal(garbage.status, 403);
        });

        it('rejects an expired token with 410', async () => {
            const viewer = await registerUser(VIEWER);
            const owner = await registerUser(OWNER_A);
            const signer = createSigner({
                botToken: TEST_BOT_TOKEN,
                environment: 'production',
                crypto: createNodeApiCrypto()
            });
            const expired = await signer.mintOwnerToken({
                ownerId: owner.id,
                viewerUserId: viewer.id,
                now: new Date(
                    NOW.getTime() -
                        (APP_OWNER_TOKEN_TTL_SECONDS * 1000 + HOUR_MS)
                )
            });
            const response = await call(
                VIEWER,
                'GET',
                `/lists/${expired}/wishes`
            );

            assert.equal(response.status, 410);
            assert.equal(await readErrorCode(response), 'tokenExpired');
        });

        it('answers 404 when the owner stops being findable or is blocked', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A);

            await addWish(owner.id, 'Visible');

            const token = await tokenFor(VIEWER, '@alice_a');

            await makeUnfindable(owner);

            const hiddenOwner = await call(
                VIEWER,
                'GET',
                `/lists/${token}/wishes`
            );

            assert.equal(hiddenOwner.status, 404);
            assert.equal(await readErrorCode(hiddenOwner), 'notFound');
        });

        it('lets only the admin open their own list', async () => {
            const admin = await registerUser(ADMIN);

            await addWish(admin.id, 'Mine');

            const token = await tokenFor(ADMIN, '@admin_user');
            const response = await call(ADMIN, 'GET', `/lists/${token}/wishes`);

            assert.equal(response.status, 200);
            assert.equal(
                ((await response.json()) as OwnerWishListDto).total,
                1
            );
        });
    });

    describe('POST /lists/:token/wishes/:wishId/give', () => {
        it('gives, shows in the give list with other givers, and takes back', async () => {
            await registerUser(VIEWER);
            const other = await registerUser(STRANGER);
            const owner = await registerUser(OWNER_A, { currency: 'EUR' });
            const wish = await addWish(owner.id, 'Gift', {
                price: 25,
                currency: 'EUR'
            });

            await run(harness.repositories.gives.add(other.id, wish.id, NOW));

            const token = await tokenFor(VIEWER, '@alice_a');
            const given = await call(
                VIEWER,
                'POST',
                `/lists/${token}/wishes/${wish.id}/give`
            );

            assert.equal(given.status, 200);
            assert.deepEqual(((await given.json()) as ThirdWishDto).givers, {
                kind: 'somebodyAndYou',
                count: 1
            });

            const again = await call(
                VIEWER,
                'POST',
                `/lists/${token}/wishes/${wish.id}/give`
            );

            assert.equal(again.status, 200);
            assert.deepEqual(
                eventsNamed('bot_action_completed').map(event => {
                    return [event.action, event.channel];
                }),
                [
                    ['wishlist_searched', 'app'],
                    ['give_added', 'app']
                ]
            );

            const list = (await (
                await call(VIEWER, 'GET', '/gives')
            ).json()) as GiveListDto;

            assert.equal(list.total, 1);
            assert.equal(list.nextOffset, null);
            assert.equal(list.items[0]?.wish.id, wish.id);
            assert.equal(list.items[0]?.wish.currency, 'EUR');
            assert.equal(list.items[0]?.ownerUsername, 'alice_a');
            assert.equal(list.items[0]?.otherGivers, 1);
            assert.equal('givers' in (list.items[0]?.wish ?? {}), false);

            const taken = await call(VIEWER, 'DELETE', `/gives/${wish.id}`);

            assert.equal(taken.status, 204);
            assert.equal(await taken.text(), '');

            const takenAgain = await call(
                VIEWER,
                'DELETE',
                `/gives/${wish.id}`
            );

            assert.equal(takenAgain.status, 204);
            assert.equal(await takenAgain.text(), '');
            assert.equal(
                (
                    (await (
                        await call(VIEWER, 'GET', '/gives')
                    ).json()) as GiveListDto
                ).total,
                0
            );
        });

        it('rejects hidden, removed, other-owner and unknown wishes with 404', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A);
            const another = await registerUser(STRANGER);
            const hidden = await addWish(owner.id, 'Hidden', { hidden: true });
            const removed = await addWish(owner.id, 'Removed');
            const foreign = await addWish(another.id, 'Foreign');

            await run(
                harness.repositories.wishes.softRemove(
                    removed.id,
                    owner.id,
                    false,
                    NOW
                )
            );

            const token = await tokenFor(VIEWER, '@alice_a');

            for (const wishId of [hidden.id, removed.id, foreign.id, 999_999]) {
                const response = await call(
                    VIEWER,
                    'POST',
                    `/lists/${token}/wishes/${wishId}/give`
                );

                assert.equal(response.status, 404, String(wishId));
                assert.equal(await readErrorCode(response), 'notFound');
            }

            const malformed = await call(
                VIEWER,
                'POST',
                `/lists/${token}/wishes/abc/give`
            );

            assert.equal(malformed.status, 404);
            assert.equal(
                (
                    (await (
                        await call(VIEWER, 'GET', '/gives')
                    ).json()) as GiveListDto
                ).total,
                0
            );
        });

        it('rejects a wish of an owner who stopped being findable', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A);
            const wish = await addWish(owner.id, 'Gift');
            const token = await tokenFor(VIEWER, '@alice_a');

            await makeUnfindable(owner);

            const response = await call(
                VIEWER,
                'POST',
                `/lists/${token}/wishes/${wish.id}/give`
            );

            assert.equal(response.status, 404);
            assert.equal(
                (
                    (await (
                        await call(VIEWER, 'GET', '/gives')
                    ).json()) as GiveListDto
                ).total,
                0
            );
        });

        it('rejects giving to your own wish with 409 even for the admin', async () => {
            const admin = await registerUser(ADMIN);
            const wish = await addWish(admin.id, 'Own');
            const token = await tokenFor(ADMIN, '@admin_user');
            const response = await call(
                ADMIN,
                'POST',
                `/lists/${token}/wishes/${wish.id}/give`
            );

            assert.equal(response.status, 409);
            assert.equal(await readErrorCode(response), 'ownWish');
        });

        it('rejects a foreign or expired token', async () => {
            await registerUser(VIEWER);
            await registerUser(STRANGER);

            const owner = await registerUser(OWNER_A);
            const wish = await addWish(owner.id, 'Gift');
            const token = await tokenFor(VIEWER, '@alice_a');
            const foreign = await call(
                STRANGER,
                'POST',
                `/lists/${token}/wishes/${wish.id}/give`
            );

            assert.equal(foreign.status, 403);
            assert.equal(await readErrorCode(foreign), 'tokenInvalid');
        });
    });

    describe('gives list', () => {
        it('paginates, cleans and omits owners that are no longer findable', async () => {
            const viewer = await registerUser(VIEWER);
            const owner = await registerUser(OWNER_A);
            const hiddenOwner = await registerUser(STRANGER, {
                usernameSearchable: false
            });
            const wishes: WishRecord[] = [];

            for (let index = 0; index < APP_PAGE_SIZE + 1; index += 1) {
                wishes.push(await addWish(owner.id, `Gift ${index}`));
            }

            const lost = await addWish(hiddenOwner.id, 'Lost');

            for (const wish of [...wishes, lost]) {
                await run(
                    harness.repositories.gives.add(viewer.id, wish.id, NOW)
                );
            }

            const first = (await (
                await call(VIEWER, 'GET', '/gives')
            ).json()) as GiveListDto;
            const second = (await (
                await call(VIEWER, 'GET', `/gives?offset=${APP_PAGE_SIZE}`)
            ).json()) as GiveListDto;

            assert.equal(first.total, APP_PAGE_SIZE + 1);
            assert.equal(first.items.length, APP_PAGE_SIZE);
            assert.equal(first.nextOffset, APP_PAGE_SIZE);
            assert.equal(second.items.length, 1);
            assert.equal(second.nextOffset, null);
            assert.equal(first.items[0]?.otherGivers, 0);

            const cleaned = await call(VIEWER, 'POST', '/gives/clean');

            assert.equal(cleaned.status, 200);
            assert.deepEqual(await cleaned.json(), {
                removed: APP_PAGE_SIZE + 2
            });
            assert.equal(
                (
                    (await (
                        await call(VIEWER, 'GET', '/gives')
                    ).json()) as GiveListDto
                ).total,
                0
            );
            assert.equal(
                eventsNamed('bot_action_completed').at(-1)?.action,
                'give_list_cleaned'
            );
        });

        it('does not let one user remove another user give', async () => {
            const viewer = await registerUser(VIEWER);

            await registerUser(STRANGER);

            const owner = await registerUser(OWNER_A);
            const wish = await addWish(owner.id, 'Gift');

            await run(harness.repositories.gives.add(viewer.id, wish.id, NOW));

            const response = await call(
                STRANGER,
                'DELETE',
                `/gives/${wish.id}`
            );

            assert.equal(response.status, 204);
            assert.equal(
                (
                    (await (
                        await call(VIEWER, 'GET', '/gives')
                    ).json()) as GiveListDto
                ).total,
                1
            );
        });
    });

    describe('GET /shared/:publicId', () => {
        const publish = async (userId: number, displayName: string | null) => {
            const share = await run(
                harness.repositories.shares.publish(userId, displayName, NOW)
            );

            assert.equal(share.publicId.length, SHARE_ID_PATTERN_LENGTH);

            return share;
        };

        it('mints a token for a findable owner and labels with the display name', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A, { payments: 'IBAN 2' });
            const wish = await addWish(owner.id, 'Shared gift');
            const share = await publish(owner.id, 'Alice Liddell');
            const response = await call(
                VIEWER,
                'GET',
                `/shared/${share.publicId}`
            );

            assert.equal(response.status, 200);

            const { owner: dto } = (await response.json()) as SharedListDto;

            assert.equal(dto.label, 'Alice Liddell');
            assert.equal(dto.source, 'share');
            assert.equal(dto.canGive, true);
            assert.equal(dto.payments, 'IBAN 2');
            assert.ok(dto.token);

            const list = (await (
                await call(VIEWER, 'GET', `/lists/${dto.token}/wishes`)
            ).json()) as OwnerWishListDto;

            assert.equal(list.items[0]?.id, wish.id);

            const given = await call(
                VIEWER,
                'POST',
                `/lists/${dto.token}/wishes/${wish.id}/give`
            );

            assert.equal(given.status, 200);
        });

        it('previews the visible wishes with share image urls and no givers', async () => {
            const viewer = await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A);
            const plain = await addWish(owner.id, 'Plain');
            const photo = await addWish(owner.id, 'Photo', {
                priorityLevel: 3
            });
            const hidden = await addWish(owner.id, 'Hidden', { hidden: true });
            const removed = await addWish(owner.id, 'Removed');

            await run(
                harness.repositories.wishes.softRemove(
                    removed.id,
                    owner.id,
                    false,
                    NOW
                )
            );
            await run(
                harness.repositories.wishes.appendImage(
                    photo.id,
                    owner.id,
                    'file-id-1',
                    NOW
                )
            );
            await run(harness.repositories.gives.add(viewer.id, plain.id, NOW));

            const share = await publish(owner.id, 'Alice Liddell');
            const response = await call(
                VIEWER,
                'GET',
                `/shared/${share.publicId}`
            );
            const { preview } = (await response.json()) as SharedListDto;

            assert.ok(preview);
            assert.equal(preview.total, 2);
            assert.equal(preview.nextOffset, null);
            assert.deepEqual(
                preview.items.map(item => {
                    return item.title;
                }),
                ['Photo', 'Plain']
            );
            assert.equal(
                preview.items.some(item => {
                    return item.id === hidden.id || 'givers' in item;
                }),
                false
            );

            const [image] = preview.items[0]?.images ?? [];

            assert.ok(image);
            assert.equal(
                image.url,
                `/img/s/${share.publicId}/${photo.id}/0/${image.hash}`
            );
        });

        it('pages the preview with offset and keeps it when the owner is not findable', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A, {
                usernameSearchable: false
            });

            for (let index = 0; index <= APP_PAGE_SIZE; index += 1) {
                await addWish(owner.id, `Wish ${index}`);
            }

            const share = await publish(owner.id, 'Alice Liddell');
            const path = `/shared/${share.publicId}`;
            const first = (await (
                await call(VIEWER, 'GET', path)
            ).json()) as SharedListDto;
            const second = (await (
                await call(VIEWER, 'GET', `${path}?offset=${APP_PAGE_SIZE}`)
            ).json()) as SharedListDto;

            assert.equal(first.owner.token, null);
            assert.equal(first.preview?.items.length, APP_PAGE_SIZE);
            assert.equal(first.preview?.total, APP_PAGE_SIZE + 1);
            assert.equal(second.preview?.items.length, 1);
            assert.equal(first.preview?.nextOffset, APP_PAGE_SIZE);
            assert.equal(second.preview?.nextOffset, null);
            assert.equal(
                (await call(VIEWER, 'GET', `${path}?offset=-1`)).status,
                422
            );
        });

        it('adds the username only when the owner switched it on and is searchable', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A);
            const share = await publish(owner.id, 'Alice Liddell');
            const label = async () => {
                const response = await call(
                    VIEWER,
                    'GET',
                    `/shared/${share.publicId}`
                );

                return ((await response.json()) as SharedListDto).owner.label;
            };

            assert.equal(await label(), 'Alice Liddell');

            await run(
                harness.repositories.shares.setShowUsername(owner.id, true, NOW)
            );

            assert.equal(await label(), 'Alice Liddell (@alice_a)');

            await run(
                harness.repositories.users.setVisibility(
                    owner.id,
                    {
                        usernameSearchable: false,
                        phone: '+380501112233',
                        phoneDigits: '380501112233',
                        username: owner.username
                    },
                    NOW
                )
            );

            assert.equal(await label(), 'Alice Liddell');
        });

        it('returns a null token and no give rights for a non-findable owner', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A, {
                usernameSearchable: false
            });
            const share = await publish(owner.id, 'Alice Liddell');
            const response = await call(
                VIEWER,
                'GET',
                `/shared/${share.publicId}`
            );

            assert.equal(response.status, 200);

            const { owner: dto } = (await response.json()) as SharedListDto;

            assert.equal(dto.token, null);
            assert.equal(dto.canGive, false);
            assert.equal(dto.label, 'Alice Liddell');
        });

        it('flags a non-admin opening their own share and leaks no reservations', async () => {
            const viewer = await registerUser(VIEWER);
            const giver = await registerUser(STRANGER);
            const wish = await addWish(viewer.id, 'Mine');
            const share = await publish(viewer.id, 'Viewer');

            await run(harness.repositories.gives.add(giver.id, wish.id, NOW));

            const response = await call(
                VIEWER,
                'GET',
                `/shared/${share.publicId}`
            );
            const dto = (await response.json()) as SharedListDto;

            assert.equal(dto.owner.token, null);
            assert.equal(dto.ownList, true);
            assert.doesNotMatch(JSON.stringify(dto), /givers/);
        });

        it('keeps the third-party view for the admin opening their own share', async () => {
            const admin = await registerUser(ADMIN);
            const share = await publish(admin.id, 'Admin');
            const dto = (await (
                await call(ADMIN, 'GET', `/shared/${share.publicId}`)
            ).json()) as SharedListDto;

            assert.equal(dto.ownList, false);
            assert.ok(dto.owner.token);
        });

        it('does not flag other people share pages as the viewer own list', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A, {
                usernameSearchable: false
            });
            const share = await publish(owner.id, 'Alice Liddell');
            const dto = (await (
                await call(VIEWER, 'GET', `/shared/${share.publicId}`)
            ).json()) as SharedListDto;

            assert.equal(dto.ownList, false);
        });

        it('answers 410 for a revoked share and 404 for unknown, malformed and blocked', async () => {
            await registerUser(VIEWER);

            const owner = await registerUser(OWNER_A);
            const share = await publish(owner.id, 'Alice Liddell');
            const path = `/shared/${share.publicId}`;

            assert.equal((await call(VIEWER, 'GET', path)).status, 200);
            assert.equal(
                (
                    await call(
                        VIEWER,
                        'GET',
                        `/shared/${share.publicId.toUpperCase()}`
                    )
                ).status,
                200
            );

            const unknown = await call(
                VIEWER,
                'GET',
                `/shared/${'0'.repeat(SHARE_ID_PATTERN_LENGTH)}`
            );

            assert.equal(unknown.status, 404);
            assert.equal(
                (await call(VIEWER, 'GET', '/shared/not-an-id')).status,
                404
            );

            await run(
                harness.repositories.users.markBlockedByTelegramId(
                    owner.telegramId,
                    NOW
                )
            );

            assert.equal((await call(VIEWER, 'GET', path)).status, 404);

            await run(harness.repositories.users.clearBlocked(owner.id));
            await run(harness.repositories.shares.revoke(owner.id, NOW));

            const revoked = await call(VIEWER, 'GET', path);

            assert.equal(revoked.status, 410);
            assert.equal(await readErrorCode(revoked), 'shareGone');
        });
    });
});
