import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { createWishService } from '../../src/bot/services/wish-service';
import {
    APP_PAGE_SIZE,
    type ApiErrorBody,
    type OwnWishDto,
    type RemovedCountDto,
    type WishFilterDto,
    type WishListDto
} from '../../src/shared/app-api';
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
const OWNER_TELEGRAM_ID = 910_000_001;
const STRANGER_TELEGRAM_ID = 910_000_002;
const GUEST_TELEGRAM_ID = 910_000_003;

const OWNER: InitDataUserFixture = {
    id: OWNER_TELEGRAM_ID,
    first_name: 'Owner',
    username: 'wish_owner',
    language_code: 'en'
};
const STRANGER: InitDataUserFixture = {
    id: STRANGER_TELEGRAM_ID,
    first_name: 'Stranger',
    username: 'wish_stranger',
    language_code: 'en'
};
const GUEST: InitDataUserFixture = {
    id: GUEST_TELEGRAM_ID,
    first_name: 'Guest',
    language_code: 'en'
};

interface CallOptions {
    as?: InitDataUserFixture;
    body?: unknown;
    rawBody?: string;
    contentType?: string | null;
}

describe('Mini App API own wishes', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const buildEnv = () => {
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

    const call = (method: string, path: string, options: CallOptions = {}) => {
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
            Authorization: `tma ${createSignedInitData({
                user: options.as ?? OWNER,
                authDate: NOW_SECONDS
            })}`
        });
        const hasBody =
            options.body !== undefined || options.rawBody !== undefined;

        if (hasBody && options.contentType !== null) {
            headers.set(
                'Content-Type',
                options.contentType ?? 'application/json'
            );
        }

        return app.request(
            `/api/app${path}`,
            {
                method,
                headers,
                ...(hasBody
                    ? { body: options.rawBody ?? JSON.stringify(options.body) }
                    : {})
            },
            buildEnv()
        );
    };

    const readJson = async <Body>(response: Response) => {
        return (await response.json()) as Body;
    };

    const readError = async (response: Response) => {
        return (await readJson<ApiErrorBody>(response)).error;
    };

    const actionEvents = () => {
        return events.filter(event => {
            return event.event === 'bot_action_completed';
        });
    };

    const createUser = async (fixture: InitDataUserFixture) => {
        const created = await run(
            harness.repositories.users.create({
                telegramId: fixture.id,
                username: fixture.username ?? null,
                usernameSearchable: true,
                createdAt: NOW
            })
        );

        assert.ok(created);

        return created;
    };

    const createWish = async (userId: number, title = 'Kettle') => {
        const created = await run(
            harness.repositories.wishes.create(userId, title, 'UAH', NOW)
        );

        assert.ok(created);

        return created;
    };

    const seedSession = (telegramId: number, state: object) => {
        return run(
            harness.repositories.sessions.saveState(
                telegramId,
                { v: 1, find: null, ...state },
                NOW
            )
        );
    };

    const readSessionState = async (telegramId: number) => {
        const session = await run(
            harness.repositories.sessions.get(telegramId)
        );

        assert.ok(session);

        return JSON.parse(session.state) as {
            pendingInput: unknown;
            album?: unknown;
        };
    };

    const wishFieldPending = (wishId: number) => {
        return { kind: 'wishField', wishId, field: 'images' };
    };

    const readWishRow = async (wishId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT removed, done, priority, hidden FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{
                removed: number;
                done: number;
                priority: number;
                hidden: number;
            }>();

        assert.ok(row);

        return row;
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

    describe('access', () => {
        it('rejects guests with registrationRequired on every route', async () => {
            const calls: [string, string, object?][] = [
                ['GET', '/wishes'],
                ['PUT', '/wishes/filter', { filter: 1 }],
                ['POST', '/wishes', { title: 'x' }],
                ['GET', '/wishes/1'],
                ['PATCH', '/wishes/1', { priority: true }],
                ['POST', '/wishes/1/remove', { done: true }],
                ['POST', '/wishes/clean']
            ];

            for (const [method, path, body] of calls) {
                const response = await call(method, path, {
                    as: GUEST,
                    ...(body === undefined ? {} : { body })
                });

                assert.equal(response.status, 403, `${method} ${path}`);
                assert.equal(
                    (await readError(response)).code,
                    'registrationRequired'
                );
            }
        });
    });

    describe('create and read', () => {
        it('creates a wish with every field and returns the DTO', async () => {
            await createUser(OWNER);

            const response = await call('POST', '/wishes', {
                body: {
                    title: '  Red kettle  ',
                    description: 'Electric, 1.7 l',
                    link: 'https://www.example.com/kettle',
                    price: '1 500',
                    priority: true,
                    hidden: true
                }
            });

            assert.equal(response.status, 201);

            const wish = await readJson<OwnWishDto>(response);

            assert.equal(wish.title, 'Red kettle');
            assert.equal(wish.description, 'Electric, 1.7 l');
            assert.equal(wish.link, 'https://www.example.com/kettle');
            assert.equal(wish.linkHost, 'example.com');
            assert.equal(wish.price, 1500);
            assert.equal(wish.priority, 'high');
            assert.equal(wish.hidden, true);
            assert.deepEqual(wish.images, []);
            assert.equal(wish.createdAt, NOW.toISOString());

            const fetched = await call('GET', `/wishes/${wish.id}`);

            assert.equal(fetched.status, 200);
            assert.deepEqual(await readJson<OwnWishDto>(fetched), wish);
        });

        it('defaults omitted fields and accepts numeric and null prices', async () => {
            await createUser(OWNER);

            const minimal = await readJson<OwnWishDto>(
                await call('POST', '/wishes', { body: { title: 'Only title' } })
            );

            assert.equal(minimal.description, null);
            assert.equal(minimal.link, null);
            assert.equal(minimal.linkHost, null);
            assert.equal(minimal.price, 0);
            assert.equal(minimal.priority, 'none');
            assert.equal(minimal.hidden, false);

            const numeric = await readJson<OwnWishDto>(
                await call('POST', '/wishes', {
                    body: { title: 'Numeric', price: 2500.4, description: '' }
                })
            );
            const nulled = await readJson<OwnWishDto>(
                await call('POST', '/wishes', {
                    body: { title: 'Null', price: null, link: null }
                })
            );

            assert.equal(numeric.price, 2500);
            assert.equal(numeric.description, null);
            assert.equal(nulled.price, 0);
            assert.equal(nulled.link, null);
        });

        it('parses links and prices with the bot rules', async () => {
            await createUser(OWNER);

            const wish = await readJson<OwnWishDto>(
                await call('POST', '/wishes', {
                    body: {
                        title: 'Parsed',
                        link: 'see https://example.com/a?b=1 now',
                        price: '1.500 uah'
                    }
                })
            );

            assert.equal(wish.link, 'https://example.com/a?b=1');
            assert.equal(wish.price, 1500);
        });

        it('mints signed image references for stored photos', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);

            await harness.env.DB.prepare(
                'UPDATE wishes SET images = ? WHERE id = ?'
            )
                .bind(JSON.stringify(['file-a', 'file-b']), wish.id)
                .run();

            const body = await readJson<OwnWishDto>(
                await call('GET', `/wishes/${wish.id}`)
            );

            assert.equal(body.images.length, 2);

            body.images.forEach((image, index) => {
                assert.equal(image.hash.length, 16);
                assert.ok(
                    image.url.startsWith(
                        `/img/w/${wish.id}/${index}/${image.hash}?`
                    ),
                    image.url
                );
            });
        });

        it('answers 404 for unknown, malformed and removed wish ids', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);

            await run(
                harness.repositories.wishes.softRemove(
                    wish.id,
                    owner.id,
                    false,
                    NOW
                )
            );

            for (const id of ['999999', 'abc', '0', '-1', String(wish.id)]) {
                const response = await call('GET', `/wishes/${id}`);

                assert.equal(response.status, 404, id);
                assert.equal((await readError(response)).code, 'notFound');
            }
        });
    });

    describe('per-field validation', () => {
        const expectFields = async (
            method: string,
            path: string,
            body: unknown,
            fields: Record<string, string>
        ) => {
            const response = await call(method, path, { body });

            assert.equal(response.status, 422, JSON.stringify(body));

            const error = await readError(response);

            assert.equal(error.code, 'validation');
            assert.deepEqual(error.fields, fields);
        };

        it('reports one code per invalid field on create', async () => {
            await createUser(OWNER);

            const cases: [unknown, Record<string, string>][] = [
                [{}, { title: 'required' }],
                [{ title: 5 }, { title: 'invalid' }],
                [{ title: '   ' }, { title: 'empty' }],
                [{ title: 'a'.repeat(201) }, { title: 'tooLong' }],
                [{ title: 'look at HTTP://x.io' }, { title: 'containsLink' }],
                [
                    { title: 'ok', description: 'd'.repeat(501) },
                    { description: 'tooLong' }
                ],
                [{ title: 'ok', description: 7 }, { description: 'invalid' }],
                [{ title: 'ok', link: 'not a link' }, { link: 'invalid' }],
                [{ title: 'ok', link: 'ftp://x.io/file' }, { link: 'invalid' }],
                [{ title: 'ok', price: 'free' }, { price: 'invalid' }],
                [{ title: 'ok', price: -5 }, { price: 'invalid' }],
                [{ title: 'ok', price: 1e21 }, { price: 'invalid' }],
                [{ title: 'ok', price: true }, { price: 'invalid' }],
                [{ title: 'ok', priority: 'yes' }, { priority: 'invalid' }],
                [{ title: 'ok', hidden: 1 }, { hidden: 'invalid' }]
            ];

            for (const [body, fields] of cases) {
                await expectFields('POST', '/wishes', body, fields);
            }
        });

        it('collects several field errors in one response', async () => {
            await createUser(OWNER);

            await expectFields(
                'POST',
                '/wishes',
                {
                    title: 'http://x.io',
                    price: 'abc',
                    link: 'nope',
                    priority: 'x'
                },
                {
                    title: 'containsLink',
                    price: 'invalid',
                    link: 'invalid',
                    priority: 'invalid'
                }
            );
            assert.equal(
                await harness.env.DB.prepare('SELECT count(*) AS n FROM wishes')
                    .first<{ n: number }>()
                    .then(row => row?.n),
                0
            );
        });

        it('rejects non-object and non-json bodies', async () => {
            await createUser(OWNER);

            await expectFields('POST', '/wishes', ['x'], { body: 'invalid' });

            const malformed = await call('POST', '/wishes', {
                rawBody: '{oops'
            });

            assert.equal(malformed.status, 422);

            const noType = await call('POST', '/wishes', {
                body: { title: 'x' },
                contentType: null
            });

            assert.equal(noType.status, 415);
        });

        it('validates patch fields with the same codes and no required title', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);
            const path = `/wishes/${wish.id}`;

            await expectFields(
                'PATCH',
                path,
                { title: null },
                { title: 'invalid' }
            );
            await expectFields(
                'PATCH',
                path,
                { title: ' ' },
                { title: 'empty' }
            );
            await expectFields(
                'PATCH',
                path,
                { title: 'https://x.io', price: 'no' },
                { title: 'containsLink', price: 'invalid' }
            );
            await expectFields(
                'PATCH',
                path,
                { hidden: null },
                { hidden: 'invalid' }
            );
        });
    });

    describe('update', () => {
        it('updates fields and supports removal semantics', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id, 'Old title');
            const path = `/wishes/${wish.id}`;

            const updated = await readJson<OwnWishDto>(
                await call('PATCH', path, {
                    body: {
                        title: 'New title',
                        description: 'Details',
                        link: 'https://example.com/x',
                        price: 4200
                    }
                })
            );

            assert.equal(updated.title, 'New title');
            assert.equal(updated.description, 'Details');
            assert.equal(updated.link, 'https://example.com/x');
            assert.equal(updated.price, 4200);

            const partial = await readJson<OwnWishDto>(
                await call('PATCH', path, { body: { price: '10 000' } })
            );

            assert.equal(partial.price, 10_000);
            assert.equal(partial.title, 'New title');
            assert.equal(partial.description, 'Details');

            const cleared = await readJson<OwnWishDto>(
                await call('PATCH', path, {
                    body: { description: null, link: '', price: null }
                })
            );

            assert.equal(cleared.description, null);
            assert.equal(cleared.link, null);
            assert.equal(cleared.price, 0);
            assert.equal(cleared.title, 'New title');
        });

        it('sets explicit flags instead of toggling', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);
            const path = `/wishes/${wish.id}`;
            const patch = async (body: object) => {
                return readJson<OwnWishDto>(
                    await call('PATCH', path, { body })
                );
            };

            assert.equal((await patch({ priority: true })).priority, 'high');
            assert.equal((await patch({ priority: true })).priority, 'high');
            assert.equal((await patch({ hidden: true })).hidden, true);

            const both = await patch({ priority: false, hidden: true });

            assert.equal(both.priority, 'none');
            assert.equal(both.hidden, true);

            const unhidden = await patch({ hidden: false });

            assert.equal(unhidden.hidden, false);
            assert.equal(unhidden.priority, 'none');
            assert.deepEqual(await readWishRow(wish.id), {
                removed: 0,
                done: 0,
                priority: 0,
                hidden: 0
            });
        });

        it('applies fields and flags together and returns the wish for an empty patch', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id, 'Before');
            const path = `/wishes/${wish.id}`;

            const combined = await readJson<OwnWishDto>(
                await call('PATCH', path, {
                    body: { title: 'After', priority: true }
                })
            );

            assert.equal(combined.title, 'After');
            assert.equal(combined.priority, 'high');

            const empty = await call('PATCH', path, { body: {} });

            assert.equal(empty.status, 200);
            assert.deepEqual(await readJson<OwnWishDto>(empty), combined);
        });

        it('answers 404 when the wish is missing or removed', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);

            await run(
                harness.repositories.wishes.softRemove(
                    wish.id,
                    owner.id,
                    true,
                    NOW
                )
            );

            for (const body of [{ title: 'x' }, { priority: true }, {}]) {
                const response = await call('PATCH', `/wishes/${wish.id}`, {
                    body
                });

                assert.equal(response.status, 404, JSON.stringify(body));
            }
        });
    });

    describe('IDOR', () => {
        it('hides another user wish behind 404 for GET, PATCH and remove', async () => {
            const owner = await createUser(OWNER);
            await createUser(STRANGER);

            const wish = await createWish(owner.id, 'Secret');
            const path = `/wishes/${wish.id}`;
            const attempts: [string, string, object?][] = [
                ['GET', path],
                ['PATCH', path, { title: 'Hijacked', priority: true }],
                ['POST', `${path}/remove`, { done: true }]
            ];

            for (const [method, target, body] of attempts) {
                const response = await call(method, target, {
                    as: STRANGER,
                    ...(body === undefined ? {} : { body })
                });

                assert.equal(response.status, 404, `${method} ${target}`);
                assert.equal((await readError(response)).code, 'notFound');
            }

            const intact = await readJson<OwnWishDto>(await call('GET', path));

            assert.equal(intact.title, 'Secret');
            assert.equal(intact.priority, 'none');
            assert.equal((await readWishRow(wish.id)).removed, 0);
        });

        it('lists only the caller wishes', async () => {
            const owner = await createUser(OWNER);
            const stranger = await createUser(STRANGER);

            await createWish(owner.id, 'Mine');
            await createWish(stranger.id, 'Theirs');

            const list = await readJson<WishListDto>(
                await call('GET', '/wishes')
            );

            assert.deepEqual(
                list.items.map(item => {
                    return item.title;
                }),
                ['Mine']
            );
        });
    });

    describe('list and filter', () => {
        it('paginates with the app page size and orders priority first', async () => {
            const owner = await createUser(OWNER);

            await seedGeneratedWishes(harness, owner.id, 25);

            const flagged = await createWish(owner.id, 'Prioritised');

            await run(
                harness.repositories.wishes.setFlags(
                    flagged.id,
                    owner.id,
                    { priorityLevel: 3 },
                    NOW
                )
            );

            const first = await readJson<WishListDto>(
                await call('GET', '/wishes')
            );

            assert.equal(first.items.length, APP_PAGE_SIZE);
            assert.equal(first.total, 26);
            assert.equal(first.nextOffset, APP_PAGE_SIZE);
            assert.equal(first.filter, null);
            assert.equal(first.items[0]?.title, 'Prioritised');

            const second = await readJson<WishListDto>(
                await call('GET', `/wishes?offset=${APP_PAGE_SIZE}`)
            );

            assert.equal(second.items.length, 6);
            assert.equal(second.nextOffset, null);

            const beyond = await readJson<WishListDto>(
                await call('GET', '/wishes?offset=500')
            );

            assert.deepEqual(beyond.items, []);
            assert.equal(beyond.nextOffset, null);

            for (const offset of ['-1', 'x', '1.5']) {
                const response = await call('GET', `/wishes?offset=${offset}`);

                assert.equal(response.status, 422, offset);
            }
        });

        it('persists the filter in users.wishlistFilter and applies it to the list', async () => {
            const owner = await createUser(OWNER);
            const cheap = await createWish(owner.id, 'Cheap');
            const pricey = await createWish(owner.id, 'Pricey');

            await run(
                harness.repositories.wishes.updateFields(
                    cheap.id,
                    owner.id,
                    { price: 500 },
                    NOW
                )
            );
            await run(
                harness.repositories.wishes.updateFields(
                    pricey.id,
                    owner.id,
                    { price: 20_000 },
                    NOW
                )
            );

            const set = await call('PUT', '/wishes/filter', {
                body: { filter: 4 }
            });

            assert.equal(set.status, 200);
            assert.deepEqual(await readJson<WishFilterDto>(set), { filter: 4 });

            const stored = await run(
                harness.repositories.users.findByTelegramId(OWNER_TELEGRAM_ID)
            );

            assert.ok(stored);
            assert.equal(stored.wishlistFilter, 4);
            assert.equal(
                createWishService(harness.repositories).getOwnerFilter(stored),
                4
            );

            const filtered = await readJson<WishListDto>(
                await call('GET', '/wishes')
            );

            assert.equal(filtered.filter, 4);
            assert.deepEqual(
                filtered.items.map(item => {
                    return item.title;
                }),
                ['Pricey']
            );
            assert.equal(filtered.total, 1);

            const reset = await call('PUT', '/wishes/filter', {
                body: { filter: null }
            });

            assert.deepEqual(await readJson<WishFilterDto>(reset), {
                filter: null
            });
            assert.equal(
                (
                    await run(
                        harness.repositories.users.findByTelegramId(
                            OWNER_TELEGRAM_ID
                        )
                    )
                )?.wishlistFilter,
                null
            );
            assert.equal(
                (await readJson<WishListDto>(await call('GET', '/wishes')))
                    .total,
                2
            );
        });

        it('shows a filter set through the bot service in the API', async () => {
            const owner = await createUser(OWNER);

            await run(
                harness.repositories.users.setWishlistFilter(owner.id, 2, NOW)
            );

            const list = await readJson<WishListDto>(
                await call('GET', '/wishes')
            );

            assert.equal(list.filter, 2);
        });

        it('rejects out-of-range and malformed filters', async () => {
            await createUser(OWNER);

            const cases: [unknown, string][] = [
                [{ filter: 5 }, 'invalid'],
                [{ filter: -1 }, 'invalid'],
                [{ filter: 1.5 }, 'invalid'],
                [{ filter: '2' }, 'invalid'],
                [{}, 'required']
            ];

            for (const [body, code] of cases) {
                const response = await call('PUT', '/wishes/filter', { body });

                assert.equal(response.status, 422, JSON.stringify(body));
                assert.deepEqual((await readError(response)).fields, {
                    filter: code
                });
            }
        });
    });

    describe('remove and clean', () => {
        it('removes a wish, records done and answers 404 afterwards', async () => {
            const owner = await createUser(OWNER);
            const done = await createWish(owner.id, 'Done');
            const dropped = await createWish(owner.id, 'Dropped');

            const doneResponse = await call(
                'POST',
                `/wishes/${done.id}/remove`,
                {
                    body: { done: true }
                }
            );

            assert.equal(doneResponse.status, 204);
            assert.equal(await doneResponse.text(), '');
            assert.equal(
                (
                    await call('POST', `/wishes/${dropped.id}/remove`, {
                        body: { done: false }
                    })
                ).status,
                204
            );
            assert.deepEqual(await readWishRow(done.id), {
                removed: 1,
                done: 1,
                priority: 0,
                hidden: 0
            });
            assert.equal((await readWishRow(dropped.id)).done, 0);
            assert.equal((await call('GET', `/wishes/${done.id}`)).status, 404);
            assert.equal(
                (
                    await call('POST', `/wishes/${done.id}/remove`, {
                        body: { done: true }
                    })
                ).status,
                404
            );
            assert.equal(
                (await readJson<WishListDto>(await call('GET', '/wishes')))
                    .total,
                0
            );
        });

        it('requires an explicit boolean done flag', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);

            for (const body of [{}, { done: 'yes' }, { done: 1 }]) {
                const response = await call(
                    'POST',
                    `/wishes/${wish.id}/remove`,
                    { body }
                );

                assert.equal(response.status, 422, JSON.stringify(body));
                assert.deepEqual((await readError(response)).fields, {
                    done: 'done' in body ? 'invalid' : 'required'
                });
            }

            assert.equal((await readWishRow(wish.id)).removed, 0);
        });

        it('clears only the matching pendingInput and album after remove', async () => {
            const owner = await createUser(OWNER);
            const removedWish = await createWish(owner.id, 'Gone');
            const otherWish = await createWish(owner.id, 'Stays');

            await seedSession(OWNER_TELEGRAM_ID, {
                pendingInput: wishFieldPending(removedWish.id),
                album: { mediaGroupId: 'g1', wishId: removedWish.id }
            });
            await call('POST', `/wishes/${removedWish.id}/remove`, {
                body: { done: true }
            });

            assert.deepEqual(await readSessionState(OWNER_TELEGRAM_ID), {
                v: 1,
                pendingInput: null,
                find: null
            });

            await seedSession(OWNER_TELEGRAM_ID, {
                pendingInput: wishFieldPending(otherWish.id),
                album: { mediaGroupId: 'g2', wishId: otherWish.id }
            });

            const another = await createWish(owner.id, 'Another');

            await call('POST', `/wishes/${another.id}/remove`, {
                body: { done: false }
            });

            const kept = await readSessionState(OWNER_TELEGRAM_ID);

            assert.deepEqual(kept.pendingInput, wishFieldPending(otherWish.id));
            assert.deepEqual(kept.album, {
                mediaGroupId: 'g2',
                wishId: otherWish.id
            });
        });

        it('keeps a feedback pendingInput and unrelated albums on remove', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);

            await seedSession(OWNER_TELEGRAM_ID, {
                pendingInput: { kind: 'feedback' },
                album: { mediaGroupId: 'g', wishId: wish.id }
            });
            await call('POST', `/wishes/${wish.id}/remove`, {
                body: { done: true }
            });

            assert.deepEqual(await readSessionState(OWNER_TELEGRAM_ID), {
                v: 1,
                pendingInput: { kind: 'feedback' },
                find: null
            });
        });

        it('does not touch another user session when removing', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);

            await seedSession(STRANGER_TELEGRAM_ID, {
                pendingInput: wishFieldPending(wish.id),
                album: { mediaGroupId: 'g', wishId: wish.id }
            });
            await call('POST', `/wishes/${wish.id}/remove`, {
                body: { done: true }
            });

            const strangerState = await readSessionState(STRANGER_TELEGRAM_ID);

            assert.deepEqual(
                strangerState.pendingInput,
                wishFieldPending(wish.id)
            );
        });

        it('cleans the whole list and the matching session references', async () => {
            const owner = await createUser(OWNER);
            const stranger = await createUser(STRANGER);
            const first = await createWish(owner.id, 'One');

            await createWish(owner.id, 'Two');

            const foreign = await createWish(stranger.id, 'Foreign');

            await seedSession(OWNER_TELEGRAM_ID, {
                pendingInput: wishFieldPending(first.id),
                album: { mediaGroupId: 'g', wishId: first.id }
            });
            await seedSession(STRANGER_TELEGRAM_ID, {
                pendingInput: wishFieldPending(foreign.id)
            });

            const cleaned = await call('POST', '/wishes/clean');

            assert.equal(cleaned.status, 200);
            assert.deepEqual(await readJson<RemovedCountDto>(cleaned), {
                removed: 2
            });
            assert.deepEqual(await readSessionState(OWNER_TELEGRAM_ID), {
                v: 1,
                pendingInput: null,
                find: null
            });
            assert.deepEqual(
                (await readSessionState(STRANGER_TELEGRAM_ID)).pendingInput,
                wishFieldPending(foreign.id)
            );
            assert.equal((await readWishRow(foreign.id)).removed, 0);
            assert.equal(
                (await readJson<WishListDto>(await call('GET', '/wishes')))
                    .total,
                0
            );

            const again = await readJson<RemovedCountDto>(
                await call('POST', '/wishes/clean')
            );

            assert.deepEqual(again, { removed: 0 });
        });

        it('keeps a feedback pendingInput when the list is cleaned', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);

            await seedSession(OWNER_TELEGRAM_ID, {
                pendingInput: { kind: 'feedback' },
                album: { mediaGroupId: 'g', wishId: wish.id }
            });
            await call('POST', '/wishes/clean');

            assert.deepEqual(await readSessionState(OWNER_TELEGRAM_ID), {
                v: 1,
                pendingInput: { kind: 'feedback' },
                find: null
            });
        });
    });

    describe('telemetry', () => {
        it('reports app-channel actions with the bot action names', async () => {
            const owner = await createUser(OWNER);
            const wish = await createWish(owner.id);
            const created = await readJson<OwnWishDto>(
                await call('POST', '/wishes', { body: { title: 'New' } })
            );

            await call('PATCH', `/wishes/${created.id}`, {
                body: { title: 'Renamed', hidden: true, priority: true }
            });
            await call('PATCH', `/wishes/${created.id}`, {
                body: { priority: 'high' }
            });
            await call('PATCH', `/wishes/${created.id}`, {
                body: { priority: 'low' }
            });
            await call('PUT', '/wishes/filter', { body: { filter: 1 } });
            await call('PUT', '/wishes/filter', { body: { filter: null } });
            await call('POST', `/wishes/${wish.id}/remove`, {
                body: { done: true }
            });
            await call('POST', '/wishes/clean');
            await call('POST', '/wishes/clean');

            const summary = actionEvents().map(event => {
                return [
                    event.channel,
                    event.action,
                    event.field ?? event.result ?? null
                ];
            });

            assert.deepEqual(summary, [
                ['app', 'wish_created', null],
                ['app', 'wish_updated', 'title'],
                ['app', 'wish_updated', 'visibility'],
                ['app', 'wish_priority_set', 'high'],
                ['app', 'wish_priority_set', 'low'],
                ['app', 'wishlist_filtered', 'set'],
                ['app', 'wishlist_filtered', 'reset'],
                ['app', 'wish_removed', 'done'],
                ['app', 'wishlist_cleaned', null]
            ]);
        });
    });
});
