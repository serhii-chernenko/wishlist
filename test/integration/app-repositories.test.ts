import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { decodeSessionState } from '../../src/bot/runtime/session-store';
import { createD1Harness, type D1Harness } from './d1-harness';

const baseTime = Date.parse('2026-10-03T09:00:00.000Z');
const ownerTelegramId = 8_001;
const strangerTelegramId = 8_002;

describe('mini app repository additions', () => {
    let harness: D1Harness;
    let repositories: D1Harness['repositories'];
    let tick = 0;

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };
    const nextNow = () => {
        tick += 1;

        return new Date(baseTime + tick * 1_000);
    };
    const createUser = async (telegramId = ownerTelegramId) => {
        const created = await run(
            repositories.users.create({
                telegramId,
                username: `user${telegramId}`,
                createdAt: nextNow()
            })
        );

        assert.ok(created);

        return created;
    };
    const createWish = async (userId: number, title = 'wish') => {
        const created = await run(
            repositories.wishes.create(userId, title, 'UAH', nextNow())
        );

        assert.ok(created);

        return created;
    };
    const setImages = async (wishId: number, images: string[]) => {
        await harness.env.DB.prepare(
            'UPDATE wishes SET images = ? WHERE id = ?'
        )
            .bind(JSON.stringify(images), wishId)
            .run();
    };
    const readImages = async (wishId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT images FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{ images: string }>();

        assert.ok(row);

        return row.images;
    };
    const readState = async (telegramUserId: number) => {
        const session = await run(repositories.sessions.get(telegramUserId));

        return session === null ? null : JSON.parse(session.state);
    };
    const writeState = (telegramUserId: number, state: string) => {
        return run(
            repositories.sessions.saveState(telegramUserId, state, nextNow())
        );
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

    describe('wishes.createWithFields', () => {
        it('creates a wish with every field and the explicit flags', async () => {
            const owner = await createUser();
            const now = nextNow();
            const created = await run(
                repositories.wishes.createWithFields(
                    owner.id,
                    {
                        title: 'Kettle',
                        description: 'Red one',
                        link: 'https://example.com/kettle',
                        price: 1500,
                        currency: 'EUR',
                        priorityLevel: 3,
                        hidden: true
                    },
                    now
                )
            );

            assert.ok(created);
            assert.equal(created.userId, owner.id);
            assert.equal(created.title, 'Kettle');
            assert.equal(created.description, 'Red one');
            assert.equal(created.link, 'https://example.com/kettle');
            assert.equal(created.price, 1500);
            assert.equal(created.priority, true);
            assert.equal(created.priorityLevel, 3);
            assert.equal(created.currency, 'EUR');
            assert.equal(created.hidden, true);
            assert.equal(created.removed, false);
            assert.equal(created.images, '[]');
            assert.equal(created.createdAt.getTime(), now.getTime());
            assert.equal(created.updatedAt.getTime(), now.getTime());
        });

        it('falls back to the column defaults for omitted fields', async () => {
            const owner = await createUser();
            const created = await run(
                repositories.wishes.createWithFields(
                    owner.id,
                    { title: 'Only title', currency: 'UAH' },
                    nextNow()
                )
            );

            assert.ok(created);
            assert.equal(created.description, null);
            assert.equal(created.link, null);
            assert.equal(created.price, 0);
            assert.equal(created.priority, false);
            assert.equal(created.priorityLevel, 0);
            assert.equal(created.currency, 'UAH');
            assert.equal(created.hidden, false);
            assert.deepEqual(
                await run(repositories.wishes.findOwned(created.id, owner.id)),
                created
            );
        });
    });

    describe('wishes.setFlags', () => {
        it('sets explicit booleans without toggling', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);
            const now = nextNow();

            const prioritized = await run(
                repositories.wishes.setFlags(
                    wish.id,
                    owner.id,
                    { priorityLevel: 3 },
                    now
                )
            );

            assert.ok(prioritized);
            assert.equal(prioritized.priority, true);
            assert.equal(prioritized.hidden, false);
            assert.equal(prioritized.updatedAt.getTime(), now.getTime());

            const repeated = await run(
                repositories.wishes.setFlags(
                    wish.id,
                    owner.id,
                    { priorityLevel: 3 },
                    nextNow()
                )
            );

            assert.equal(repeated?.priority, true);

            const both = await run(
                repositories.wishes.setFlags(
                    wish.id,
                    owner.id,
                    { priorityLevel: 0, hidden: true },
                    nextNow()
                )
            );

            assert.equal(both?.priority, false);
            assert.equal(both?.hidden, true);
        });

        it('returns the unchanged wish for an empty flag set', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);
            const result = await run(
                repositories.wishes.setFlags(wish.id, owner.id, {}, nextNow())
            );

            assert.deepEqual(result, wish);
        });

        it('ignores wishes of other users and removed wishes', async () => {
            const owner = await createUser();
            const stranger = await createUser(strangerTelegramId);
            const wish = await createWish(owner.id);

            assert.equal(
                await run(
                    repositories.wishes.setFlags(
                        wish.id,
                        stranger.id,
                        { priorityLevel: 3 },
                        nextNow()
                    )
                ),
                null
            );
            assert.equal(
                await run(
                    repositories.wishes.setFlags(
                        wish.id,
                        stranger.id,
                        {},
                        nextNow()
                    )
                ),
                null
            );
            assert.equal(
                (await run(repositories.wishes.findOwned(wish.id, owner.id)))
                    ?.priority,
                false
            );

            await run(
                repositories.wishes.softRemove(
                    wish.id,
                    owner.id,
                    false,
                    nextNow()
                )
            );

            assert.equal(
                await run(
                    repositories.wishes.setFlags(
                        wish.id,
                        owner.id,
                        { hidden: true },
                        nextNow()
                    )
                ),
                null
            );
        });
    });

    describe('wishes.removeImageAt', () => {
        it('removes the indexed image when the stored json still matches', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['a', 'b', 'c']);

            const now = nextNow();
            const updated = await run(
                repositories.wishes.removeImageAt(
                    wish.id,
                    owner.id,
                    1,
                    '["a","b","c"]',
                    now
                )
            );

            assert.ok(updated);
            assert.equal(updated.images, '["a","c"]');
            assert.equal(updated.updatedAt.getTime(), now.getTime());
            assert.equal(await readImages(wish.id), '["a","c"]');
        });

        it('rejects a stale expectation and leaves the images untouched', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['a', 'b']);

            const result = await run(
                repositories.wishes.removeImageAt(
                    wish.id,
                    owner.id,
                    0,
                    '["x","b"]',
                    nextNow()
                )
            );

            assert.equal(result, null);
            assert.equal(await readImages(wish.id), '["a","b"]');
        });

        it('rejects out of range and invalid indexes', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['a', 'b']);

            for (const index of [2, 99, -1, 0.5, Number.NaN]) {
                assert.equal(
                    await run(
                        repositories.wishes.removeImageAt(
                            wish.id,
                            owner.id,
                            index,
                            '["a","b"]',
                            nextNow()
                        )
                    ),
                    null,
                    String(index)
                );
            }

            assert.equal(await readImages(wish.id), '["a","b"]');
        });

        it('only touches active wishes of the owner', async () => {
            const owner = await createUser();
            const stranger = await createUser(strangerTelegramId);
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['a']);

            assert.equal(
                await run(
                    repositories.wishes.removeImageAt(
                        wish.id,
                        stranger.id,
                        0,
                        '["a"]',
                        nextNow()
                    )
                ),
                null
            );

            await run(
                repositories.wishes.softRemove(
                    wish.id,
                    owner.id,
                    false,
                    nextNow()
                )
            );

            assert.equal(
                await run(
                    repositories.wishes.removeImageAt(
                        wish.id,
                        owner.id,
                        0,
                        '["a"]',
                        nextNow()
                    )
                ),
                null
            );
            assert.equal(await readImages(wish.id), '["a"]');
        });

        it('lets exactly one of two concurrent removals win', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['a', 'b', 'c']);

            const results = await Promise.all([
                run(
                    repositories.wishes.removeImageAt(
                        wish.id,
                        owner.id,
                        0,
                        '["a","b","c"]',
                        nextNow()
                    )
                ),
                run(
                    repositories.wishes.removeImageAt(
                        wish.id,
                        owner.id,
                        0,
                        '["a","b","c"]',
                        nextNow()
                    )
                )
            ]);

            assert.equal(
                results.filter(result => {
                    return result !== null;
                }).length,
                1
            );
            assert.equal(await readImages(wish.id), '["b","c"]');
        });

        it('keeps a concurrent append from being clobbered by a stale removal', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['a', 'b']);
            await run(
                repositories.wishes.appendImage(
                    wish.id,
                    owner.id,
                    'c',
                    nextNow()
                )
            );

            const stale = await run(
                repositories.wishes.removeImageAt(
                    wish.id,
                    owner.id,
                    0,
                    '["a","b"]',
                    nextNow()
                )
            );

            assert.equal(stale, null);
            assert.equal(await readImages(wish.id), '["a","b","c"]');
        });
    });

    describe('wishes.findImageFileId', () => {
        it('returns the file id at the index', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['first', 'second']);

            assert.equal(
                await run(repositories.wishes.findImageFileId(wish.id, 0)),
                'first'
            );
            assert.equal(
                await run(repositories.wishes.findImageFileId(wish.id, 1)),
                'second'
            );
        });

        it('returns null for missing slots, invalid indexes, unknown and removed wishes', async () => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, ['first']);

            for (const index of [1, 8, -1, 0.5]) {
                assert.equal(
                    await run(
                        repositories.wishes.findImageFileId(wish.id, index)
                    ),
                    null,
                    String(index)
                );
            }

            assert.equal(
                await run(repositories.wishes.findImageFileId(wish.id + 99, 0)),
                null
            );

            await run(
                repositories.wishes.softRemove(
                    wish.id,
                    owner.id,
                    false,
                    nextNow()
                )
            );

            assert.equal(
                await run(repositories.wishes.findImageFileId(wish.id, 0)),
                null
            );
        });
    });

    describe('wishes.findSharedWishImages', () => {
        const publishWithWish = async (images: string[]) => {
            const owner = await createUser();
            const wish = await createWish(owner.id);

            await setImages(wish.id, images);

            const share = await run(
                repositories.shares.publish(owner.id, 'Owner', nextNow())
            );

            return { owner, wish, share };
        };

        it('returns the images json of a visible wish on an active share', async () => {
            const { wish, share } = await publishWithWish(['a', 'b']);

            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        share.publicId,
                        wish.id
                    )
                ),
                '["a","b"]'
            );
        });

        it('returns null for unknown share ids', async () => {
            const { wish } = await publishWithWish(['a']);

            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        '01unknownshareid',
                        wish.id
                    )
                ),
                null
            );
        });

        it('returns null for a wish of another owner', async () => {
            const { share } = await publishWithWish(['a']);
            const stranger = await createUser(strangerTelegramId);
            const foreign = await createWish(stranger.id);

            await setImages(foreign.id, ['secret']);

            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        share.publicId,
                        foreign.id
                    )
                ),
                null
            );
        });

        it('returns null for hidden and removed wishes', async () => {
            const { owner, wish, share } = await publishWithWish(['a']);

            await run(
                repositories.wishes.setFlags(
                    wish.id,
                    owner.id,
                    { hidden: true },
                    nextNow()
                )
            );

            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        share.publicId,
                        wish.id
                    )
                ),
                null
            );

            await run(
                repositories.wishes.setFlags(
                    wish.id,
                    owner.id,
                    { hidden: false },
                    nextNow()
                )
            );
            await run(
                repositories.wishes.softRemove(
                    wish.id,
                    owner.id,
                    false,
                    nextNow()
                )
            );

            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        share.publicId,
                        wish.id
                    )
                ),
                null
            );
        });

        it('returns null once the share is revoked or rotated away', async () => {
            const { owner, wish, share } = await publishWithWish(['a']);
            const rotated = await run(
                repositories.shares.rotate(owner.id, nextNow())
            );

            assert.ok(rotated);
            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        share.publicId,
                        wish.id
                    )
                ),
                null
            );
            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        rotated.publicId,
                        wish.id
                    )
                ),
                '["a"]'
            );

            await run(repositories.shares.revoke(owner.id, nextNow()));

            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        rotated.publicId,
                        wish.id
                    )
                ),
                null
            );
        });

        it('returns null when the owner blocked the bot', async () => {
            const { wish, share } = await publishWithWish(['a']);

            await run(
                repositories.users.markBlockedByTelegramId(
                    ownerTelegramId,
                    nextNow()
                )
            );

            assert.equal(
                await run(
                    repositories.wishes.findSharedWishImages(
                        share.publicId,
                        wish.id
                    )
                ),
                null
            );
        });
    });

    describe('sessions.clearWishReferences', () => {
        const wishFieldState = (wishId: number, extra: object = {}) => {
            return JSON.stringify({
                v: 1,
                pendingInput: { kind: 'wishField', wishId, field: 'images' },
                find: null,
                ...extra
            });
        };

        it('clears a pending wishField input of a removed wish and keeps the rest', async () => {
            await writeState(
                1,
                wishFieldState(5, {
                    album: { mediaGroupId: 'g', wishId: 6 }
                })
            );

            const cleared = await run(
                repositories.sessions.clearWishReferences(1, [5, 9])
            );

            assert.deepEqual(cleared, { pendingInput: true, album: false });
            assert.deepEqual(await readState(1), {
                v: 1,
                pendingInput: null,
                find: null,
                album: { mediaGroupId: 'g', wishId: 6 }
            });
        });

        it('clears the album only when its wish matches', async () => {
            await writeState(
                1,
                JSON.stringify({
                    v: 1,
                    pendingInput: { kind: 'feedback' },
                    find: null,
                    album: { mediaGroupId: 'g', wishId: 5 }
                })
            );

            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(1, [4])),
                { pendingInput: false, album: false }
            );
            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(1, [5])),
                { pendingInput: false, album: true }
            );
            assert.deepEqual(await readState(1), {
                v: 1,
                pendingInput: { kind: 'feedback' },
                find: null
            });
        });

        it('keeps unrelated pending inputs for every scope', async () => {
            const unrelated = [
                { kind: 'feedback' },
                { kind: 'payments' },
                { kind: 'findQuery' },
                { kind: 'wishTitleNew' },
                { kind: 'contact', authType: 'both', via: 'app' }
            ];

            for (const pendingInput of unrelated) {
                const state = JSON.stringify({
                    v: 1,
                    pendingInput,
                    find: null
                });

                await writeState(1, state);
                await run(repositories.sessions.clearWishReferences(1, [5]));
                await run(repositories.sessions.clearWishReferences(1, 'all'));

                assert.deepEqual(
                    await readState(1),
                    JSON.parse(state),
                    pendingInput.kind
                );
            }
        });

        it('keeps a wishField input of another wish', async () => {
            await writeState(1, wishFieldState(7));

            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(1, [5])),
                { pendingInput: false, album: false }
            );
            assert.deepEqual((await readState(1)).pendingInput, {
                kind: 'wishField',
                wishId: 7,
                field: 'images'
            });
        });

        it('handles more wish ids than one bound-parameter chunk', async () => {
            await writeState(
                1,
                wishFieldState(140, {
                    album: { mediaGroupId: 'g', wishId: 3 }
                })
            );

            const wishIds = Array.from({ length: 150 }, (_, index) => {
                return index + 1;
            });

            assert.deepEqual(
                await run(
                    repositories.sessions.clearWishReferences(1, wishIds)
                ),
                { pendingInput: true, album: true }
            );
            assert.deepEqual(await readState(1), {
                v: 1,
                pendingInput: null,
                find: null
            });
        });

        it('clears any wish reference for the all scope', async () => {
            await writeState(
                1,
                wishFieldState(7, { album: { mediaGroupId: 'g', wishId: 8 } })
            );

            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(1, 'all')),
                { pendingInput: true, album: true }
            );
            assert.deepEqual(await readState(1), {
                v: 1,
                pendingInput: null,
                find: null
            });
        });

        it('only touches the given user and tolerates missing or broken sessions', async () => {
            await writeState(1, wishFieldState(5));
            await writeState(2, wishFieldState(5));
            await writeState(3, 'not json');

            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(1, [5])),
                { pendingInput: true, album: false }
            );
            assert.deepEqual((await readState(2)).pendingInput, {
                kind: 'wishField',
                wishId: 5,
                field: 'images'
            });
            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(3, 'all')),
                { pendingInput: false, album: false }
            );
            assert.equal(
                (await run(repositories.sessions.get(3)))?.state,
                'not json'
            );
            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(99, 'all')),
                { pendingInput: false, album: false }
            );
            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(1, [])),
                { pendingInput: false, album: false }
            );
        });

        it('handles the default state without keys and leaves language and media group alone', async () => {
            await run(repositories.sessions.setLanguage(1, 'en', nextNow()));
            await run(
                repositories.sessions.markMediaGroup(1, 'group', 4, nextNow())
            );

            assert.deepEqual(
                await run(repositories.sessions.clearWishReferences(1, 'all')),
                { pendingInput: false, album: false }
            );

            await writeState(1, wishFieldState(5));
            await run(repositories.sessions.clearWishReferences(1, [5]));

            const session = await run(repositories.sessions.get(1));

            assert.equal(session?.language, 'en');
            assert.equal(session?.mediaGroupId, 'group');
            assert.equal(session?.mediaGroupMarker, 4);
        });
    });

    describe('sessions.setPendingContact and clearPendingContact', () => {
        it('creates a session row with the app contact intent', async () => {
            const now = nextNow();

            await run(repositories.sessions.setPendingContact(1, 'phone', now));

            const state = await readState(1);
            const expected = {
                kind: 'contact',
                authType: 'phone',
                via: 'app',
                createdAt: now.getTime()
            };

            assert.deepEqual(state, {
                v: 1,
                pendingInput: expected,
                find: null
            });
            assert.deepEqual(
                decodeSessionState(JSON.stringify(state)).pendingInput,
                expected
            );
        });

        it('preserves find, album, language and media group of an existing session', async () => {
            await run(repositories.sessions.setLanguage(1, 'pl', nextNow()));
            await run(
                repositories.sessions.markMediaGroup(1, 'group', 2, nextNow())
            );
            await writeState(
                1,
                JSON.stringify({
                    v: 1,
                    pendingInput: { kind: 'feedback' },
                    find: { targetUserId: 7, query: 'q', filter: 2 },
                    album: { mediaGroupId: 'g', wishId: 3 }
                })
            );
            const now = nextNow();

            await run(repositories.sessions.setPendingContact(1, 'both', now));

            assert.deepEqual(await readState(1), {
                v: 1,
                pendingInput: {
                    kind: 'contact',
                    authType: 'both',
                    via: 'app',
                    createdAt: now.getTime()
                },
                find: { targetUserId: 7, query: 'q', filter: 2 },
                album: { mediaGroupId: 'g', wishId: 3 }
            });

            const session = await run(repositories.sessions.get(1));

            assert.equal(session?.language, 'pl');
            assert.equal(session?.mediaGroupId, 'group');
        });

        it('replaces a broken state with a fresh one', async () => {
            await writeState(1, 'not json');
            const now = nextNow();

            await run(repositories.sessions.setPendingContact(1, 'phone', now));

            assert.deepEqual(await readState(1), {
                v: 1,
                pendingInput: {
                    kind: 'contact',
                    authType: 'phone',
                    via: 'app',
                    createdAt: now.getTime()
                },
                find: null
            });
        });

        it('clears only an app contact intent', async () => {
            await run(
                repositories.sessions.setPendingContact(1, 'both', nextNow())
            );

            assert.equal(
                await run(
                    repositories.sessions.clearPendingContact(1, nextNow())
                ),
                true
            );
            assert.equal((await readState(1)).pendingInput, null);
            assert.equal(
                await run(
                    repositories.sessions.clearPendingContact(1, nextNow())
                ),
                false
            );
        });

        it('never clears a bot contact prompt or unrelated pending input', async () => {
            const kept = [
                { kind: 'contact', authType: 'phone' },
                { kind: 'feedback' },
                { kind: 'wishField', wishId: 3, field: 'images' }
            ];

            for (const pendingInput of kept) {
                const state = JSON.stringify({
                    v: 1,
                    pendingInput,
                    find: null
                });

                await writeState(1, state);

                assert.equal(
                    await run(
                        repositories.sessions.clearPendingContact(1, nextNow())
                    ),
                    false
                );
                assert.deepEqual(await readState(1), JSON.parse(state));
            }

            assert.equal(
                await run(
                    repositories.sessions.clearPendingContact(404, nextNow())
                ),
                false
            );
        });
    });
});
