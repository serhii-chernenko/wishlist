import type { InlineKeyboardButton } from 'telegraf/types';

import type { WishRecord } from '../../db/repositories';
import { getFilterTitle } from '../content/filters';
import {
    callbackButton,
    homeButton,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import {
    getPageWindow,
    normalizeOffset,
    WISHES_PAGE_SIZE
} from '../content/pagination';
import {
    renderWishHtml,
    toWishMessage,
    withoutPriority
} from '../content/wish-markup';
import { cutTitle } from '../input/limits';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createGiftedService,
    getReleasableImages
} from '../services/gifted-service';
import {
    createWishFormatters,
    createWishScreenServices,
    getPriceBoundsByCurrency,
    releaseRemovedImages,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { escapeHtml } from '../utils/strings';
import { screen as wishlistScreen } from './wishlist';

export interface GiftedListParams {
    offset?: number;
    fallbackToWishlist?: boolean;
}

const getGiftedService = (req: BotRequest) => {
    return createGiftedService(req.repos);
};

const getOwnerPriceBounds = (req: BotRequest) => {
    const { wishes } = createWishScreenServices(req);

    return getPriceBoundsByCurrency(
        req,
        wishes.getOwnerFilter(requireUser(req))
    );
};

const loadPage = async (req: BotRequest, requestedOffset: number) => {
    const user = requireUser(req);
    const service = getGiftedService(req);
    const priceBounds = getOwnerPriceBounds(req);
    const fetchPage = (offset: number) => {
        return service.listOwned(user.id, priceBounds, {
            offset,
            limit: WISHES_PAGE_SIZE
        });
    };
    const page = await fetchPage(requestedOffset);

    if (requestedOffset > 0 && page.items.length === 0 && page.total > 0) {
        const offset = normalizeOffset(requestedOffset, page.total);

        return { offset, page: await fetchPage(offset) };
    }

    return { offset: requestedOffset, page };
};

const buildWishKeyboard = (req: BotRequest, wish: Pick<WishRecord, 'id'>) => {
    const { gifted } = req.LL.wishlist;

    return singleColumnKeyboard([
        callbackButton(gifted.restore(), {
            type: 'giftedRestore',
            wishId: wish.id
        }),
        callbackButton(gifted.hide(), { type: 'giftedHide', wishId: wish.id })
    ]);
};

const getAppliedFilterLine = (req: BotRequest) => {
    const { LL } = req;
    const { wishes } = createWishScreenServices(req);
    const filter = wishes.getOwnerFilter(requireUser(req));

    if (filter === null) {
        return '';
    }

    return LL.filters.applied(
        escapeHtml(getFilterTitle(LL, req.locale, req.displayCurrency, filter))
    );
};

const render = async (
    req: BotRequest,
    params: GiftedListParams | undefined
) => {
    const { LL } = req;
    const { offset, page } = await loadPage(req, params?.offset ?? 0);

    updateSession(req, { pendingInput: null });

    if (page.total === 0) {
        if (params?.fallbackToWishlist === true) {
            await wishlistScreen.render(req, undefined);

            return;
        }

        await req.send.text(
            LL.wishlist.gifted.empty(),
            singleColumnKeyboard([
                navigationButton(LL.actions.back(), 'wishlist'),
                homeButton(LL)
            ])
        );

        return;
    }

    const window = getPageWindow(offset, page.items.length, page.total);
    const formatters = createWishFormatters(req);

    if (window.isFirstPage) {
        await req.send.text(
            LL.wishlist.gifted.title() + getAppliedFilterLine(req),
            removeReplyKeyboard()
        );
    }

    for (const wish of page.items) {
        await req.send.wish(
            toWishMessage(
                renderWishHtml(LL, withoutPriority(wish), formatters, {
                    detail: 'summary',
                    showHidden: true
                }),
                wish
            ),
            buildWishKeyboard(req, wish)
        );
    }

    const rangeLine = window.isPaginated
        ? `\n\n${LL.pagination.range(
              String(window.firstPosition),
              String(window.lastPosition),
              String(window.total)
          )}`
        : '';
    const footerButtons: Array<InlineKeyboardButton | null> = [
        window.nextOffset === null
            ? null
            : callbackButton(`➡️ ${LL.actions.more()}`, {
                  type: 'giftedPage',
                  offset: window.nextOffset
              }),
        navigationButton(LL.actions.back(), 'wishlist'),
        homeButton(LL)
    ];

    await req.send.text(
        LL.wishlist.gifted.after() + rangeLine,
        singleColumnKeyboard(footerButtons)
    );
};

export const screen: ScreenModule<GiftedListParams | undefined> = {
    id: 'giftedList',
    render
};

const renderAfterChange = async (req: BotRequest) => {
    await render(req, { fallbackToWishlist: true });
};

const renderStaleGifted = async (req: BotRequest) => {
    await req.send.text(req.LL.errors.outdatedButton());
    await renderAfterChange(req);
};

const renderHideConfirmation = async (
    req: BotRequest,
    wish: Pick<WishRecord, 'id' | 'title'>
) => {
    const { LL } = req;

    await req.send.text(
        LL.wishlist.gifted.hideConfirm({
            title: escapeHtml(cutTitle(wish.title))
        }),
        singleColumnKeyboard([
            callbackButton(LL.actions.yes(), {
                type: 'giftedHideConfirm',
                wishId: wish.id
            }),
            callbackButton(LL.actions.no(), { type: 'giftedPage', offset: 0 })
        ])
    );
};

export const callbacks: CallbackTable = {
    giftedPage: async (req, action) => {
        await render(req, { offset: action.offset });
    },
    giftedRestore: async (req, action) => {
        const { LL } = req;
        const user = requireUser(req);
        const outcome = await getGiftedService(req).restore(
            action.wishId,
            user.id
        );

        switch (outcome.status) {
            case 'restored':
                req.telemetry.botActionCompleted({ action: 'wish_restored' });
                await req.send.text(LL.wishlist.gifted.restored());
                await renderAfterChange(req);
                return;
            case 'wishLimit':
                await req.send.text(LL.wishlist.add.limit());
                await renderAfterChange(req);
                return;
            case 'alreadyActive':
            case 'missing':
                await renderStaleGifted(req);
                return;
        }
    },
    giftedHide: async (req, action) => {
        const user = requireUser(req);
        const wish = await getGiftedService(req).findOwned(
            action.wishId,
            user.id
        );

        if (wish === null) {
            await renderStaleGifted(req);

            return;
        }

        await renderHideConfirmation(req, wish);
    },
    giftedHideConfirm: async (req, action) => {
        const user = requireUser(req);
        const service = getGiftedService(req);
        const shown = await service.findOwned(action.wishId, user.id);
        const outcome =
            shown === null
                ? null
                : await service.setHidden(action.wishId, user.id, true);

        if (outcome === null || outcome.status === 'missing') {
            await renderStaleGifted(req);

            return;
        }

        releaseRemovedImages(req, getReleasableImages(outcome, true));
        req.telemetry.botActionCompleted({
            action: 'gifted_hidden',
            result: 'on'
        });
        await req.send.text(req.LL.wishlist.gifted.hidden());
        await renderAfterChange(req);
    }
};
