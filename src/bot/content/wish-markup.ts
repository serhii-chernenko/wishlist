import type { TranslationFunctions } from '../../i18n/i18n-types';
import type { WishRecord } from '../../db/repositories';
import { WISH_PRIORITY_LEVELS } from '../../shared/app-api';
import { toWishCurrency, type Currency } from '../../shared/money';
import { cutDescription, cutTitle } from '../input/limits';
import { parseWishImages } from '../input/wish-images';
import type { WishMessage } from '../runtime/types';
import { escapeHtml } from '../utils/strings';

export interface WishMarkupFormatters {
    formatMoney(value: number, currency: Currency): string;
    formatDate(value: Date): string;
}

export type WishMarkupAudience = 'owner' | 'watcher';

export type WishMarkupDetail = 'full' | 'summary';

export interface WishMarkupOptions {
    audience: WishMarkupAudience;
    detail: WishMarkupDetail;
    showHidden: boolean;
}

export type WishMarkupSource = Pick<
    WishRecord,
    | 'title'
    | 'description'
    | 'price'
    | 'currency'
    | 'priorityLevel'
    | 'hidden'
    | 'createdAt'
    | 'updatedAt'
>;

const getPriorityBlock = (
    LL: TranslationFunctions,
    audience: WishMarkupAudience
) => {
    return audience === 'owner'
        ? LL.markup.priority.high.owner()
        : LL.markup.priority.high.watcher();
};

export const renderWishHtml = (
    LL: TranslationFunctions,
    wish: WishMarkupSource,
    formatters: WishMarkupFormatters,
    options: WishMarkupOptions
) => {
    const created = escapeHtml(formatters.formatDate(wish.createdAt));
    const updated = escapeHtml(formatters.formatDate(wish.updatedAt));
    const createdLine = LL.markup.date.created(created);
    const updatedLine =
        created === updated ? '' : LL.markup.date.updated(updated);
    const title = LL.markup.title(escapeHtml(cutTitle(wish.title)));
    const hidden = wish.hidden && options.showHidden ? LL.markup.hidden() : '';
    const price =
        wish.price > 0
            ? LL.markup.price(
                  escapeHtml(
                      formatters.formatMoney(
                          wish.price,
                          toWishCurrency(wish.currency)
                      )
                  )
              )
            : '';

    if (options.detail === 'summary') {
        const dateLines = updatedLine ? `\n${updatedLine}` : createdLine;

        return title + price + dateLines + hidden;
    }

    const priority =
        wish.priorityLevel === WISH_PRIORITY_LEVELS.high
            ? getPriorityBlock(LL, options.audience)
            : '';
    const description = wish.description
        ? LL.markup.description(escapeHtml(cutDescription(wish.description)))
        : '';

    return (
        title +
        priority +
        description +
        price +
        createdLine +
        updatedLine +
        hidden
    );
};

export const toWishMessage = (
    html: string,
    wish: Pick<WishRecord, 'images'>
): WishMessage => {
    return { html, images: parseWishImages(wish.images) };
};
