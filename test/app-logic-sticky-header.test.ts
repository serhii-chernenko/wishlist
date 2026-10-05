import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isPastStickyEdge,
    learnStickyFullHeight
} from '../src/app/logic/sticky-header';

test('the sticky edge is crossed only once the sentinel is above the viewport', () => {
    assert.equal(isPastStickyEdge({ isIntersecting: true, top: 10 }), false);
    assert.equal(isPastStickyEdge({ isIntersecting: false, top: -2 }), true);
    assert.equal(isPastStickyEdge({ isIntersecting: false, top: 900 }), false);
});

test('the full header height is learned only while expanded', () => {
    assert.equal(learnStickyFullHeight(0, 206, 'unstuck'), 206);
    assert.equal(learnStickyFullHeight(206, 180, 'unstuck'), 180);
});

test('the full header height never shrinks while the header is compact', () => {
    assert.equal(learnStickyFullHeight(206, 89, 'stuck'), 206);
    assert.equal(learnStickyFullHeight(206, 300, 'stuck'), 206);
});

test('the full header height only grows while the header expands back', () => {
    assert.equal(learnStickyFullHeight(206, 89, 'settling'), 206);
    assert.equal(learnStickyFullHeight(206, 150, 'settling'), 206);
    assert.equal(learnStickyFullHeight(206, 230, 'settling'), 230);
});
