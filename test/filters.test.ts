import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getFilterMarker,
    getFilterTitle,
    getPriceRange,
    isWishFilter,
    toWishFilter,
    WISH_FILTERS
} from '../src/bot/content/filters';
import { i18nObject } from '../src/i18n/i18n-util';
import { loadLocale } from '../src/i18n/i18n-util.sync';

loadLocale('uk');
const LL = i18nObject('uk');
const formatMoney = (value: number) => {
    return `₴${value}`;
};

test('five price filters cover the legacy ranges', () => {
    assert.deepEqual(
        WISH_FILTERS.map(filter => {
            return getPriceRange(filter);
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
    assert.equal(getFilterTitle(LL, 0, formatMoney), 'До ₴999');
    assert.equal(getFilterTitle(LL, 1, formatMoney), 'Від ₴1000 до ₴1999');
    assert.equal(getFilterTitle(LL, 4, formatMoney), 'Від ₴10000');
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
