import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clampSlideIndex,
    slideScrollOffset
} from '../src/app/logic/photo-viewer';

const SLIDE_WIDTH = 390;

test('the viewer starts on the tapped slide and clamps out-of-range indexes', () => {
    assert.equal(clampSlideIndex(0, 4), 0);
    assert.equal(clampSlideIndex(2, 4), 2);
    assert.equal(clampSlideIndex(3, 4), 3);
    assert.equal(clampSlideIndex(4, 4), 3);
    assert.equal(clampSlideIndex(-1, 4), 0);
});

test('fractional, non-finite and empty inputs fall back to a valid index', () => {
    assert.equal(clampSlideIndex(1.9, 4), 1);
    assert.equal(clampSlideIndex(Number.NaN, 4), 0);
    assert.equal(clampSlideIndex(Number.POSITIVE_INFINITY, 4), 0);
    assert.equal(clampSlideIndex(2, 0), 0);
});

test('the scroll offset of a slide is its index times the strip width', () => {
    assert.equal(slideScrollOffset(0, SLIDE_WIDTH, 4), 0);
    assert.equal(slideScrollOffset(2, SLIDE_WIDTH, 4), SLIDE_WIDTH * 2);
    assert.equal(slideScrollOffset(9, SLIDE_WIDTH, 4), SLIDE_WIDTH * 3);
    assert.equal(slideScrollOffset(-3, SLIDE_WIDTH, 4), 0);
});

test('a strip that has no width yet scrolls nowhere', () => {
    assert.equal(slideScrollOffset(2, 0, 4), 0);
    assert.equal(slideScrollOffset(2, -10, 4), 0);
});
