import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getFilterMarker,
    getFilterTitle,
    isWishFilter,
    toWishFilter,
    WISH_FILTERS
} from '../src/bot/content/filters';
import { i18nObject } from '../src/i18n/i18n-util';
import { loadAllLocales } from '../src/i18n/i18n-util.sync';
import { getPriceFilterRange } from '../src/shared/money';

loadAllLocales();
const LL = i18nObject('uk');
const normalizeSpaces = (value: string) => {
    return value.replace(/[\u00a0\u202f]/g, ' ');
};

test('five price filters cover the legacy hryvnia ranges', () => {
    assert.deepEqual(
        WISH_FILTERS.map(filter => {
            return getPriceFilterRange('UAH', filter);
        }),
        [
            { from: null, to: 999 },
            { from: 1000, to: 1999 },
            { from: 2000, to: 4999 },
            { from: 5000, to: 9999 },
            { from: 10000, to: null }
        ]
    );
});

test('filter titles use the open-ended and bounded translations', () => {
    assert.equal(normalizeSpaces(getFilterTitle(LL, 'uk', 0)), 'До 999 ₴');
    assert.equal(
        normalizeSpaces(getFilterTitle(LL, 'uk', 1)),
        'Від 1 000 ₴ до 1 999 ₴'
    );
    assert.equal(normalizeSpaces(getFilterTitle(LL, 'uk', 4)), 'Від 10 000 ₴');
});

test('filter titles use the display currency of the locale with exact amounts', () => {
    assert.equal(getFilterTitle(i18nObject('en'), 'en', 0), 'Up to €19');
    assert.equal(
        normalizeSpaces(getFilterTitle(i18nObject('pl'), 'pl', 4)),
        'Od 1000 zł'
    );
});

test('isWishFilter and toWishFilter accept only 0 to 4', () => {
    assert.equal(isWishFilter(0), true);
    assert.equal(isWishFilter(4), true);
    assert.equal(isWishFilter(5), false);
    assert.equal(isWishFilter(-1), false);
    assert.equal(isWishFilter(1.5), false);
    assert.equal(isWishFilter('1'), false);
    assert.equal(toWishFilter(3), 3);
    assert.equal(toWishFilter(null), null);
    assert.equal(toWishFilter(undefined), null);
    assert.equal(toWishFilter(9), null);
});

test('filter marker is green only when a filter is applied', () => {
    assert.equal(getFilterMarker(null), '🔴');
    assert.equal(getFilterMarker(0), '🟢');
    assert.equal(getFilterMarker(4), '🟢');
});
