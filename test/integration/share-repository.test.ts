import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import {
    SHARE_DISPLAY_NAME_MAX_LENGTH,
    type PublicShareFingerprint
} from '../../src/db/repositories';
import { APP_THIRD_PARTY_GIFTED_LIMIT } from '../../src/shared/app-api';
import { resolvePublicUsername } from '../../src/web/share/fingerprint';
import { isValidSharePublicId } from '../../src/web/share/public-id';
import { createD1Harness, type D1Harness } from './d1-harness';

const baseTime = Date.parse('2026-10-01T12:00:00.000Z');
const ownerTelegramId = 7_001;

const fingerprintInputs = (row: PublicShareFingerprint | null) => {
    assert.ok(row);

    return JSON.stringify([
        row.publicId,
        row.displayName,
        row.revokedAt?.getTime() ?? null,
        row.shareUpdatedAt.getTime(),
        row.showUsername,
        resolvePublicUsername(row),
        row.payments,
        row.allowIndexing,
        row.showPayments,
        row.showPhone,
        row.showAddress,
        row.hasPhone,
        row.hasDeliveryAddress,
        row.visibleCount,
        row.lastUpdatedAt?.getTime() ?? null
    ]);
};

describe('share repository', () => {
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
    const createOwner = async (telegramId = ownerTelegramId) => {
        const created = await run(
            repositories.users.create({
                telegramId,
                username: `owner${telegramId}`,
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

    it('creates a lowercase ULID once and keeps it on repeated publishes', async () => {
        const owner = await createOwner();

        assert.equal(
            await run(repositories.shares.findActiveByUserId(owner.id)),
            null
        );

        const created = await run(
            repositories.shares.publish(
                owner.id,
                '  Alice Example  ',
                nextNow()
            )
        );

        assert.equal(isValidSharePublicId(created.publicId), true);
        assert.equal(created.publicId, created.publicId.toLowerCase());
        assert.equal(created.displayName, 'Alice Example');
        assert.equal(created.revokedAt, null);

        const repeated = await run(
            repositories.shares.publish(owner.id, 'Alice Example', nextNow())
        );

        assert.equal(repeated.publicId, created.publicId);
        assert.equal(repeated.updatedAt.getTime(), created.updatedAt.getTime());

        const renamed = await run(
            repositories.shares.publish(owner.id, 'Alice Renamed', nextNow())
        );

        assert.equal(renamed.publicId, created.publicId);
        assert.equal(renamed.displayName, 'Alice Renamed');
        assert.ok(renamed.updatedAt.getTime() > created.updatedAt.getTime());
        assert.deepEqual(
            await run(repositories.shares.findActiveByUserId(owner.id)),
            renamed
        );
    });

    it('stores at most 64 characters of the display name and null for blanks', async () => {
        const owner = await createOwner();
        const longName = '😀'.repeat(SHARE_DISPLAY_NAME_MAX_LENGTH + 10);

        const truncated = await run(
            repositories.shares.publish(owner.id, longName, nextNow())
        );

        assert.equal(
            Array.from(truncated.displayName ?? '').length,
            SHARE_DISPLAY_NAME_MAX_LENGTH
        );

        const blank = await run(
            repositories.shares.publish(owner.id, '   ', nextNow())
        );

        assert.equal(blank.displayName, null);
    });

    it('revokes, keeps the revoked row resolvable and re-activates the same link', async () => {
        const owner = await createOwner();
        const created = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );
        const revokedAt = nextNow();

        assert.equal(
            await run(repositories.shares.revoke(owner.id, revokedAt)),
            true
        );
        assert.equal(
            await run(repositories.shares.revoke(owner.id, nextNow())),
            false
        );
        assert.equal(
            await run(repositories.shares.findActiveByUserId(owner.id)),
            null
        );

        const revoked = await run(
            repositories.shares.findPublicFingerprint(created.publicId)
        );

        assert.equal(revoked?.revokedAt?.getTime(), revokedAt.getTime());
        assert.equal(revoked?.displayName, null);
        assert.equal(
            await run(repositories.shares.rotate(owner.id, nextNow())),
            null
        );

        const reshared = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );

        assert.equal(reshared.publicId, created.publicId);
        assert.equal(reshared.revokedAt, null);
        assert.equal(reshared.displayName, 'Alice');
    });

    it('keeps the username hidden by default and bumps updatedAt when it is toggled', async () => {
        const owner = await createOwner();
        const created = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );

        assert.equal(created.showUsername, false);

        const enabledAt = nextNow();
        const enabled = await run(
            repositories.shares.setShowUsername(owner.id, true, enabledAt)
        );

        assert.equal(enabled?.showUsername, true);
        assert.equal(enabled?.updatedAt.getTime(), enabledAt.getTime());
        assert.equal(enabled?.publicId, created.publicId);
        assert.equal(
            (
                await run(
                    repositories.shares.findPublicFingerprint(created.publicId)
                )
            )?.showUsername,
            true
        );

        const repeated = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );

        assert.equal(repeated.showUsername, true);

        const disabled = await run(
            repositories.shares.setShowUsername(owner.id, false, nextNow())
        );

        assert.equal(disabled?.showUsername, false);
    });

    it('does not toggle the username of a stopped share or of a missing share', async () => {
        const owner = await createOwner();
        const stranger = await createOwner(ownerTelegramId + 1);

        assert.equal(
            await run(
                repositories.shares.setShowUsername(owner.id, true, nextNow())
            ),
            null
        );

        await run(repositories.shares.publish(owner.id, 'Alice', nextNow()));
        await run(repositories.shares.revoke(owner.id, nextNow()));

        assert.equal(
            await run(
                repositories.shares.setShowUsername(owner.id, true, nextNow())
            ),
            null
        );
        assert.equal(
            await run(
                repositories.shares.setShowUsername(
                    stranger.id,
                    true,
                    nextNow()
                )
            ),
            null
        );
    });

    it('asks for the username consent again after stopping and sharing again', async () => {
        const owner = await createOwner();
        const created = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );

        await run(
            repositories.shares.setShowUsername(owner.id, true, nextNow())
        );
        await run(repositories.shares.revoke(owner.id, nextNow()));

        const revoked = await run(
            repositories.shares.findPublicFingerprint(created.publicId)
        );

        assert.equal(revoked?.showUsername, false);

        const reshared = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );

        assert.equal(reshared.publicId, created.publicId);
        assert.equal(reshared.showUsername, false);
    });

    it('rotates to a new public id and forgets the old one', async () => {
        const owner = await createOwner();
        const created = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );
        const rotated = await run(
            repositories.shares.rotate(owner.id, nextNow())
        );

        assert.ok(rotated);
        assert.notEqual(rotated.publicId, created.publicId);
        assert.equal(isValidSharePublicId(rotated.publicId), true);
        assert.equal(
            await run(
                repositories.shares.findPublicFingerprint(created.publicId)
            ),
            null
        );
        assert.equal(
            (
                await run(
                    repositories.shares.findPublicFingerprint(rotated.publicId)
                )
            )?.userId,
            owner.id
        );
    });

    it('counts only visible wishes and hides shares of blocked owners', async () => {
        const owner = await createOwner();
        const share = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );

        const empty = await run(
            repositories.shares.findPublicFingerprint(share.publicId)
        );

        assert.equal(empty?.visibleCount, 0);
        assert.equal(empty?.lastUpdatedAt, null);

        const visible = await createWish(owner.id, 'visible');
        const hidden = await createWish(owner.id, 'hidden');
        const removed = await createWish(owner.id, 'removed');

        await run(
            repositories.wishes.toggleHidden(hidden.id, owner.id, nextNow())
        );
        await run(
            repositories.wishes.softRemove(
                removed.id,
                owner.id,
                false,
                nextNow()
            )
        );

        const counted = await run(
            repositories.shares.findPublicFingerprint(share.publicId)
        );

        assert.equal(counted?.visibleCount, 1);
        assert.equal(
            counted?.lastUpdatedAt?.getTime(),
            visible.updatedAt.getTime()
        );
        assert.equal(counted?.username, owner.username);
        assert.equal(
            await run(
                repositories.shares.findPublicFingerprint(
                    '01k6g1y2z3a4b5c6d7e8f9g0hj'
                )
            ),
            null
        );

        await run(
            repositories.users.markBlockedByTelegramId(
                owner.telegramId,
                nextNow()
            )
        );

        assert.equal(
            await run(
                repositories.shares.findPublicFingerprint(share.publicId)
            ),
            null
        );
    });

    it('counts every visible gifted wish with the same total as the app count query', async () => {
        const owner = await createOwner();
        const share = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );
        const giftedTotal = APP_THIRD_PARTY_GIFTED_LIMIT + 5;

        await run(repositories.users.setShowGifted(owner.id, true, nextNow()));

        for (let index = 0; index < giftedTotal; index += 1) {
            const wish = await createWish(owner.id, `gifted ${index}`);

            await run(
                repositories.wishes.softRemove(
                    wish.id,
                    owner.id,
                    true,
                    nextNow()
                )
            );
        }

        const fingerprint = await run(
            repositories.shares.findPublicFingerprint(share.publicId)
        );
        const appCount = await run(
            repositories.wishes.countGiftedVisibleOf(owner.id, null)
        );

        assert.equal(fingerprint?.giftedCount, giftedTotal);
        assert.equal(fingerprint?.giftedCount, appCount);
    });

    it('changes the fingerprint inputs after every content mutation and only then', async () => {
        const owner = await createOwner();
        const giver = await createOwner(ownerTelegramId + 1);
        const first = await createWish(owner.id, 'first');
        let share = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );
        let previous = fingerprintInputs(
            await run(repositories.shares.findPublicFingerprint(share.publicId))
        );
        const expectChange = async (label: string) => {
            const current = fingerprintInputs(
                await run(
                    repositories.shares.findPublicFingerprint(share.publicId)
                )
            );

            assert.notEqual(current, previous, label);
            previous = current;
        };
        const expectNoChange = async (label: string) => {
            const current = fingerprintInputs(
                await run(
                    repositories.shares.findPublicFingerprint(share.publicId)
                )
            );

            assert.equal(current, previous, label);
        };

        const second = await createWish(owner.id, 'second');
        await expectChange('wishes.create');

        await run(
            repositories.wishes.updateFields(
                first.id,
                owner.id,
                { title: 'first renamed', price: 500 },
                nextNow()
            )
        );
        await expectChange('wishes.updateFields');

        await run(
            repositories.wishes.setPriorityLevel(
                first.id,
                owner.id,
                3,
                nextNow()
            )
        );
        await expectChange('wishes.setPriorityLevel');

        await run(
            repositories.wishes.toggleHidden(second.id, owner.id, nextNow())
        );
        await expectChange('wishes.toggleHidden (hide)');

        await run(
            repositories.wishes.toggleHidden(second.id, owner.id, nextNow())
        );
        await expectChange('wishes.toggleHidden (show)');

        await run(
            repositories.wishes.appendImage(
                first.id,
                owner.id,
                'file-1',
                nextNow()
            )
        );
        await expectChange('wishes.appendImage');

        await run(
            repositories.wishes.clearImages(first.id, owner.id, nextNow())
        );
        await expectChange('wishes.clearImages');

        await run(repositories.gives.add(giver.id, first.id, nextNow()));
        await expectNoChange('gives.add');

        await run(
            repositories.users.syncProfile(owner.id, {
                username: owner.username,
                telegramLanguageCode: owner.telegramLanguageCode,
                now: nextNow()
            })
        );
        await expectNoChange('users.syncProfile (last seen only)');

        await run(
            repositories.users.setPayments(owner.id, 'IBAN 1', nextNow())
        );
        await expectChange('users.setPayments');

        await run(
            repositories.users.setVisibility(
                owner.id,
                {
                    usernameSearchable: true,
                    phone: null,
                    phoneDigits: null,
                    username: owner.username
                },
                nextNow()
            )
        );
        await expectNoChange('users.setVisibility (username not enabled)');

        await run(
            repositories.shares.setShowUsername(owner.id, true, nextNow())
        );
        await expectChange('shares.setShowUsername (on)');

        await run(
            repositories.users.setVisibility(
                owner.id,
                {
                    usernameSearchable: false,
                    phone: null,
                    phoneDigits: null,
                    username: owner.username
                },
                nextNow()
            )
        );
        await expectChange('users.setVisibility (username hidden again)');

        await run(
            repositories.shares.setShowUsername(owner.id, false, nextNow())
        );
        await expectChange('shares.setShowUsername (off)');

        await run(
            repositories.wishes.softRemove(second.id, owner.id, true, nextNow())
        );
        await expectChange('wishes.softRemove');

        await run(repositories.wishes.softRemoveAll(owner.id, nextNow()));
        await expectChange('wishes.softRemoveAll');

        await run(repositories.shares.revoke(owner.id, nextNow()));
        await expectChange('shares.revoke');

        share = await run(
            repositories.shares.publish(owner.id, 'Alice', nextNow())
        );
        await expectChange('shares.publish (re-share)');

        const rotated = await run(
            repositories.shares.rotate(owner.id, nextNow())
        );

        assert.ok(rotated);
        share = rotated;
        await expectChange('shares.rotate');
    });
});
