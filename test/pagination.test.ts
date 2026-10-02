import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getPageWindow,
    normalizeOffset,
    WISHES_PAGE_SIZE
} from '../src/bot/content/pagination';

test('page size is ten wishes', () => {
    assert.equal(WISHES_PAGE_SIZE, 10);
});

test('first page of a long list offers the next offset', () => {
    assert.deepEqual(getPageWindow(0, 10, 25), {
        offset: 0,
        firstPosition: 1,
        lastPosition: 10,
        total: 25,
        hasMore: true,
        nextOffset: 10,
        isFirstPage: true,
        isPaginated: true
    });
});

test('last page has no more button', () => {
    const window = getPageWindow(20, 5, 25);

    assert.equal(window.hasMore, false);
    assert.equal(window.nextOffset, null);
    assert.equal(window.firstPosition, 21);
    assert.equal(window.lastPosition, 25);
    assert.equal(window.isFirstPage, false);
});

test('a list of exactly one page is not paginated', () => {
    const window = getPageWindow(0, 10, 10);

    assert.equal(window.hasMore, false);
    assert.equal(window.isPaginated, false);
});

test('an empty page reports zero positions', () => {
    const window = getPageWindow(0, 0, 0);

    assert.equal(window.firstPosition, 0);
    assert.equal(window.lastPosition, 0);
    assert.equal(window.hasMore, false);
});

test('normalizeOffset clamps stale offsets to the last page', () => {
    assert.equal(normalizeOffset(0, 25), 0);
    assert.equal(normalizeOffset(10, 25), 10);
    assert.equal(normalizeOffset(30, 25), 20);
    assert.equal(normalizeOffset(500, 10), 0);
    assert.equal(normalizeOffset(-5, 25), 0);
    assert.equal(normalizeOffset(Number.NaN, 25), 0);
    assert.equal(normalizeOffset(10, 0), 0);
});
