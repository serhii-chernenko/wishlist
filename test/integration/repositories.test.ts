import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import type { UserRecord } from '../../src/db/repositories';
import {
    countRows,
    createD1Harness,
    seedGeneratedWishes,
    type D1Harness
} from './d1-harness';

const now = new Date('2026-10-01T12:00:00.000Z');
const hourMilliseconds = 60 * 60 * 1000;
const dayMilliseconds = 24 * hourMilliseconds;

describe('D1 repositories', () => {
    let harness: D1Harness;
    let telegramIdSequence = 1_000;

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };
    let repositories: D1Harness['repositories'];

    const createUser = async (
        overrides: Partial<Parameters<typeof repositories.users.create>[0]> = {}
    ) => {
        telegramIdSequence += 1;

        const created = await run(
            repositories.users.create({
                telegramId: telegramIdSequence,
                createdAt: now,
                updatedAt: now,
                ...overrides
            })
        );

        assert.ok(created);

        return created;
    };
    const createWish = async (userId: number, title = 'wish') => {
        const created = await run(
            repositories.wishes.create(userId, title, now)
        );

        assert.ok(created);

        return created;
    };
    const readImages = async (wishId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT images FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{ images: string }>();

        return JSON.parse(row?.images ?? 'null') as string[];
    };

    before(async () => {
        harness = await createD1Harness();
        repositories = harness.repositories;
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        await harness.clearApplicationTables();
    });

    describe('users', () => {
        it('creates, finds and enforces case-insensitive usernames', async () => {
            const alice = await createUser({
                username: 'Alice',
                usernameSearchable: true
            });

            assert.equal(alice.currency, 'UAH');
            assert.equal(alice.releaseVersion, '0.0.0');
            assert.equal(alice.language, null);
            assert.equal(
                (await run(repositories.users.findById(alice.id)))?.username,
                'Alice'
            );
            assert.equal(
                (
                    await run(
                        repositories.users.findByTelegramId(alice.telegramId)
                    )
                )?.id,
                alice.id
            );
            assert.equal(
                await run(repositories.users.findByTelegramId(1)),
                null
            );

            await assert.rejects(
                harness.env.DB.prepare(
                    "INSERT INTO users (telegram_id, username, created_at, updated_at) VALUES (5, 'ALICE', 0, 0)"
                ).run(),
                /UNIQUE/
            );
        });

        it('finds searchable users by username ignoring case and by phone substring', async () => {
            const byName = await createUser({
                username: 'Lili_Lykke',
                usernameSearchable: true
            });
            const byPhone = await createUser({
                phone: '+380 (93) 034-06-58',
                phoneDigits: '380930340658'
            });
            const hidden = await createUser({
                username: 'quiet_one',
                usernameSearchable: false
            });

            const foundByName = await run(
                repositories.users.findSearchable({ username: 'lILI_lykke' })
            );
            const foundByPhone = await run(
                repositories.users.findSearchable({ phoneDigits: '0930340658' })
            );
            const foundByFullPhone = await run(
                repositories.users.findSearchable({
                    phoneDigits: '380930340658'
                })
            );
            const tooShortPhone = await run(
                repositories.users.findSearchable({ phoneDigits: '930340658' })
            );
            const notSearchable = await run(
                repositories.users.findSearchable({ username: 'quiet_one' })
            );
            const nothingRequested = await run(
                repositories.users.findSearchable({})
            );

            assert.equal(foundByName?.id, byName.id);
            assert.equal(foundByPhone?.id, byPhone.id);
            assert.equal(foundByFullPhone?.id, byPhone.id);
            assert.equal(foundByPhone?.phoneDigits, '380930340658');
            assert.equal(tooShortPhone, null);
            assert.equal(notSearchable, null);
            assert.equal(nothingRequested, null);
            assert.notEqual(hidden.id, byName.id);
        });

        it('prefers the lowest id and skips blocked users in search and broadcast', async () => {
            const first = await createUser({
                username: 'first',
                usernameSearchable: true,
                phone: '380111111111',
                phoneDigits: '380111111111'
            });
            const second = await createUser({
                username: 'second',
                usernameSearchable: true,
                phone: '380222222222',
                phoneDigits: '380222222222'
            });

            const either = await run(
                repositories.users.findSearchable({
                    username: 'second',
                    phoneDigits: '380111111111'
                })
            );

            assert.equal(either?.id, first.id);
            assert.equal(
                await run(
                    repositories.users.markBlockedByTelegramId(
                        first.telegramId,
                        now
                    )
                ),
                true
            );
            assert.equal(
                await run(
                    repositories.users.markBlockedByTelegramId(
                        first.telegramId,
                        now
                    )
                ),
                false
            );
            assert.equal(
                await run(
                    repositories.users.findSearchable({ username: 'first' })
                ),
                null
            );

            const candidates = await run(
                repositories.users.listBroadcastCandidates()
            );

            assert.deepEqual(
                candidates.map(candidate => candidate.id),
                [second.id]
            );
            assert.equal(
                await run(repositories.users.clearBlocked(first.id)),
                true
            );
            assert.equal(
                (await run(repositories.users.listBroadcastCandidates()))
                    .length,
                2
            );
        });

        it('syncs profile data, releases stale username holders and throttles lastSeenAt', async () => {
            const holder = await createUser({
                username: 'Shared',
                usernameSearchable: true
            });
            const user = await createUser({ username: 'old_name' });

            const firstSync = await run(
                repositories.users.syncProfile(user.id, {
                    username: 'shared',
                    telegramLanguageCode: 'uk',
                    now
                })
            );

            assert.equal(firstSync?.username, 'shared');
            assert.equal(firstSync?.telegramLanguageCode, 'uk');
            assert.equal(firstSync?.lastSeenAt?.getTime(), now.getTime());
            assert.equal(
                (await run(repositories.users.findById(holder.id)))?.username,
                null
            );

            const soon = new Date(now.getTime() + 10 * 60 * 1000);
            const unchanged = await run(
                repositories.users.syncProfile(user.id, {
                    username: 'shared',
                    telegramLanguageCode: 'uk',
                    now: soon
                })
            );

            assert.equal(unchanged, null);

            const later = new Date(now.getTime() + 2 * hourMilliseconds);
            const refreshed = await run(
                repositories.users.syncProfile(user.id, {
                    username: 'shared',
                    telegramLanguageCode: 'uk',
                    now: later
                })
            );

            assert.equal(refreshed?.lastSeenAt?.getTime(), later.getTime());
        });

        it('clears blockedAt on the next sync and supports username removal', async () => {
            const user = await createUser({ username: 'someone' });

            await run(
                repositories.users.markBlockedByTelegramId(user.telegramId, now)
            );

            const synced = await run(
                repositories.users.syncProfile(user.id, {
                    username: null,
                    telegramLanguageCode: null,
                    now
                })
            );

            assert.equal(synced?.blockedAt, null);
            assert.equal(synced?.username, null);
        });

        it('updates visibility, language, payments, filter, token, release version and telegram id', async () => {
            const user = await createUser({ username: 'vis' });
            const rival = await createUser({
                phone: '+380500000000',
                phoneDigits: '380500000000'
            });

            const phoneOnly = await run(
                repositories.users.setVisibility(user.id, {
                    usernameSearchable: false,
                    phone: '+380500000000',
                    phoneDigits: '380500000000',
                    username: 'vis'
                })
            );

            assert.equal(phoneOnly?.phone, '+380500000000');
            assert.equal(phoneOnly?.usernameSearchable, false);
            assert.equal(
                (await run(repositories.users.findById(rival.id)))?.phone,
                null
            );

            const narrowed = await run(
                repositories.users.setVisibility(user.id, {
                    usernameSearchable: true,
                    phone: null,
                    phoneDigits: null,
                    username: 'vis'
                })
            );

            assert.equal(narrowed?.phone, null);
            assert.equal(narrowed?.phoneDigits, null);
            assert.equal(narrowed?.usernameSearchable, true);

            await run(repositories.users.setLanguage(user.id, 'pl'));
            await run(repositories.users.setPayments(user.id, 'IBAN 1'));
            await run(repositories.users.setWishlistFilter(user.id, 3));
            await run(repositories.users.setTelegraphToken(user.id, 'token'));
            await run(
                repositories.users.updateReleaseVersion(user.id, '2.0.0')
            );

            const updated = await run(repositories.users.findById(user.id));

            assert.equal(updated?.language, 'pl');
            assert.equal(updated?.payments, 'IBAN 1');
            assert.equal(updated?.wishlistFilter, 3);
            assert.equal(updated?.telegraphAccessToken, 'token');
            assert.equal(updated?.releaseVersion, '2.0.0');

            await run(repositories.users.setLanguage(user.id, null));
            await run(repositories.users.setPayments(user.id, null));
            await run(repositories.users.setWishlistFilter(user.id, null));

            const cleared = await run(repositories.users.findById(user.id));

            assert.equal(cleared?.language, null);
            assert.equal(cleared?.payments, null);
            assert.equal(cleared?.wishlistFilter, null);
            assert.equal(
                await run(
                    repositories.users.updateTelegramId(
                        user.id,
                        rival.telegramId
                    )
                ),
                false
            );
            assert.equal(
                await run(
                    repositories.users.updateTelegramId(user.id, 777_777)
                ),
                true
            );
        });

        it('create releases a stale username holder instead of failing', async () => {
            const stale = await createUser({ username: 'taken' });
            const fresh = await createUser({ username: 'TAKEN' });

            assert.equal(fresh.username, 'TAKEN');
            assert.equal(
                (await run(repositories.users.findById(stale.id)))?.username,
                null
            );
        });
    });

    describe('wishes', () => {
        let owner: UserRecord;

        beforeEach(async () => {
            owner = await createUser({ username: 'owner' });
        });

        it('lists owned wishes by priority, recency and id with pagination and price filters', async () => {
            const cheap = await createWish(owner.id, 'cheap');
            const middle = await createWish(owner.id, 'middle');
            const expensive = await createWish(owner.id, 'expensive');
            const urgent = await createWish(owner.id, 'urgent');
            const laterTime = new Date(now.getTime() + 1_000);

            await run(
                repositories.wishes.updateFields(
                    cheap.id,
                    owner.id,
                    { price: 500 },
                    now
                )
            );
            await run(
                repositories.wishes.updateFields(
                    middle.id,
                    owner.id,
                    { price: 2500 },
                    laterTime
                )
            );
            await run(
                repositories.wishes.updateFields(
                    expensive.id,
                    owner.id,
                    { price: 10_000 },
                    now
                )
            );
            await run(
                repositories.wishes.togglePriority(urgent.id, owner.id, now)
            );

            const all = await run(
                repositories.wishes.listOwned(owner.id, {
                    filter: null,
                    offset: 0,
                    limit: 10
                })
            );

            assert.deepEqual(
                all.items.map(item => item.title),
                ['urgent', 'middle', 'expensive', 'cheap']
            );
            assert.equal(all.total, 4);

            const secondPage = await run(
                repositories.wishes.listOwned(owner.id, {
                    filter: null,
                    offset: 2,
                    limit: 2
                })
            );

            assert.deepEqual(
                secondPage.items.map(item => item.title),
                ['expensive', 'cheap']
            );
            assert.equal(secondPage.total, 4);

            const titlesForFilter = async (filter: number) => {
                const page = await run(
                    repositories.wishes.listOwned(owner.id, {
                        filter,
                        offset: 0,
                        limit: 10
                    })
                );

                return page.items.map(item => item.title).sort();
            };

            assert.deepEqual(await titlesForFilter(0), ['cheap', 'urgent']);
            assert.deepEqual(await titlesForFilter(1), []);
            assert.deepEqual(await titlesForFilter(2), ['middle']);
            assert.deepEqual(await titlesForFilter(3), []);
            assert.deepEqual(await titlesForFilter(4), ['expensive']);
        });

        it('hides hidden, removed and blocked-owner wishes from visible lookups', async () => {
            const shown = await createWish(owner.id, 'shown');
            const hidden = await createWish(owner.id, 'hidden');
            const removed = await createWish(owner.id, 'removed');

            await run(
                repositories.wishes.toggleHidden(hidden.id, owner.id, now)
            );
            await run(
                repositories.wishes.softRemove(removed.id, owner.id, false, now)
            );

            const ownerView = await run(
                repositories.wishes.listOwned(owner.id, {
                    filter: null,
                    offset: 0,
                    limit: 10
                })
            );
            const visibleView = await run(
                repositories.wishes.listVisibleOf(owner.id, {
                    filter: null,
                    offset: 0,
                    limit: 10
                })
            );
            const shareable = await run(
                repositories.wishes.listShareable(owner.id)
            );

            assert.deepEqual(ownerView.items.map(item => item.title).sort(), [
                'hidden',
                'shown'
            ]);
            assert.deepEqual(
                visibleView.items.map(item => item.title),
                ['shown']
            );
            assert.equal(visibleView.total, 1);
            assert.deepEqual(
                shareable.map(item => item.title),
                ['shown']
            );
            assert.equal(
                (await run(repositories.wishes.findVisible(shown.id)))?.id,
                shown.id
            );
            assert.equal(
                await run(repositories.wishes.findVisible(hidden.id)),
                null
            );
            assert.equal(
                await run(repositories.wishes.findVisible(removed.id)),
                null
            );
            assert.equal(
                await run(repositories.wishes.findOwned(removed.id, owner.id)),
                null
            );

            await run(
                repositories.users.markBlockedByTelegramId(
                    owner.telegramId,
                    now
                )
            );

            assert.equal(
                await run(repositories.wishes.findVisible(shown.id)),
                null
            );
            assert.equal(
                (
                    await run(
                        repositories.wishes.listVisibleOf(owner.id, {
                            filter: null,
                            offset: 0,
                            limit: 10
                        })
                    )
                ).total,
                0
            );
        });

        it('enforces ownership on every mutation', async () => {
            const stranger = await createUser();
            const wish = await createWish(owner.id, 'mine');

            assert.equal(
                await run(repositories.wishes.findOwned(wish.id, stranger.id)),
                null
            );
            assert.equal(
                await run(
                    repositories.wishes.updateFields(
                        wish.id,
                        stranger.id,
                        { title: 'stolen' },
                        now
                    )
                ),
                false
            );
            assert.equal(
                await run(
                    repositories.wishes.togglePriority(
                        wish.id,
                        stranger.id,
                        now
                    )
                ),
                false
            );
            assert.equal(
                await run(
                    repositories.wishes.toggleHidden(wish.id, stranger.id, now)
                ),
                false
            );
            assert.deepEqual(
                await run(
                    repositories.wishes.appendImage(
                        wish.id,
                        stranger.id,
                        'photo',
                        now
                    )
                ),
                { appended: false, count: 0 }
            );
            assert.equal(
                await run(
                    repositories.wishes.clearImages(wish.id, stranger.id, now)
                ),
                false
            );
            assert.equal(
                await run(
                    repositories.wishes.softRemove(
                        wish.id,
                        stranger.id,
                        true,
                        now
                    )
                ),
                false
            );
            assert.equal(
                (await run(repositories.wishes.findOwned(wish.id, owner.id)))
                    ?.title,
                'mine'
            );
        });

        it('toggles flags and updates fields with a bumped updatedAt', async () => {
            const wish = await createWish(owner.id, 'before');
            const later = new Date(now.getTime() + 5_000);

            assert.equal(
                await run(
                    repositories.wishes.updateFields(
                        wish.id,
                        owner.id,
                        {
                            title: 'after',
                            description: 'text',
                            link: 'https://example.com',
                            price: 42
                        },
                        later
                    )
                ),
                true
            );
            await run(
                repositories.wishes.togglePriority(wish.id, owner.id, later)
            );
            await run(
                repositories.wishes.toggleHidden(wish.id, owner.id, later)
            );

            const toggled = await run(
                repositories.wishes.findOwned(wish.id, owner.id)
            );

            assert.equal(toggled?.title, 'after');
            assert.equal(toggled?.price, 42);
            assert.equal(toggled?.priority, true);
            assert.equal(toggled?.hidden, true);
            assert.equal(toggled?.updatedAt.getTime(), later.getTime());

            await run(
                repositories.wishes.togglePriority(wish.id, owner.id, later)
            );
            await run(
                repositories.wishes.updateFields(
                    wish.id,
                    owner.id,
                    { description: null, link: null },
                    later
                )
            );

            const reverted = await run(
                repositories.wishes.findOwned(wish.id, owner.id)
            );

            assert.equal(reverted?.priority, false);
            assert.equal(reverted?.description, null);
            assert.equal(reverted?.link, null);
        });

        it('appends images atomically under 12 concurrent calls without exceeding 9 or duplicating', async () => {
            const wish = await createWish(owner.id);
            const fileIds = Array.from({ length: 12 }, (_, index) => {
                return `file-${index}`;
            });

            const results = await Promise.all(
                fileIds.map(fileId => {
                    return run(
                        repositories.wishes.appendImage(
                            wish.id,
                            owner.id,
                            fileId,
                            now
                        )
                    );
                })
            );
            const images = await readImages(wish.id);

            assert.equal(results.filter(result => result.appended).length, 9);
            assert.equal(images.length, 9);
            assert.equal(new Set(images).size, 9);
            assert.ok(images.every(image => fileIds.includes(image)));
            assert.ok(
                results
                    .filter(result => !result.appended)
                    .every(result => result.count === 9)
            );
        });

        it('deduplicates the same file id sent concurrently and respects existing images', async () => {
            const wish = await createWish(owner.id);

            const duplicates = await Promise.all(
                Array.from({ length: 8 }, () => {
                    return run(
                        repositories.wishes.appendImage(
                            wish.id,
                            owner.id,
                            'same',
                            now
                        )
                    );
                })
            );

            assert.equal(
                duplicates.filter(result => result.appended).length,
                1
            );
            assert.deepEqual(await readImages(wish.id), ['same']);

            for (let index = 0; index < 7; index += 1) {
                await run(
                    repositories.wishes.appendImage(
                        wish.id,
                        owner.id,
                        `extra-${index}`,
                        now
                    )
                );
            }

            const mixed = await Promise.all(
                Array.from({ length: 12 }, (_, index) => {
                    return run(
                        repositories.wishes.appendImage(
                            wish.id,
                            owner.id,
                            `late-${index}`,
                            now
                        )
                    );
                })
            );

            assert.equal(mixed.filter(result => result.appended).length, 1);
            assert.equal((await readImages(wish.id)).length, 9);

            assert.equal(
                await run(
                    repositories.wishes.clearImages(wish.id, owner.id, now)
                ),
                true
            );
            assert.deepEqual(await readImages(wish.id), []);
        });

        it('soft-removes a wish and cascades its gives in one batch', async () => {
            const giver = await createUser();
            const wish = await createWish(owner.id, 'doomed');
            const kept = await createWish(owner.id, 'kept');

            await run(repositories.gives.add(giver.id, wish.id, now));
            await run(repositories.gives.add(giver.id, kept.id, now));

            assert.equal(
                await run(
                    repositories.wishes.softRemove(wish.id, owner.id, true, now)
                ),
                true
            );
            assert.equal(
                await run(
                    repositories.wishes.softRemove(wish.id, owner.id, true, now)
                ),
                false
            );

            const row = await harness.env.DB.prepare(
                'SELECT removed, done FROM wishes WHERE id = ?'
            )
                .bind(wish.id)
                .first<{ removed: number; done: number }>();

            assert.deepEqual(row, { removed: 1, done: 1 });
            assert.equal(await countRows(harness, 'gives'), 1);
            assert.equal(
                (
                    await run(
                        repositories.gives.listForGiver(giver.id, {
                            offset: 0,
                            limit: 10
                        })
                    )
                ).total,
                1
            );
        });

        it('soft-removes all active wishes with their gives and clears the done flag', async () => {
            const giver = await createUser();
            const other = await createUser();
            const first = await createWish(owner.id, 'first');
            const second = await createWish(owner.id, 'second');
            const foreign = await createWish(other.id, 'foreign');
            const already = await createWish(owner.id, 'already');

            await run(
                repositories.wishes.softRemove(already.id, owner.id, true, now)
            );
            await run(repositories.gives.add(giver.id, first.id, now));
            await run(repositories.gives.add(giver.id, second.id, now));
            await run(repositories.gives.add(giver.id, foreign.id, now));

            const removedCount = await run(
                repositories.wishes.softRemoveAll(owner.id, now)
            );

            assert.equal(removedCount, 2);
            assert.equal(await countRows(harness, 'gives'), 1);

            const doneRows = await harness.env.DB.prepare(
                'SELECT title, removed, done FROM wishes WHERE user_id = ? ORDER BY id'
            )
                .bind(owner.id)
                .all<{ title: string; removed: number; done: number }>();

            assert.deepEqual(doneRows.results, [
                { title: 'first', removed: 1, done: 0 },
                { title: 'second', removed: 1, done: 0 },
                { title: 'already', removed: 1, done: 1 }
            ]);
        });
    });

    describe('gives', () => {
        it('adds once, removes only the caller give and lists with owners', async () => {
            const owner = await createUser({ username: 'owner' });
            const giver = await createUser();
            const otherGiver = await createUser();
            const wish = await createWish(owner.id, 'gift');

            assert.equal(
                await run(repositories.gives.add(giver.id, wish.id, now)),
                'added'
            );
            assert.equal(
                await run(repositories.gives.add(giver.id, wish.id, now)),
                'exists'
            );
            await run(repositories.gives.add(otherGiver.id, wish.id, now));

            const list = await run(
                repositories.gives.listForGiver(giver.id, {
                    offset: 0,
                    limit: 10
                })
            );

            assert.equal(list.total, 1);
            assert.equal(list.items[0]?.wish.title, 'gift');
            assert.equal(list.items[0]?.owner?.id, owner.id);
            assert.equal(
                await run(repositories.gives.remove(giver.id, 999_999)),
                false
            );
            assert.equal(
                await run(repositories.gives.remove(giver.id, wish.id)),
                true
            );
            assert.equal(await countRows(harness, 'gives'), 1);
            assert.equal(
                await run(repositories.gives.removeAll(otherGiver.id)),
                1
            );
            assert.equal(await countRows(harness, 'gives'), 0);
        });

        it('omits blocked or missing owners and excludes removed wishes from the list', async () => {
            const owner = await createUser();
            const giver = await createUser();
            const visible = await createWish(owner.id, 'visible');
            const removed = await createWish(owner.id, 'removed');

            await run(repositories.gives.add(giver.id, visible.id, now));
            await run(repositories.gives.add(giver.id, removed.id, now));
            await harness.env.DB.prepare(
                'UPDATE wishes SET removed = 1 WHERE id = ?'
            )
                .bind(removed.id)
                .run();
            await run(
                repositories.users.markBlockedByTelegramId(
                    owner.telegramId,
                    now
                )
            );

            const list = await run(
                repositories.gives.listForGiver(giver.id, {
                    offset: 0,
                    limit: 10
                })
            );

            assert.equal(list.total, 1);
            assert.equal(list.items.length, 1);
            assert.equal(list.items[0]?.owner, null);

            await harness.env.DB.prepare('DELETE FROM users WHERE id = ?')
                .bind(owner.id)
                .run();

            const afterOwnerDelete = await run(
                repositories.gives.listForGiver(giver.id, {
                    offset: 0,
                    limit: 10
                })
            );

            assert.equal(afterOwnerDelete.items[0]?.owner, null);
        });

        it('looks up givers for more than 100 wish ids in chunks', async () => {
            const owner = await createUser();
            const giverA = await createUser();
            const giverB = await createUser();

            await seedGeneratedWishes(harness, owner.id, 250);

            const { results: wishRows } = await harness.env.DB.prepare(
                'SELECT id FROM wishes WHERE user_id = ? ORDER BY id'
            )
                .bind(owner.id)
                .all<{ id: number }>();
            const wishIds = wishRows.map(row => row.id);

            assert.equal(wishIds.length, 250);

            for (const index of [0, 89, 90, 179, 180, 249]) {
                await run(
                    repositories.gives.add(giverA.id, wishIds[index]!, now)
                );
            }

            await run(repositories.gives.add(giverB.id, wishIds[90]!, now));

            const givers = await run(
                repositories.gives.giversByWishIds(wishIds)
            );

            assert.equal(givers.size, 6);
            assert.deepEqual(givers.get(wishIds[0]!), [giverA.id]);
            assert.deepEqual(givers.get(wishIds[90]!), [giverA.id, giverB.id]);
            assert.deepEqual(givers.get(wishIds[249]!), [giverA.id]);
            assert.equal(givers.get(wishIds[1]!), undefined);
            assert.equal(
                (await run(repositories.gives.giversByWishIds([]))).size,
                0
            );
        });
    });

    describe('sessions', () => {
        it('upserts state and language independently', async () => {
            assert.equal(await run(repositories.sessions.get(55)), null);

            await run(repositories.sessions.setLanguage(55, 'en', now));
            await run(
                repositories.sessions.saveState(
                    55,
                    { v: 1, pendingInput: null },
                    now
                )
            );

            const session = await run(repositories.sessions.get(55));

            assert.equal(session?.language, 'en');
            assert.deepEqual(JSON.parse(session?.state ?? ''), {
                v: 1,
                pendingInput: null
            });

            await run(repositories.sessions.setLanguage(55, null, now));
            await run(repositories.sessions.saveState(55, '{"v":1}', now));

            const reset = await run(repositories.sessions.get(55));

            assert.equal(reset?.language, null);
            assert.equal(reset?.state, '{"v":1}');
        });

        it('keeps the latest media group marker and clears it with compare-and-set', async () => {
            await run(
                repositories.sessions.markMediaGroup(7, 'album', 10, now)
            );
            await run(
                repositories.sessions.markMediaGroup(7, 'album', 12, now)
            );
            await run(
                repositories.sessions.markMediaGroup(7, 'album', 11, now)
            );

            assert.equal(
                await run(repositories.sessions.readMediaGroupMarker(7)),
                12
            );
            assert.equal(
                await run(repositories.sessions.clearMediaGroup(7, 11)),
                false
            );
            assert.equal(
                await run(repositories.sessions.readMediaGroupMarker(7)),
                12
            );
            assert.equal(
                await run(repositories.sessions.clearMediaGroup(7, 12)),
                true
            );
            assert.equal(
                await run(repositories.sessions.readMediaGroupMarker(7)),
                null
            );
            assert.equal(
                await run(repositories.sessions.readMediaGroupMarker(8)),
                null
            );

            await run(
                repositories.sessions.markMediaGroup(7, 'next-album', 3, now)
            );

            assert.equal(
                await run(repositories.sessions.readMediaGroupMarker(7)),
                3
            );
        });

        it('prunes sessions older than the cutoff', async () => {
            const old = new Date(now.getTime() - 100 * dayMilliseconds);
            const recent = new Date(now.getTime() - dayMilliseconds);

            await run(repositories.sessions.saveState(1, '{"v":1}', old));
            await run(repositories.sessions.saveState(2, '{"v":1}', recent));

            const pruned = await run(
                repositories.sessions.pruneUpdatedBefore(
                    new Date(now.getTime() - 90 * dayMilliseconds)
                )
            );

            assert.equal(pruned, 1);
            assert.equal(await countRows(harness, 'sessions'), 1);
        });
    });

    describe('release announcements', () => {
        it('queues per user, skips already announced users and moves release version on sent', async () => {
            const first = await createUser();
            const second = await createUser();
            const blocked = await createUser();
            const current = await createUser();

            await run(
                repositories.users.updateReleaseVersion(first.id, '1.7.1')
            );
            await run(
                repositories.users.updateReleaseVersion(second.id, '1.7.1')
            );
            await run(
                repositories.users.updateReleaseVersion(blocked.id, '1.7.1')
            );
            await run(
                repositories.users.updateReleaseVersion(current.id, '2.0.0')
            );
            await run(
                repositories.users.markBlockedByTelegramId(
                    blocked.telegramId,
                    now
                )
            );

            const pending = await run(
                repositories.releaseAnnouncements.listUsersWithoutAnnouncement(
                    '2.0.0'
                )
            );

            assert.deepEqual(
                pending.map(user => user.id).sort(),
                [first.id, second.id].sort()
            );

            const inserted = await run(
                repositories.releaseAnnouncements.insertQueuedAnnouncements(
                    '2.0.0',
                    [first.id, second.id],
                    now
                )
            );

            assert.deepEqual(inserted.sort(), [first.id, second.id].sort());
            assert.deepEqual(
                await run(
                    repositories.releaseAnnouncements.insertQueuedAnnouncements(
                        '2.0.0',
                        [first.id],
                        now
                    )
                ),
                []
            );
            assert.equal(
                (
                    await run(
                        repositories.releaseAnnouncements.listUsersWithoutAnnouncement(
                            '2.0.0'
                        )
                    )
                ).length,
                0
            );

            const announcement = await run(
                repositories.releaseAnnouncements.findAnnouncement(
                    '2.0.0',
                    first.id
                )
            );

            assert.ok(announcement);
            assert.equal(
                await run(
                    repositories.releaseAnnouncements.claimForSending(
                        announcement.id,
                        now
                    )
                ),
                true
            );
            assert.equal(
                await run(
                    repositories.releaseAnnouncements.claimForSending(
                        announcement.id,
                        now
                    )
                ),
                false
            );

            await run(
                repositories.releaseAnnouncements.markSent(
                    announcement.id,
                    first.id,
                    '2.0.0',
                    now
                )
            );

            assert.equal(
                (await run(repositories.users.findById(first.id)))
                    ?.releaseVersion,
                '2.0.0'
            );
            assert.equal(
                (
                    await run(
                        repositories.releaseAnnouncements.findAnnouncement(
                            '2.0.0',
                            first.id
                        )
                    )
                )?.status,
                'sent'
            );
        });

        it('inserts more than one chunk of announcements', async () => {
            const owner = await createUser();

            await harness.env.DB.prepare(
                `INSERT INTO users (telegram_id, release_version, created_at, updated_at)
                WITH RECURSIVE sequence(n) AS (
                    SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < 40
                )
                SELECT 5000 + n, '1.7.1', 0, 0 FROM sequence`
            ).run();

            const pending = await run(
                repositories.releaseAnnouncements.listUsersWithoutAnnouncement(
                    '2.0.0'
                )
            );
            const inserted = await run(
                repositories.releaseAnnouncements.insertQueuedAnnouncements(
                    '2.0.0',
                    pending.map(user => user.id),
                    now
                )
            );

            assert.ok(pending.length >= 40);
            assert.equal(inserted.length, pending.length);
            assert.equal(
                await countRows(harness, 'release_announcements'),
                pending.length
            );
            assert.ok(owner.id > 0);
        });
    });

    describe('stats', () => {
        it('reports public stats and snapshot aggregates', async () => {
            const active = await createUser({
                language: 'uk',
                payments: 'iban'
            });
            const weekly = await createUser({ language: 'pl' });
            const auto = await createUser();
            const blocked = await createUser({ language: 'en' });

            await run(
                repositories.users.syncProfile(active.id, {
                    username: null,
                    telegramLanguageCode: null,
                    now
                })
            );
            await run(
                repositories.users.syncProfile(weekly.id, {
                    username: null,
                    telegramLanguageCode: null,
                    now: new Date(now.getTime() - 3 * dayMilliseconds)
                })
            );
            await run(
                repositories.users.markBlockedByTelegramId(
                    blocked.telegramId,
                    now
                )
            );

            const live = await createWish(active.id, 'live');
            const priority = await createWish(active.id, 'priority');
            const hidden = await createWish(weekly.id, 'hidden');
            const done = await createWish(weekly.id, 'done');

            await run(
                repositories.wishes.togglePriority(priority.id, active.id, now)
            );
            await run(
                repositories.wishes.toggleHidden(hidden.id, weekly.id, now)
            );
            await run(
                repositories.wishes.softRemove(done.id, weekly.id, true, now)
            );
            await run(repositories.gives.add(auto.id, live.id, now));

            assert.deepEqual(await run(repositories.stats.publicStats()), {
                users: 3,
                wishes: 4,
                done: 1
            });

            const snapshot = await run(repositories.stats.snapshot(now));

            assert.deepEqual(snapshot, {
                registeredUsers: 4,
                blockedUsers: 1,
                activeUsers1d: 1,
                activeUsers7d: 2,
                activeUsers30d: 2,
                totalWishes: 4,
                activeWishes: 3,
                hiddenWishes: 1,
                priorityWishes: 1,
                doneWishes: 1,
                gives: 1,
                usersWithPayments: 1,
                languageCounts: { uk: 1, en: 0, pl: 1, auto: 1 }
            });
        });
    });
});
