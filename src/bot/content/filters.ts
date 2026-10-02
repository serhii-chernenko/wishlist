import type { InlineKeyboardMarkup } from 'telegraf/types';

import type { TranslationFunctions } from '../../i18n/i18n-types';
import type { EncodableCallbackAction } from '../callback-data';
import type { WishFilter } from '../runtime/types';
import { callbackButton, singleColumnKeyboard } from './keyboards';

export interface PriceRange {
    from: number | null;
    to: number | null;
}

export const WISH_FILTERS = [0, 1, 2, 3, 4] as const satisfies WishFilter[];

const PRICE_RANGES: Readonly<Record<WishFilter, PriceRange>> = {
    0: { from: null, to: 999 },
    1: { from: 1000, to: 1999 },
    2: { from: 2000, to: 4999 },
    3: { from: 5000, to: 9999 },
    4: { from: 10000, to: null }
};

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

export const getPriceRange = (filter: WishFilter): PriceRange => {
    return PRICE_RANGES[filter];
};

export type MoneyFormatter = (value: number) => string;

export const getFilterTitle = (
    LL: TranslationFunctions,
    filter: WishFilter,
    formatMoney: MoneyFormatter
) => {
    const { from, to } = getPriceRange(filter);

    if (from !== null && to !== null) {
        return LL.filters.fromTo(formatMoney(from), formatMoney(to));
    }

    if (from !== null) {
        return LL.filters.from(formatMoney(from));
    }

    return LL.filters.to(formatMoney(to ?? 0));
};

export const getFilterMarker = (filter: WishFilter | null) => {
    return filter === null ? '🔴' : '🟢';
};

export const buildFilterKeyboard = (
    LL: TranslationFunctions,
    formatMoney: MoneyFormatter,
    toAction: (filter: WishFilter | null) => EncodableCallbackAction
): InlineKeyboardMarkup => {
    return singleColumnKeyboard([
        ...WISH_FILTERS.map(filter => {
            return callbackButton(
                getFilterTitle(LL, filter, formatMoney),
                toAction(filter)
            );
        }),
        callbackButton(LL.filters.reset(), toAction(null))
    ]);
};
