import assert from 'node:assert/strict';
import test from 'node:test';

import { getMessages } from '../src/bot/content/messages';
import type { BotRequest } from '../src/bot/runtime/types';
import { formatWishPrice } from '../src/bot/services/wish-screen-context';
import {
    describePriceFilter,
    getApproximateDraftPrice,
    selectPriceFilters
} from '../src/app/logic/format';
import {
    convert,
    describePrice,
    DISPLAY_CURRENCY_BY_LOCALE,
    FALLBACK_RATES,
    formatMoney,
    formatRatesDate,
    getPriceFiltersByCurrency,
    isPriceConverted,
    PRICE_FILTER_RANGES,
    roundApproximate,
    toOwnerPriceBounds,
    WISH_FILTER_VALUES,
    type DisplayCurrency,
    type ExchangeRates
} from '../src/shared/money';

const RATES: ExchangeRates = {
    date: '2026-10-05',
    perUnit: { UAH: 1, EUR: 50, PLN: 12.5 }
};

const normalizeSpaces = (value: string) => {
    return value.replace(/[  ]/g, ' ');
};

test('every locale maps to its display currency', () => {
    assert.deepEqual(DISPLAY_CURRENCY_BY_LOCALE, {
        uk: 'UAH',
        en: 'EUR',
        pl: 'PLN'
    });
});

test('convert pivots through the hryvnia for any pair', () => {
    assert.equal(convert(1000, 'UAH', 'EUR', RATES), 20);
    assert.equal(convert(20, 'EUR', 'UAH', RATES), 1000);
    assert.equal(convert(10, 'EUR', 'PLN', RATES), 40);
    assert.equal(convert(40, 'PLN', 'EUR', RATES), 10);
});

test('convert keeps the same currency exact and rejects unknown rates', () => {
    assert.equal(convert(999, 'UAH', 'UAH', RATES), 999);
    assert.equal(convert(5, 'USD', 'USD', RATES), 5);
    assert.equal(convert(5, 'USD', 'EUR', RATES), null);
    assert.equal(
        convert(5, 'UAH', 'EUR', {
            ...RATES,
            perUnit: { ...RATES.perUnit, EUR: 0 }
        }),
        null
    );
});

test('approximate amounts round to whole units from ten and to tenths below', () => {
    assert.equal(roundApproximate(19.79), 20);
    assert.equal(roundApproximate(10), 10);
    assert.equal(roundApproximate(9.96), 10);
    assert.equal(roundApproximate(9.94), 9.9);
    assert.equal(roundApproximate(2.04), 2);
    assert.equal(roundApproximate(0.04), 0.1);
    assert.equal(roundApproximate(0), 0);
});

test('money formatting drops the fraction of whole amounts only', () => {
    assert.equal(formatMoney(20, 'en', 'EUR'), '€20');
    assert.equal(formatMoney(2.5, 'en', 'EUR'), '€2.50');
    assert.equal(normalizeSpaces(formatMoney(1000, 'uk', 'UAH')), '1 000 ₴');
    assert.equal(normalizeSpaces(formatMoney(87, 'pl', 'PLN')), '87 zł');
});

test('1000 hryvnias render as about 20 euros for English, never 1000 euros', () => {
    const display = describePrice(1000, 'UAH', 'en', FALLBACK_RATES);

    assert.deepEqual(display, {
        kind: 'approximate',
        amount: '€20',
        original: '₴1,000'
    });
});

test('same currency prices stay exact and unmarked', () => {
    const display = describePrice(999, 'UAH', 'uk', FALLBACK_RATES);

    assert.equal(display.kind, 'exact');
    assert.equal(normalizeSpaces(display.amount), '999 ₴');
    assert.equal(isPriceConverted('UAH', 'uk', FALLBACK_RATES), false);
    assert.equal(isPriceConverted('UAH', 'en', FALLBACK_RATES), true);
});

test('an owner currency without a rate falls back to the exact price', () => {
    assert.deepEqual(describePrice(15, 'USD', 'en', FALLBACK_RATES), {
        kind: 'exact',
        amount: '$15'
    });
});

test('small converted amounts keep one decimal and never show zero', () => {
    assert.equal(describePrice(1, 'UAH', 'en', FALLBACK_RATES).amount, '€0.1');
    assert.equal(describePrice(125, 'UAH', 'en', RATES).amount, '€2.5');
    assert.equal(describePrice(250, 'UAH', 'en', RATES).amount, '€5');
    assert.equal(describePrice(498, 'UAH', 'en', RATES).amount, '€10');
});

test('the bot renders converted prices with the original in parentheses', () => {
    const req = {
        locale: 'en',
        LL: getMessages('en'),
        rates: FALLBACK_RATES
    } as unknown as BotRequest;

    assert.equal(formatWishPrice(req, 1000, 'UAH'), '≈ €20 (₴1,000)');
    assert.equal(
        normalizeSpaces(
            formatWishPrice(
                {
                    ...req,
                    locale: 'uk',
                    LL: getMessages('uk')
                } as BotRequest,
                1000,
                'UAH'
            )
        ),
        '1 000 ₴'
    );
});

