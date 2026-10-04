import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';

import type { AppDb } from '../src/db/client';
import {
    chunk,
    D1_BOUND_PARAMETER_CEILING,
    DELETE_CHUNK_SIZE
} from '../src/db/repositories/chunk';
import { GIVERS_LOOKUP_CHUNK_SIZE } from '../src/db/repositories/give-repository';
import { createRepositories } from '../src/db/repositories';
import { RELEASE_ANNOUNCEMENT_INSERT_CHUNK_SIZE } from '../src/db/repositories/release-announcement-repository';
import { createTryDb } from '../src/db/repositories/try-db';

const expectedMethods: Record<string, string[]> = {
    users: [
        'findById',
        'findByTelegramId',
        'create',
        'syncProfile',
        'markAppSeen',
        'releaseUsernameHolder',
        'setVisibility',
        'setLanguage',
        'setPayments',
        'setWishlistFilter',
        'setCurrency',
        'setDeliveryAddress',
        'setDisclosure',
        'setShowGifted',
        'markBlockedByTelegramId',
        'clearBlocked',
        'findSearchable',
        'listBroadcastCandidates',
        'updateReleaseVersion',
        'updateTelegramId'
    ],
    wishes: [
        'create',
        'countActive',
        'listActiveImagesJson',
        'listReferencedFileIds',
        'findOwned',
        'findVisible',
        'listOwned',
        'listOwnedWithGifted',
        'listGiftedVisibleOf',
        'restoreGifted',
        'setGiftedHidden',
        'listVisibleOf',
        'hasShareable',
        'listShareable',
        'updateFields',
        'setPriorityLevel',
        'toggleHidden',
        'createWithFields',
        'setFlags',
        'removeImageAt',
        'replaceImages',
        'findImageFileId',
        'findViewerImageFileId',
        'findSharedWishImages',
        'appendImage',
        'clearImages',
        'softRemove',
        'softRemoveAll'
    ],
    gives: ['add', 'remove', 'removeAll', 'listForGiver', 'giversByWishIds'],
    sessions: [
        'get',
        'saveState',
        'setLanguage',
        'markMediaGroup',
        'readMediaGroupMarker',
        'clearMediaGroup',
        'clearWishReferences',
        'setPendingContact',
        'clearPendingContact',
        'pruneUpdatedBefore'
    ],
    telegramUpdates: [
        'claimUpdate',
        'terminalizeUpdate',
        'deleteProcessedBefore',
        'deleteAbandonedProcessingBefore'
    ],
    releaseAnnouncements: [
        'listUsersWithoutAnnouncement',
        'insertQueuedAnnouncements',
        'deleteQueuedAnnouncements',
        'findAnnouncement',
        'markSent',
        'claimForSending',
        'markSkipped',
        'releaseToQueue',
        'markFailed',
        'requeueStaleQueued',
        'skipStuckSending'
    ],
    stats: ['publicStats', 'snapshot'],
    shares: [
        'findActiveByUserId',
        'publish',
        'revoke',
        'rotate',
        'setShowUsername',
        'setAllowIndexing',
        'findPublicFingerprint'
    ],
    exchangeRates: ['listAll', 'upsertMany']
};

test('createRepositories exposes exactly the contracted repositories and methods', () => {
    const repositories = createRepositories({} as AppDb) as Record<
        string,
        Record<string, unknown>
    >;

    assert.deepEqual(
        Object.keys(repositories).sort(),
        Object.keys(expectedMethods).sort()
    );

    for (const [name, methods] of Object.entries(expectedMethods)) {
        assert.deepEqual(
            Object.keys(repositories[name] ?? {}).sort(),
            [...methods].sort(),
            name
        );
    }
});

test('repository failures are wrapped with the repository name', async () => {
    const tryDb = createTryDb('Example repository');

    const failure = await Effect.runPromise(
        Effect.flip(
            tryDb(async () => {
                throw new Error('boom');
            })
        )
    );

    assert.equal(failure.message, 'Example repository failure');
    assert.equal((failure.cause as Error).message, 'boom');
    assert.equal(await Effect.runPromise(tryDb(async () => 7)), 7);
});

test('chunk sizes keep every bound-parameter list under the D1 ceiling', () => {
    assert.equal(D1_BOUND_PARAMETER_CEILING, 100);
    assert.ok(GIVERS_LOOKUP_CHUNK_SIZE < D1_BOUND_PARAMETER_CEILING);
    assert.ok(DELETE_CHUNK_SIZE < D1_BOUND_PARAMETER_CEILING);
    assert.ok(RELEASE_ANNOUNCEMENT_INSERT_CHUNK_SIZE * 6 <= 100);
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunk([], 90), []);
    assert.equal(
        chunk(
            Array.from({ length: 250 }, (_, index) => index),
            GIVERS_LOOKUP_CHUNK_SIZE
        ).length,
        3
    );
});
