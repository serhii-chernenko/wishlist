import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyPointerGesture,
    nearestSlideIndex,
    SWIPE_SLOP_PX
} from '../src/app/logic/photo-carousel';

const SLIDE_WIDTH = 160;

test('the active slide follows the scroll position and snaps to the nearest one', () => {
    assert.equal(nearestSlideIndex(0, SLIDE_WIDTH, 5), 0);
    assert.equal(nearestSlideIndex(79, SLIDE_WIDTH, 5), 0);
    assert.equal(nearestSlideIndex(80, SLIDE_WIDTH, 5), 1);
    assert.equal(nearestSlideIndex(SLIDE_WIDTH * 2, SLIDE_WIDTH, 5), 2);
    assert.equal(nearestSlideIndex(SLIDE_WIDTH * 4, SLIDE_WIDTH, 5), 4);
});

test('overscroll and degenerate sizes clamp to a valid slide', () => {
    assert.equal(nearestSlideIndex(SLIDE_WIDTH * 9, SLIDE_WIDTH, 5), 4);
    assert.equal(nearestSlideIndex(-5, SLIDE_WIDTH, 5), 0);
    assert.equal(nearestSlideIndex(300, 0, 5), 0);
    assert.equal(nearestSlideIndex(300, SLIDE_WIDTH, 0), 0);
});

test('right-to-left scroll offsets are negative and still resolve', () => {
    assert.equal(nearestSlideIndex(-SLIDE_WIDTH * 3, SLIDE_WIDTH, 5), 3);
});

test('a stationary press is a tap', () => {
    const point = { x: 100, y: 50, scrollLeft: 0 };

    assert.equal(classifyPointerGesture(point, point), 'tap');
    assert.equal(
        classifyPointerGesture(point, { ...point, x: 100 + SWIPE_SLOP_PX }),
        'tap'
    );
});

test('a horizontal drag is a swipe', () => {
    const start = { x: 100, y: 50, scrollLeft: 0 };

    assert.equal(
        classifyPointerGesture(start, { ...start, x: 100 - 60 }),
        'swipe'
    );
});

test('any vertical travel beyond the slop is not a tap', () => {
    const start = { x: 100, y: 50, scrollLeft: 0 };

    assert.equal(
        classifyPointerGesture(start, { ...start, y: 50 + SWIPE_SLOP_PX + 1 }),
        'swipe'
    );
});

test('a press that scrolled the carousel is a swipe even without pointer travel', () => {
    const start = { x: 100, y: 50, scrollLeft: 0 };

    assert.equal(
        classifyPointerGesture(start, { ...start, scrollLeft: 160 }),
        'swipe'
    );
});
