import type { AppLocale } from '../i18n';

export const KYIV_TIME_ZONE = 'Europe/Kyiv';

export const DEFAULT_CURRENCY = 'UAH';

const LOCALE_TAGS = {
    uk: 'uk-UA',
    en: 'en-GB',
    pl: 'pl-PL'
} as const satisfies Record<AppLocale, string>;

export type LocaleTag = (typeof LOCALE_TAGS)[AppLocale];

export const getLocaleTag = (locale: AppLocale): LocaleTag => {
    return LOCALE_TAGS[locale];
};

export const formatDate = (date: Date, locale: AppLocale) => {
    return new Intl.DateTimeFormat(getLocaleTag(locale), {
        timeZone: KYIV_TIME_ZONE,
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
};

export const getKyivDayKey = (date: Date) => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: KYIV_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
};

export const isSameKyivDay = (left: Date, right: Date) => {
    return getKyivDayKey(left) === getKyivDayKey(right);
};

export const formatCurrency = (
    value: number,
    locale: AppLocale,
    currency: string | null | undefined = DEFAULT_CURRENCY
) => {
    return new Intl.NumberFormat(getLocaleTag(locale), {
        style: 'currency',
        currency: currency || DEFAULT_CURRENCY,
        currencyDisplay: 'narrowSymbol'
    }).format(value);
};

export const formatNumber = (value: number, locale: AppLocale) => {
    return new Intl.NumberFormat(getLocaleTag(locale), {
        maximumFractionDigits: 0
    }).format(value);
};
