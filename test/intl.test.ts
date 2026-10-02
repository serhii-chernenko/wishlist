import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatCurrency,
    formatDate,
    formatNumber,
    getLocaleTag,
    isSameKyivDay
} from '../src/bot/content/intl';

const normalizeSpaces = (value: string) => {
    return value.replace(/[  ]/g, ' ');
};

test('locale tags map to uk-UA, en-GB and pl-PL', () => {
    assert.equal(getLocaleTag('uk'), 'uk-UA');
    assert.equal(getLocaleTag('en'), 'en-GB');
    assert.equal(getLocaleTag('pl'), 'pl-PL');
});

test('dates are rendered in the Europe/Kyiv time zone', () => {
    const lateEveningUtc = new Date('2024-08-16T22:30:00Z');

    assert.match(formatDate(lateEveningUtc, 'uk'), /^17 серпня 2024/);
    assert.equal(formatDate(lateEveningUtc, 'en'), '17 August 2024');
    assert.match(formatDate(lateEveningUtc, 'pl'), /^17 sierpnia 2024/);
});

test('Kyiv day comparison follows the local calendar day', () => {
    assert.ok(
        isSameKyivDay(
            new Date('2024-08-16T22:30:00Z'),
            new Date('2024-08-17T20:00:00Z')
        )
    );
    assert.ok(
        !isSameKyivDay(
            new Date('2024-08-16T20:30:00Z'),
            new Date('2024-08-16T21:30:00Z')
        )
    );
});

test('currency defaults to UAH and uses the locale format', () => {
    assert.equal(normalizeSpaces(formatCurrency(1000, 'uk')), '1 000,00 ₴');
    assert.equal(
        normalizeSpaces(formatCurrency(1000, 'uk', null)),
        '1 000,00 ₴'
    );
    assert.equal(
        normalizeSpaces(formatCurrency(1500, 'en', 'UAH')),
        'UAH 1,500.00'
    );
    assert.equal(
        normalizeSpaces(formatCurrency(2000, 'pl', 'UAH')),
        '2000,00 UAH'
    );
});

test('integers are grouped per locale', () => {
    assert.equal(normalizeSpaces(formatNumber(1202, 'uk')), '1 202');
    assert.equal(formatNumber(1202, 'en'), '1,202');
});
