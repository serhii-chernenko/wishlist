import { DEFAULT_CURRENCY, getLocaleTag } from '../bot/content/intl';
import type { AppLocale, PriceFilterDto, WishFilterValue } from './app-api';

export const CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN'] as const;

export type Currency = (typeof CURRENCIES)[number];

export type DisplayCurrency = Currency;

export const DEFAULT_CURRENCY_BY_LOCALE = {
    uk: 'UAH',
    en: 'EUR',
    pl: 'PLN'
} as const satisfies Record<AppLocale, Currency>;

export const RATE_PIVOT_CURRENCY = 'UAH' satisfies Currency;

export const CONVERTED_CURRENCIES = CURRENCIES.filter(currency => {
    return currency !== RATE_PIVOT_CURRENCY;
});

export interface ExchangeRates {
    date: string;
    perUnit: Record<Currency, number>;
}

export const FALLBACK_RATES: ExchangeRates = {
    date: '2026-10-04',
    perUnit: { UAH: 1, USD: 44.9857, EUR: 50.5333, PLN: 11.5442 }
};

export interface PriceRange {
    from: number | null;
    to: number | null;
}

export type PriceFilterRanges = Readonly<Record<WishFilterValue, PriceRange>>;

export const PRICE_FILTER_RANGES: Readonly<
    Record<Currency, PriceFilterRanges>
> = {
    UAH: {
        0: { from: null, to: 999 },
        1: { from: 1000, to: 1999 },
        2: { from: 2000, to: 4999 },
        3: { from: 5000, to: 9999 },
        4: { from: 10000, to: null }
    },
    USD: {
        0: { from: null, to: 19 },
        1: { from: 20, to: 39 },
        2: { from: 40, to: 99 },
        3: { from: 100, to: 199 },
        4: { from: 200, to: null }
    },
    EUR: {
        0: { from: null, to: 19 },
        1: { from: 20, to: 39 },
        2: { from: 40, to: 99 },
        3: { from: 100, to: 199 },
        4: { from: 200, to: null }
    },
    PLN: {
        0: { from: null, to: 99 },
        1: { from: 100, to: 199 },
        2: { from: 200, to: 499 },
        3: { from: 500, to: 999 },
        4: { from: 1000, to: null }
    }
};

export const WISH_FILTER_VALUES = [
    0, 1, 2, 3, 4
] as const satisfies readonly WishFilterValue[];

export interface PriceBounds {
    min: number | null;
    maxExclusive: number | null;
}

export type PriceBoundsByCurrency = Readonly<Record<Currency, PriceBounds>>;

export type PriceDisplay =
    | { kind: 'exact'; amount: string }
    | { kind: 'approximate'; amount: string; original: string };

const WHOLE_UNITS_THRESHOLD = 10;
const TENTHS = 10;
const APPROXIMATE_FRACTION_DIGITS = 1;
const MINIMUM_APPROXIMATE_AMOUNT = 0.1;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isCurrency = (value: unknown): value is Currency => {
    return CURRENCIES.some(currency => {
        return currency === value;
    });
};

export const getDefaultCurrency = (locale: AppLocale): Currency => {
    return DEFAULT_CURRENCY_BY_LOCALE[locale];
};

export const toWishCurrency = (value: string | null | undefined): Currency => {
    return isCurrency(value) ? value : DEFAULT_CURRENCY;
};

export const resolveDisplayCurrency = (
    userCurrency: string | null | undefined,
    locale: AppLocale
): Currency => {
    return isCurrency(userCurrency) ? userCurrency : getDefaultCurrency(locale);
};

const getUahPerUnit = (rates: ExchangeRates, currency: string) => {
    if (currency === RATE_PIVOT_CURRENCY) {
        return 1;
    }

    if (!isCurrency(currency)) {
        return null;
    }

    const rate = rates.perUnit[currency];

    return Number.isFinite(rate) && rate > 0 ? rate : null;
};

export const convert = (
    amount: number,
    from: string,
    to: string,
    rates: ExchangeRates
): number | null => {
    if (from === to) {
        return amount;
    }

    const fromRate = getUahPerUnit(rates, from);
    const toRate = getUahPerUnit(rates, to);

    if (fromRate === null || toRate === null) {
        return null;
    }

    return (amount * fromRate) / toRate;
};

export const roundApproximate = (amount: number) => {
    if (amount >= WHOLE_UNITS_THRESHOLD) {
        return Math.round(amount);
    }

    const rounded = Math.round(amount * TENTHS) / TENTHS;

    return amount > 0 && rounded === 0 ? MINIMUM_APPROXIMATE_AMOUNT : rounded;
};

