import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePriceWithCurrency } from '../src/bot/input/price';

const removeLabels = ['❌ Видалити', '❌ Remove', '❌ Usuń'];

const cases = [
    ['1500 ₴', 1500, 'UAH'],
    ['₴1500', 1500, 'UAH'],
    ['1500 грн', 1500, 'UAH'],
    ['1500 грн.', 1500, 'UAH'],
    ['1500грн', 1500, 'UAH'],
    ['1500 гривень', 1500, 'UAH'],
    ['1500 UAH', 1500, 'UAH'],
    ['uah 1500', 1500, 'UAH'],
    ['1500 hrn', 1500, 'UAH'],
    ['$20', 20, 'USD'],
    ['20 $', 20, 'USD'],
    ['20 usd', 20, 'USD'],
    ['USD 20', 20, 'USD'],
    ['20 дол', 20, 'USD'],
    ['20 доларів', 20, 'USD'],
    ['€99,50', 100, 'EUR'],
    ['99 EUR', 99, 'EUR'],
    ['99 євро', 99, 'EUR'],
    ['99 euro', 99, 'EUR'],
    ['100 zł', 100, 'PLN'],
    ['100 ZŁ', 100, 'PLN'],
    ['100 zl', 100, 'PLN'],
    ['100 pln', 100, 'PLN'],
    ['100 злотих', 100, 'PLN'],
    ['1 500 ₴', 1500, 'UAH'],
    ['1.500,50 €', 1501, 'EUR']
] as const;

for (const [input, value, currency] of cases) {
    test(`parsePriceWithCurrency reads "${input}" as ${value} ${currency}`, () => {
        assert.deepEqual(parsePriceWithCurrency(input, removeLabels), {
            ok: true,
            value,
            currency
        });
    });
}

test('parsePriceWithCurrency leaves the currency unset for a bare number', () => {
    assert.deepEqual(parsePriceWithCurrency('1500', removeLabels), {
        ok: true,
        value: 1500,
        currency: null
    });
    assert.deepEqual(parsePriceWithCurrency('1 500,4', removeLabels), {
        ok: true,
        value: 1500,
        currency: null
    });
});

test('parsePriceWithCurrency maps every remove label to zero without a currency', () => {
    for (const label of removeLabels) {
        assert.deepEqual(parsePriceWithCurrency(label, removeLabels), {
            ok: true,
            value: 0,
            currency: null
        });
    }
});

test('parsePriceWithCurrency rejects a marker without a number and other junk', () => {
    for (const input of ['₴', 'грн', '$', 'zł', 'abc', '', '-5 ₴']) {
        assert.deepEqual(
            parsePriceWithCurrency(input, removeLabels),
            { ok: false, reason: 'invalid' },
            input
        );
    }

    assert.deepEqual(parsePriceWithCurrency(undefined, removeLabels), {
        ok: false,
        reason: 'invalid'
    });
    assert.deepEqual(parsePriceWithCurrency('1000000001 ₴', removeLabels), {
        ok: false,
        reason: 'invalid'
    });
});
