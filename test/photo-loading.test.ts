import assert from 'node:assert/strict';
import test from 'node:test';

import { EAGER_CARD_COUNT, getPhotoLoading } from '../src/shared/photo-loading';

test('only the first slide of the first cards loads eagerly', () => {
    for (let card = 0; card < EAGER_CARD_COUNT; card += 1) {
        assert.equal(getPhotoLoading(card, 0).loading, 'eager');
        assert.equal(getPhotoLoading(card, 1).loading, 'lazy');
        assert.equal(getPhotoLoading(card, 8).loading, 'lazy');
    }

    assert.equal(getPhotoLoading(EAGER_CARD_COUNT, 0).loading, 'lazy');
    assert.equal(getPhotoLoading(40, 0).loading, 'lazy');
});

test('only the very first photo is high priority', () => {
    assert.equal(getPhotoLoading(0, 0).fetchpriority, 'high');
    assert.equal('fetchpriority' in getPhotoLoading(0, 1), false);
    assert.equal('fetchpriority' in getPhotoLoading(1, 0), false);
    assert.equal('fetchpriority' in getPhotoLoading(10, 0), false);
});

test('every photo decodes asynchronously', () => {
    for (const [card, slide] of [
        [0, 0],
        [3, 0],
        [4, 0],
        [0, 5]
    ] as const) {
        assert.equal(getPhotoLoading(card, slide).decoding, 'async');
    }
});

test('a negative card index never loads eagerly', () => {
    assert.equal(getPhotoLoading(-1, 0).loading, 'lazy');
});
