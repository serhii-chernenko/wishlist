import { isCurrency } from '../shared/money';
import type { WebCurrencyChoice } from './share/view-model';

export const WEB_CURRENCY_CHOICES = [
    'auto',
    'UAH',
    'USD',
    'EUR',
    'PLN'
] as const satisfies readonly WebCurrencyChoice[];

export const CURRENCY_COOKIE = 'currency';
export const CURRENCY_PATH = '/currency';
export const CURRENCY_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const COOKIE_PAIR_SEPARATOR = /;\s*/;
const COOKIE_ATTRIBUTES = 'Path=/; SameSite=Lax; Secure';

export const isWebCurrencyChoice = (
    value: unknown
): value is WebCurrencyChoice => {
    return value === 'auto' || isCurrency(value);
};

/** Reads the visitor's explicit choice; anything missing or unknown means "follow the page language". */
export const readCurrencyCookie = (
    cookieHeader: string | undefined
): WebCurrencyChoice => {
    for (const pair of (cookieHeader ?? '').split(COOKIE_PAIR_SEPARATOR)) {
        const separator = pair.indexOf('=');

        if (
            separator > 0 &&
            pair.slice(0, separator).trim() === CURRENCY_COOKIE
        ) {
            const value = pair.slice(separator + 1).trim();

            return isCurrency(value) ? value : 'auto';
        }
    }

    return 'auto';
};

export const buildCurrencyCookie = (choice: WebCurrencyChoice) => {
    return choice === 'auto'
        ? `${CURRENCY_COOKIE}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`
        : `${CURRENCY_COOKIE}=${choice}; Max-Age=${CURRENCY_COOKIE_MAX_AGE_SECONDS}; ${COOKIE_ATTRIBUTES}`;
};

export const buildCurrencySwitchPath = (
    choice: WebCurrencyChoice,
    back: string
) => {
    const query = new URLSearchParams({ set: choice, back });

    return `${CURRENCY_PATH}?${query.toString()}`;
};
