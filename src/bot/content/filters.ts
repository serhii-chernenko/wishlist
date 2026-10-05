import type { InlineKeyboardMarkup } from 'telegraf/types';

import type { TranslationFunctions } from '../../i18n/i18n-types';
import {
    formatMoney,
    getPriceFilterRange,
    WISH_FILTER_VALUES,
    type Currency
} from '../../shared/money';
import type { EncodableCallbackAction } from '../callback-data';
import type { AppLocale } from '../i18n';
import type { WishFilter } from '../runtime/types';
import { callbackButton, singleColumnKeyboard } from './keyboards';

export const WISH_FILTERS: readonly WishFilter[] = WISH_FILTER_VALUES;

export const isWishFilter = (value: unknown): value is WishFilter => {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 4
    );
};

export const toWishFilter = (value: number | null | undefined) => {
    return isWishFilter(value) ? value : null;
};

export const getFilterTitle = (
    LL: TranslationFunctions,
    locale: AppLocale,
    currency: Currency,
    filter: WishFilter
) => {
    const { from, to } = getPriceFilterRange(currency, filter);
    const formatAmount = (value: number) => {
        return formatMoney(value, locale, currency);
    };

    if (from !== null && to !== null) {
        return LL.filters.fromTo(formatAmount(from), formatAmount(to));
    }

    if (from !== null) {
        return LL.filters.from(formatAmount(from));
    }

    return LL.filters.to(formatAmount(to ?? 0));
};

export const getFilterMarker = (filter: WishFilter | null) => {
    return filter === null ? '🔴' : '🟢';
};

export const buildFilterKeyboard = (
    LL: TranslationFunctions,
    locale: AppLocale,
    currency: Currency,
    toAction: (filter: WishFilter | null) => EncodableCallbackAction
): InlineKeyboardMarkup => {
    return singleColumnKeyboard([
        ...WISH_FILTERS.map(filter => {
            return callbackButton(
                getFilterTitle(LL, locale, currency, filter),
                toAction(filter)
            );
        }),
        callbackButton(LL.filters.reset(), toAction(null))
    ]);
};
