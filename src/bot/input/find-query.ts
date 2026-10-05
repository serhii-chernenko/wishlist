import type { AppLocale } from '../../shared/app-api';

export const MIN_INTERNATIONAL_PHONE_DIGITS = 11;
export const MAX_PHONE_DIGITS = 15;

const UKRAINIAN_NATIONAL_PHONE_DIGITS = 10;
const UKRAINIAN_TRUNK_PREFIX = '0';
const LOCAL_SUBSCRIBER_DIGITS = 9;
const UKRAINE_COUNTRY_CODE = '380';
const POLAND_COUNTRY_CODE = '48';
const PHONE_SHAPE = /^\+?[\d\s()-]+$/;

export interface SearcherRegion {
    locale: AppLocale;
    currency: string;
}

export type PhoneSearch =
    | { kind: 'none' }
    | { kind: 'digits'; digits: string }
    | { kind: 'needsCountryCode' };

export interface FindQuery {
    username: string | null;
    phone: PhoneSearch;
}

const inferCountryCode = ({ locale, currency }: SearcherRegion) => {
    if (locale === 'pl') {
        return POLAND_COUNTRY_CODE;
    }

    if (locale === 'uk') {
        return UKRAINE_COUNTRY_CODE;
    }

    if (currency === 'PLN') {
        return POLAND_COUNTRY_CODE;
    }

    if (currency === 'UAH') {
        return UKRAINE_COUNTRY_CODE;
    }

    return null;
};

const toPhoneSearch = (digits: string, region: SearcherRegion): PhoneSearch => {
    if (digits.length > MAX_PHONE_DIGITS) {
        return { kind: 'none' };
    }

    if (digits.length >= MIN_INTERNATIONAL_PHONE_DIGITS) {
        return { kind: 'digits', digits };
    }

    if (
        digits.length === UKRAINIAN_NATIONAL_PHONE_DIGITS &&
        digits.startsWith(UKRAINIAN_TRUNK_PREFIX)
    ) {
        return { kind: 'digits', digits: `38${digits}` };
    }

    if (digits.length === LOCAL_SUBSCRIBER_DIGITS) {
        const countryCode = inferCountryCode(region);

        if (countryCode !== null) {
            return { kind: 'digits', digits: `${countryCode}${digits}` };
        }
    }

    return { kind: 'needsCountryCode' };
};

export const parseFindQuery = (
    text: string | undefined,
    region: SearcherRegion
): FindQuery | null => {
    const raw = text?.trim() ?? '';

    if (!raw) {
        return null;
    }

    if (PHONE_SHAPE.test(raw)) {
        const digits = raw.replace(/\D/g, '');

        return {
            username: null,
            phone:
                digits === '' ? { kind: 'none' } : toPhoneSearch(digits, region)
        };
    }

    return {
        username: raw.replaceAll('@', '').trim() || null,
        phone: { kind: 'none' }
    };
};
