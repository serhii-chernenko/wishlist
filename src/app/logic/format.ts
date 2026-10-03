import {
    DEFAULT_CURRENCY,
    formatDate,
    formatNumber,
    getLocaleTag
} from '../../bot/content/intl';
import type { AppLocale, PriceFilterDto } from '../../shared/app-api';

const WWW_PREFIX = /^www\./;

export type PriceFilterLabel =
    | { kind: 'all' }
    | { kind: 'upTo'; amount: string }
    | { kind: 'from'; amount: string }
    | { kind: 'range'; from: string; to: string };

export const formatPrice = (
    price: number,
    locale: AppLocale,
    currency: string | null | undefined
) => {
    return new Intl.NumberFormat(getLocaleTag(locale), {
        style: 'currency',
        currency: currency || DEFAULT_CURRENCY,
        currencyDisplay: 'narrowSymbol',
        ...(Number.isInteger(price) && { maximumFractionDigits: 0 })
    }).format(price);
};

export const formatCount = (value: number, locale: AppLocale) => {
    return formatNumber(value, locale);
};

export const formatIsoDate = (value: string, locale: AppLocale) => {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? '' : formatDate(date, locale);
};

const DOTTED_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const NOON_UTC_HOUR = 12;

/** Release dates come as DD.MM.YYYY from the changelog manifest; ISO strings are accepted too. Noon UTC keeps the calendar day in Kyiv time. */
export const parseReleaseDate = (value: string): Date | null => {
    const dotted = DOTTED_DATE_PATTERN.exec(value.trim());

    if (dotted !== null) {
        const [, day, month, year] = dotted.map(Number);
        const date = new Date(
            Date.UTC(year ?? 0, (month ?? 1) - 1, day, NOON_UTC_HOUR)
        );

        return date.getUTCDate() === day &&
            date.getUTCMonth() === (month ?? 1) - 1
            ? date
            : null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
};

export const formatReleaseDate = (value: string, locale: AppLocale) => {
    const date = parseReleaseDate(value);

    return date === null ? value : formatDate(date, locale);
};

export const describePriceFilter = (
    filter: PriceFilterDto,
    locale: AppLocale,
    currency: string | null | undefined
): PriceFilterLabel => {
    const money = (value: number) => formatPrice(value, locale, currency);

    if (filter.from !== null && filter.to !== null) {
        return {
            kind: 'range',
            from: money(filter.from),
            to: money(filter.to)
        };
    }

    if (filter.to !== null) {
        return { kind: 'upTo', amount: money(filter.to) };
    }

    return filter.from === null
        ? { kind: 'all' }
        : { kind: 'from', amount: money(filter.from) };
};

export const getLinkHost = (link: string | null | undefined) => {
    if (!link) {
        return null;
    }

    try {
        return new URL(link).hostname.replace(WWW_PREFIX, '') || null;
    } catch {
        return null;
    }
};

export const countCharacters = (value: string) => {
    return Array.from(value).length;
};

export const isNearLimit = (count: number, max: number) => {
    return max > 0 && count >= Math.ceil(max * 0.9);
};
