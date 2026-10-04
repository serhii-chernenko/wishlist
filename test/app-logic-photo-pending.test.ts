import assert from 'node:assert/strict';
import test from 'node:test';

import {
    hasPendingPhotos,
    nextPhotoPollDelay
} from '../src/app/logic/photo-pending';
import {
    APP_PHOTO_PENDING_POLL_INTERVAL_MS,
    APP_PHOTO_PENDING_POLL_TIMEOUT_MS
} from '../src/shared/app-api';

test('the polling constants are ten seconds for two minutes', () => {
    assert.equal(APP_PHOTO_PENDING_POLL_INTERVAL_MS, 10_000);
    assert.equal(APP_PHOTO_PENDING_POLL_TIMEOUT_MS, 120_000);
});

test('only a wish flagged photoPending counts as a pending photo', () => {
    assert.equal(hasPendingPhotos([]), false);
    assert.equal(hasPendingPhotos([{}, { photoPending: false }]), false);
    assert.equal(hasPendingPhotos([{}, { photoPending: true }]), true);
});

test('polling refreshes every ten seconds and stops after two minutes', () => {
    assert.equal(nextPhotoPollDelay(0), APP_PHOTO_PENDING_POLL_INTERVAL_MS);
    assert.equal(
        nextPhotoPollDelay(60_000),
        APP_PHOTO_PENDING_POLL_INTERVAL_MS
    );
    assert.equal(
        nextPhotoPollDelay(APP_PHOTO_PENDING_POLL_TIMEOUT_MS - 10_000),
        APP_PHOTO_PENDING_POLL_INTERVAL_MS
    );
    assert.equal(nextPhotoPollDelay(APP_PHOTO_PENDING_POLL_TIMEOUT_MS), null);
    assert.equal(
        nextPhotoPollDelay(APP_PHOTO_PENDING_POLL_TIMEOUT_MS - 1),
        null
    );
});

test('twelve refreshes fit in the polling period', () => {
    let elapsed = 0;
    let refreshes = 0;

    for (let delay = nextPhotoPollDelay(elapsed); delay !== null; ) {
        elapsed += delay;
        refreshes += 1;
        delay = nextPhotoPollDelay(elapsed);
    }

    assert.equal(refreshes, 12);
    assert.equal(elapsed, APP_PHOTO_PENDING_POLL_TIMEOUT_MS);
});