test('the app editor shows a live approximation only for another display currency', () => {
    assert.equal(
        getApproximateDraftPrice('1000', 'UAH', 'en', FALLBACK_RATES),
        '€20'
    );
    assert.equal(
        getApproximateDraftPrice('1000', 'UAH', 'uk', FALLBACK_RATES),
        null
    );
    assert.equal(
        getApproximateDraftPrice('', 'UAH', 'en', FALLBACK_RATES),
        null
    );
    assert.equal(
        getApproximateDraftPrice('abc', 'UAH', 'en', FALLBACK_RATES),
        null
    );
});

test('every currency has five gapless filter ranges', () => {
    for (const ranges of Object.values(PRICE_FILTER_RANGES)) {
        assert.equal(ranges[0].from, null);
        assert.equal(ranges[4].to, null);

        for (const filter of WISH_FILTER_VALUES.slice(1)) {
            assert.equal(
                (ranges[(filter - 1) as 0 | 1 | 2 | 3].to ?? 0) + 1,
                ranges[filter].from
            );
        }
    }

    assert.deepEqual(
        getPriceFiltersByCurrency().EUR.map(filter => {
            return [filter.from, filter.to];
        }),
        [
            [null, 19],
            [20, 39],
            [40, 99],
            [100, 199],
            [200, null]
        ]
    );
    assert.deepEqual(
        getPriceFiltersByCurrency().PLN.map(filter => {
            return [filter.from, filter.to];
        }),
        [
            [null, 99],
            [100, 199],
            [200, 499],
            [500, 999],
            [1000, null]
        ]
    );
});

test('hryvnia bounds for hryvnia viewers match the legacy inclusive ranges', () => {
    assert.deepEqual(toOwnerPriceBounds(0, 'UAH', 'UAH', FALLBACK_RATES), {
        min: null,
        maxExclusive: 1000
    });
    assert.deepEqual(toOwnerPriceBounds(1, 'UAH', 'UAH', FALLBACK_RATES), {
        min: 1000,
        maxExclusive: 2000
    });
    assert.deepEqual(toOwnerPriceBounds(4, 'UAH', 'UAH', FALLBACK_RATES), {
        min: 10000,
        maxExclusive: null
    });
});

test('euro bounds convert into the owner currency with a half-open upper edge', () => {
    const first = toOwnerPriceBounds(0, 'EUR', 'UAH', RATES);
    const second = toOwnerPriceBounds(1, 'EUR', 'UAH', RATES);
    const isIn = (
        price: number,
        bounds: ReturnType<typeof toOwnerPriceBounds>
    ) => {
        return (
            (bounds.min === null || price >= bounds.min) &&
            (bounds.maxExclusive === null || price < bounds.maxExclusive)
        );
    };

    assert.deepEqual(first, { min: null, maxExclusive: 1000 });
    assert.deepEqual(second, { min: 1000, maxExclusive: 2000 });
    assert.equal(isIn(970, first), true);
    assert.equal(isIn(970, second), false);
    assert.equal(isIn(999.9, first), true);
    assert.equal(isIn(1000, second), true);

    const fallbackFirst = toOwnerPriceBounds(0, 'EUR', 'UAH', FALLBACK_RATES);
    const fallbackSecond = toOwnerPriceBounds(1, 'EUR', 'UAH', FALLBACK_RATES);

    assert.equal(isIn(980, fallbackFirst), true);
    assert.equal(isIn(980, fallbackSecond), false);
});

test('unknown owner currencies keep the viewer bounds unconverted', () => {
    assert.deepEqual(toOwnerPriceBounds(1, 'EUR', 'USD', RATES), {
        min: 20,
        maxExclusive: 40
    });
});

test('app filter labels pick the locale currency and stay exact', () => {
    const filters = getPriceFiltersByCurrency();
    const labels = (locale: 'uk' | 'en' | 'pl') => {
        return selectPriceFilters(filters, locale).map(filter => {
            return describePriceFilter(filter, locale);
        });
    };
    const currencies: Record<'uk' | 'en' | 'pl', DisplayCurrency> = {
        uk: 'UAH',
        en: 'EUR',
        pl: 'PLN'
    };

    assert.deepEqual(labels('en')[0], { kind: 'upTo', amount: '€19' });
    assert.deepEqual(labels('en')[4], { kind: 'from', amount: '€200' });
    assert.equal(
        normalizeSpaces(
            (labels('pl')[1] as { kind: 'range'; from: string }).from
        ),
        '100 zł'
    );

    for (const locale of ['uk', 'en', 'pl'] as const) {
        assert.equal(
            selectPriceFilters(filters, locale),
            filters[currencies[locale]]
        );
    }
});

test('rate dates are formatted per locale', () => {
    assert.equal(formatRatesDate('2026-10-05', 'uk'), '5 жовтня 2026 р.');
    assert.equal(formatRatesDate('2026-10-05', 'en'), '5 October 2026');
    assert.equal(formatRatesDate('2026-10-05', 'pl'), '5 października 2026');
    assert.equal(formatRatesDate('bad', 'en'), 'bad');
});