export const formatMoney = (
    amount: number,
    locale: AppLocale,
    currency: string | null | undefined
) => {
    return new Intl.NumberFormat(getLocaleTag(locale), {
        style: 'currency',
        currency: currency || DEFAULT_CURRENCY,
        currencyDisplay: 'narrowSymbol',
        ...(Number.isInteger(amount) && {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })
    }).format(amount);
};

const formatApproximateMoney = (
    amount: number,
    locale: AppLocale,
    currency: Currency
) => {
    return new Intl.NumberFormat(getLocaleTag(locale), {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0,
        maximumFractionDigits: APPROXIMATE_FRACTION_DIGITS
    }).format(roundApproximate(amount));
};

export const describePrice = (
    price: number,
    wishCurrency: Currency,
    displayCurrency: Currency,
    locale: AppLocale,
    rates: ExchangeRates
): PriceDisplay => {
    const original = formatMoney(price, locale, wishCurrency);
    const converted =
        wishCurrency === displayCurrency
            ? null
            : convert(price, wishCurrency, displayCurrency, rates);

    if (converted === null) {
        return { kind: 'exact', amount: original };
    }

    return {
        kind: 'approximate',
        amount: formatApproximateMoney(converted, locale, displayCurrency),
        original
    };
};

export const isPriceConverted = (
    wishCurrency: Currency,
    displayCurrency: Currency,
    rates: ExchangeRates
) => {
    return (
        wishCurrency !== displayCurrency &&
        convert(1, wishCurrency, displayCurrency, rates) !== null
    );
};

export const getPriceFilterRange = (
    currency: Currency,
    filter: WishFilterValue
): PriceRange => {
    return PRICE_FILTER_RANGES[currency][filter];
};

export const getPriceFilterDtos = (currency: Currency): PriceFilterDto[] => {
    return WISH_FILTER_VALUES.map(filter => {
        return { filter, ...getPriceFilterRange(currency, filter) };
    });
};

const mapCurrencies = <Value>(
    build: (currency: Currency) => Value
): Record<Currency, Value> => {
    return Object.fromEntries(
        CURRENCIES.map(currency => {
            return [currency, build(currency)];
        })
    ) as Record<Currency, Value>;
};

export const getPriceFiltersByCurrency = (): Record<
    Currency,
    PriceFilterDto[]
> => {
    return mapCurrencies(getPriceFilterDtos);
};

/** Range bounds are exact in the viewer's currency and converted into the target currency with a half-open upper edge, so neighbouring ranges never leave a gap. */
export const toPriceBoundsInCurrency = (
    filter: WishFilterValue,
    viewerCurrency: Currency,
    targetCurrency: Currency,
    rates: ExchangeRates
): PriceBounds => {
    const range = getPriceFilterRange(viewerCurrency, filter);
    const toTargetAmount = (amount: number) => {
        return convert(amount, viewerCurrency, targetCurrency, rates) ?? amount;
    };

    return {
        min: range.from === null ? null : toTargetAmount(range.from),
        maxExclusive: range.to === null ? null : toTargetAmount(range.to + 1)
    };
};

export const toPriceBoundsByCurrency = (
    filter: WishFilterValue,
    viewerCurrency: Currency,
    rates: ExchangeRates
): PriceBoundsByCurrency => {
    return mapCurrencies(targetCurrency => {
        return toPriceBoundsInCurrency(
            filter,
            viewerCurrency,
            targetCurrency,
            rates
        );
    });
};

export const resolvePriceBounds = (
    filter: WishFilterValue | null,
    viewerCurrency: Currency,
    rates: ExchangeRates
): PriceBoundsByCurrency | null => {
    return filter === null
        ? null
        : toPriceBoundsByCurrency(filter, viewerCurrency, rates);
};

export const parseIsoDate = (value: string) => {
    const match = ISO_DATE_PATTERN.exec(value);

    if (match === null) {
        return null;
    }

    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day));

    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === (month ?? 1) - 1 &&
        date.getUTCDate() === day
        ? date
        : null;
};

export const formatRatesDate = (value: string, locale: AppLocale) => {
    const date = parseIsoDate(value);

    if (date === null) {
        return value;
    }

    return new Intl.DateTimeFormat(getLocaleTag(locale), {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
};

export const getCurrencySymbol = (
    locale: AppLocale,
    currency: string | null | undefined
) => {
    const code = currency || DEFAULT_CURRENCY;

    try {
        return (
            new Intl.NumberFormat(getLocaleTag(locale), {
                style: 'currency',
                currency: code,
                currencyDisplay: 'narrowSymbol'
            })
                .formatToParts(0)
                .find(part => part.type === 'currency')?.value ?? code
        );
    } catch {
        return code;
    }
};
