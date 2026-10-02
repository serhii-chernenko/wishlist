import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';

import type { Repositories, ShareRecord } from '../src/db/repositories';
import {
    buildAuthorName,
    canShowPublicUsername,
    createShareService,
    resolvePublicOrigin
} from '../src/bot/services/share-service';
import { CANONICAL_SHARE_ORIGIN } from '../src/web/share/public-id';

const now = new Date('2026-01-02T10:00:00Z');
const OWNER = { id: 7 };

const createShare = (overrides: Partial<ShareRecord> = {}): ShareRecord => {
    return {
        userId: OWNER.id,
        publicId: '01j9z0000000000000000000ab',
        displayName: 'Serhii',
        showUsername: false,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
};

interface FakeOptions {
    shareableCount?: number;
    stored?: ShareRecord | null;
    failOn?: 'hasShareable' | 'findActiveByUserId' | 'publish';
}

const createFakes = (options: FakeOptions = {}) => {
    const calls: string[] = [];
    let stored = options.stored ?? null;
    const fail = (method: string) => {
        calls.push(method);

        return options.failOn === method
            ? Effect.fail(new Error('database unavailable'))
            : null;
    };
    const repositories = {
        wishes: {
            hasShareable: () => {
                return (
                    fail('hasShareable') ??
                    Effect.succeed((options.shareableCount ?? 1) > 0)
                );
            }
        },
        shares: {
            findActiveByUserId: () => {
                return (
                    fail('findActiveByUserId') ??
                    Effect.succeed(stored?.revokedAt === null ? stored : null)
                );
            },
            publish: (
                _userId: number,
                displayName: string | null,
                at: Date
            ) => {
                const failure = fail('publish');

                if (failure) {
                    return failure;
                }

                stored = createShare({
                    ...stored,
                    displayName,
                    revokedAt: null,
                    updatedAt: at
                });

                return Effect.succeed(stored);
            },
            revoke: (_userId: number, at: Date) => {
                calls.push('revoke');

                if (stored === null || stored.revokedAt !== null) {
                    return Effect.succeed(false);
                }

                stored = {
                    ...stored,
                    revokedAt: at,
                    displayName: null,
                    showUsername: false
                };

                return Effect.succeed(true);
            },
            setShowUsername: (
                _userId: number,
                showUsername: boolean,
                at: Date
            ) => {
                calls.push('setShowUsername');

                if (stored === null || stored.revokedAt !== null) {
                    return Effect.succeed(null);
                }

                stored = { ...stored, showUsername, updatedAt: at };

                return Effect.succeed(stored);
            },
            rotate: (_userId: number, at: Date) => {
                calls.push('rotate');

                if (stored === null || stored.revokedAt !== null) {
                    return Effect.succeed(null);
                }

                stored = { ...stored, publicId: 'rotated', updatedAt: at };

                return Effect.succeed(stored);
            }
        }
    } as unknown as Pick<Repositories, 'wishes' | 'shares'>;

    return { repositories, calls };
};

test('publishing the first time creates the share with the given name', async () => {
    const { repositories } = createFakes();
    const outcome = await createShareService(repositories, () => now).publish(
        OWNER,
        'Serhii'
    );

    assert.equal(outcome.status, 'created');
    assert.ok('share' in outcome);
    assert.equal(outcome.share.displayName, 'Serhii');
});

test('publishing again with the same name reports the existing share', async () => {
    const { repositories } = createFakes({ stored: createShare() });
    const outcome = await createShareService(repositories, () => now).publish(
        OWNER,
        'Serhii'
    );

    assert.equal(outcome.status, 'existing');
});

test('publishing again with a changed name reports an update', async () => {
    const { repositories } = createFakes({ stored: createShare() });
    const outcome = await createShareService(repositories, () => now).publish(
        OWNER,
        'Serhii C.'
    );

    assert.equal(outcome.status, 'updated');
    assert.ok('share' in outcome);
    assert.equal(outcome.share.displayName, 'Serhii C.');
});

test('publishing after a stop restores the share as created', async () => {
    const { repositories } = createFakes({
        stored: createShare({ revokedAt: now, displayName: null })
    });
    const outcome = await createShareService(repositories, () => now).publish(
        OWNER,
        'Serhii'
    );

    assert.equal(outcome.status, 'created');
    assert.ok('share' in outcome);
    assert.equal(outcome.share.revokedAt, null);
    assert.equal(outcome.share.publicId, '01j9z0000000000000000000ab');
});

test('publishing without visible wishes is empty and writes nothing', async () => {
    const { repositories, calls } = createFakes({ shareableCount: 0 });
    const outcome = await createShareService(repositories, () => now).publish(
        OWNER,
        'Serhii'
    );

    assert.deepEqual(outcome, { status: 'empty' });
    assert.equal(calls.includes('publish'), false);
});

test('publishing an active share with no visible wishes keeps it manageable', async () => {
    const { repositories, calls } = createFakes({
        shareableCount: 0,
        stored: createShare()
    });
    const outcome = await createShareService(repositories, () => now).publish(
        OWNER,
        'Serhii'
    );

    assert.equal(outcome.status, 'existing');
    assert.ok('share' in outcome);
    assert.equal(outcome.pageEmpty, true);
    assert.equal(calls.includes('publish'), true);
});

test('re-activating a revoked share with no visible wishes is empty', async () => {
    const { repositories, calls } = createFakes({
        shareableCount: 0,
        stored: createShare({ revokedAt: now, displayName: null })
    });
    const outcome = await createShareService(repositories, () => now).publish(
        OWNER,
        'Serhii'
    );

    assert.deepEqual(outcome, { status: 'empty' });
    assert.equal(calls.includes('publish'), false);
});

test('repository failures propagate from publish', async () => {
    const { repositories } = createFakes({ failOn: 'publish' });

    await assert.rejects(
        createShareService(repositories, () => now).publish(OWNER, 'Serhii'),
        /database unavailable/
    );
});

test('the entry state tells shared, unshared and empty owners apart', async () => {
    const shared = createFakes({ stored: createShare() });
    const unshared = createFakes();
    const empty = createFakes({ shareableCount: 0 });
    const stopped = createFakes({
        stored: createShare({ revokedAt: now })
    });

    assert.equal(
        await createShareService(shared.repositories).getEntryState(OWNER.id),
        'shared'
    );
    assert.equal(
        await createShareService(unshared.repositories).getEntryState(OWNER.id),
        'unshared'
    );
    assert.equal(
        await createShareService(empty.repositories).getEntryState(OWNER.id),
        'empty'
    );
    assert.equal(
        await createShareService(stopped.repositories).getEntryState(OWNER.id),
        'unshared'
    );
});

test('getShare returns only an active share', async () => {
    const active = createFakes({ stored: createShare() });
    const revoked = createFakes({ stored: createShare({ revokedAt: now }) });

    assert.equal(
        (await createShareService(active.repositories).getShare(OWNER.id))
            ?.publicId,
        '01j9z0000000000000000000ab'
    );
    assert.equal(
        await createShareService(revoked.repositories).getShare(OWNER.id),
        null
    );
});

test('stop revokes an active share once', async () => {
    const { repositories } = createFakes({ stored: createShare() });
    const service = createShareService(repositories, () => now);

    assert.equal(await service.stop(OWNER.id), true);
    assert.equal(await service.stop(OWNER.id), false);
});

test('rotate replaces the public id of an active share only', async () => {
    const active = createFakes({ stored: createShare() });
    const none = createFakes();

    assert.equal(
        (await createShareService(active.repositories).rotate(OWNER.id))
            ?.publicId,
        'rotated'
    );
    assert.equal(
        await createShareService(none.repositories).rotate(OWNER.id),
        null
    );
});

test('buildAuthorName prefers the full name and falls back to the username', () => {
    assert.equal(
        buildAuthorName({ first_name: 'Ann', last_name: 'Lee', username: 'a' }),
        'Ann Lee'
    );
    assert.equal(buildAuthorName({ first_name: 'Ann' }), 'Ann');
    assert.equal(buildAuthorName({ username: 'ann' }), '@ann');
    assert.equal(buildAuthorName({}), '');
});

test('the public origin falls back to the canonical host only when missing', () => {
    assert.equal(resolvePublicOrigin(undefined), CANONICAL_SHARE_ORIGIN);
    assert.equal(
        resolvePublicOrigin('https://branch-wishlist.chernenko.workers.dev'),
        'https://branch-wishlist.chernenko.workers.dev'
    );
});

test('production always uses the canonical origin, other environments keep the webhook origin', () => {
    const webhookOrigin = 'https://branch-wishlist.chernenko.workers.dev';

    assert.equal(
        resolvePublicOrigin(webhookOrigin, 'production'),
        CANONICAL_SHARE_ORIGIN
    );
    assert.equal(
        resolvePublicOrigin(undefined, 'production'),
        CANONICAL_SHARE_ORIGIN
    );
    assert.equal(resolvePublicOrigin(webhookOrigin, 'preview'), webhookOrigin);
    assert.equal(resolvePublicOrigin(webhookOrigin, 'local'), webhookOrigin);
    assert.equal(
        resolvePublicOrigin(undefined, 'preview'),
        CANONICAL_SHARE_ORIGIN
    );
});

const SEARCHABLE_OWNER = {
    id: 7,
    username: 'serhii',
    usernameSearchable: true
};

test('only a searchable username counts as a public username', () => {
    assert.equal(canShowPublicUsername(SEARCHABLE_OWNER), true);
    assert.equal(
        canShowPublicUsername({
            ...SEARCHABLE_OWNER,
            usernameSearchable: false
        }),
        false
    );
    assert.equal(
        canShowPublicUsername({ ...SEARCHABLE_OWNER, username: null }),
        false
    );
    assert.equal(
        canShowPublicUsername({ ...SEARCHABLE_OWNER, username: '' }),
        false
    );
});

test('toggling the username flips it on and off and reports the change', async () => {
    const { repositories } = createFakes({ stored: createShare() });
    const service = createShareService(repositories, () => now);
    const enabled = await service.toggleUsername(SEARCHABLE_OWNER);
    const disabled = await service.toggleUsername(SEARCHABLE_OWNER);

    assert.equal(enabled?.changed, true);
    assert.equal(enabled?.share.showUsername, true);
    assert.equal(disabled?.changed, true);
    assert.equal(disabled?.share.showUsername, false);
});

test('toggling the username on is refused without a public username', async () => {
    const { repositories, calls } = createFakes({ stored: createShare() });
    const service = createShareService(repositories, () => now);
    const outcome = await service.toggleUsername({
        ...SEARCHABLE_OWNER,
        usernameSearchable: false
    });

    assert.equal(outcome?.changed, false);
    assert.equal(outcome?.share.showUsername, false);
    assert.equal(calls.includes('setShowUsername'), false);
});

test('toggling the username off is always allowed', async () => {
    const { repositories } = createFakes({
        stored: createShare({ showUsername: true })
    });
    const outcome = await createShareService(
        repositories,
        () => now
    ).toggleUsername({ ...SEARCHABLE_OWNER, username: null });

    assert.equal(outcome?.changed, true);
    assert.equal(outcome?.share.showUsername, false);
});

test('toggling the username without an active share does nothing', async () => {
    const { repositories, calls } = createFakes();
    const withoutShare = await createShareService(
        repositories,
        () => now
    ).toggleUsername(SEARCHABLE_OWNER);
    const stopped = createFakes({
        stored: createShare({ revokedAt: now, displayName: null })
    });
    const afterStop = await createShareService(
        stopped.repositories,
        () => now
    ).toggleUsername(SEARCHABLE_OWNER);

    assert.equal(withoutShare, null);
    assert.equal(afterStop, null);
    assert.equal(calls.includes('setShowUsername'), false);
});
