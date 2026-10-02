import type { InlineKeyboardButton } from 'telegraf/types';

import { escapeHtml } from '../utils/strings';
import {
    getFilterMarker,
    getFilterTitle,
    buildFilterKeyboard
} from '../content/filters';
import {
    callbackButton,
    homeButton,
    inlineKeyboard,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { normalizeOffset, getPageWindow } from '../content/pagination';
import { renderWishHtml, toWishMessage } from '../content/wish-markup';
import type {
    BotRequest,
    CallbackTable,
    ScreenModule,
    WishFilter
} from '../runtime/types';
import {
    createWishFormatters,
    createWishScreenServices,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { getErrorType } from '../errors';
import { deriveRequest } from '../runtime/context';
import { buildAuthorName } from '../services/share-service';

export interface WishlistParams {
    offset?: number;
}

const buildMenu = (
    req: BotRequest,
    options: {
        filter: WishFilter | null;
        hasWishes: boolean;
        nextOffset: number | null;
    }
) => {
    const { LL } = req;
    const buttons: Array<InlineKeyboardButton | null> = [
        options.nextOffset === null
            ? null
            : callbackButton(`➡️ ${LL.actions.more()}`, {
                  type: 'wishlistPage',
                  offset: options.nextOffset
              }),
        navigationButton(LL.wishlist.add.title(), 'wishAdd'),
        callbackButton(
            `${LL.filters.title()} ${getFilterMarker(options.filter)}`,
            { type: 'wishlistFilterMenu' }
        ),
        options.hasWishes
            ? callbackButton(LL.actions.clean(), { type: 'wishlistClean' })
            : null,
        options.hasWishes
            ? callbackButton(LL.actions.share(), { type: 'wishlistShare' })
            : null,
        homeButton(LL)
    ];

    return singleColumnKeyboard(buttons);
};

const render = async (req: BotRequest, params: WishlistParams | undefined) => {
    const { LL } = req;
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const filter = wishes.getOwnerFilter(user);
    const formatters = createWishFormatters(req);
    let offset = params?.offset ?? 0;
    let page = await wishes.listOwned({ ownerId: user.id, filter, offset });

    if (offset > 0 && page.items.length === 0 && page.total > 0) {
        offset = normalizeOffset(offset, page.total);
        page = await wishes.listOwned({ ownerId: user.id, filter, offset });
    }

    updateSession(req, { pendingInput: null });

    if (page.total === 0) {
        await req.send.text(
            filter === null ? LL.wishlist.empty() : LL.wishlist.filtered(),
            buildMenu(req, { filter, hasWishes: false, nextOffset: null })
        );

        return;
    }

    const window = getPageWindow(offset, page.items.length, page.total);

    if (window.isFirstPage) {
        const appliedFilter =
            filter === null
                ? ''
                : LL.filters.applied(
                      escapeHtml(
                          getFilterTitle(LL, filter, formatters.formatMoney)
                      )
                  );

        await req.send.text(
            LL.wishlist.filled.before() + appliedFilter,
            removeReplyKeyboard()
        );
    }

    for (const wish of page.items) {
        const html = renderWishHtml(LL, wish, formatters, {
            audience: 'owner',
            detail: 'summary',
            showHidden: true
        });

        await req.send.wish(
            toWishMessage(html, wish),
            inlineKeyboard([
                [
                    callbackButton(LL.actions.edit(), {
                        type: 'wishEdit',
                        wishId: wish.id
                    }),
                    callbackButton(LL.actions.remove(), {
                        type: 'wishRemove',
                        wishId: wish.id
                    })
                ]
            ])
        );
    }

    const rangeLine = window.isPaginated
        ? `\n\n${LL.pagination.range(
              String(window.firstPosition),
              String(window.lastPosition),
              String(window.total)
          )}`
        : '';

    await req.send.text(
        LL.wishlist.filled.after() + rangeLine,
        buildMenu(req, {
            filter,
            hasWishes: true,
            nextOffset: window.nextOffset
        })
    );
};

export const screen: ScreenModule<WishlistParams | undefined> = {
    id: 'wishlist',
    render
};

const renderConfirmation = async (req: BotRequest) => {
    const { LL } = req;

    await req.send.text(
        LL.wishlist.clean.confirm(),
        singleColumnKeyboard([
            callbackButton(LL.actions.yes(), { type: 'wishlistCleanConfirm' }),
            navigationButton(LL.actions.no(), 'wishlist')
        ])
    );
};

const renderFilterMenu = async (req: BotRequest) => {
    const formatters = createWishFormatters(req);

    await req.send.text(
        req.LL.filters.description(),
        buildFilterKeyboard(req.LL, formatters.formatMoney, filter => {
            return { type: 'wishlistFilter', filter };
        })
    );
};

const shareWishlist = async (req: BotRequest) => {
    const { LL } = req;
    const user = requireUser(req);
    const { share } = createWishScreenServices(req);
    const formatters = createWishFormatters(req);

    try {
        const outcome = await share.publishWishlist({
            user,
            author: {
                username: req.actor.username ?? user.username,
                displayName: buildAuthorName(req.actor)
            },
            LL,
            formatMoney: formatters.formatMoney,
            formatDate: formatters.formatDate,
            botUrl: req.env.WISHLIST_TG_URL,
            donateLinks: [
                {
                    title: LL.donate.services.buymeacoffee.title(),
                    url: req.env.BUYMEACOFFEE_URL
                },
                {
                    title: LL.donate.services.monobank.title(),
                    url: req.env.MONOBANK_URL
                }
            ]
        });

        if (outcome.status === 'empty') {
            req.telemetry.botActionCompleted({
                action: 'wishlist_shared',
                result: 'empty'
            });
            await req.send.text(LL.wishlist.share.empty());
        } else {
            req.telemetry.botActionCompleted({
                action: 'wishlist_shared',
                result: 'success'
            });
            await req.send.text(
                LL.wishlist.share.success({ url: escapeHtml(outcome.url) })
            );
        }
    } catch (error) {
        req.telemetry.botActionCompleted({
            action: 'wishlist_shared',
            result: 'failed'
        });
        req.telemetry.internalFailure({
            event: 'telegraph_failed',
            errorType: getErrorType(error)
        });
        await req.send.text(LL.errors.unknown());
    }

    await render(req, undefined);
};

export const callbacks: CallbackTable = {
    wishlistPage: async (req, action) => {
        await render(req, { offset: action.offset });
    },
    wishlistClean: async req => {
        requireUser(req);
        await renderConfirmation(req);
    },
    wishlistCleanConfirm: async req => {
        const { LL } = req;
        const user = requireUser(req);
        const { wishes } = createWishScreenServices(req);
        const removed = await wishes.removeAll(user.id);

        if (removed === 0) {
            await req.send.text(LL.wishlist.clean.error());
        } else {
            req.telemetry.botActionCompleted({ action: 'wishlist_cleaned' });
            await req.send.text(LL.wishlist.clean.success());
        }

        await render(req, undefined);
    },
    wishlistShare: async req => {
        await shareWishlist(req);
    },
    wishlistFilterMenu: async req => {
        requireUser(req);
        await renderFilterMenu(req);
    },
    wishlistFilter: async (req, action) => {
        const { LL } = req;
        const user = requireUser(req);
        const { wishes } = createWishScreenServices(req);

        await wishes.setOwnerFilter(user, action.filter);
        req.telemetry.botActionCompleted({
            action: 'wishlist_filtered',
            result: action.filter === null ? 'reset' : 'set'
        });
        await req.send.text(
            action.filter === null
                ? LL.filters.success.reset()
                : LL.filters.success.set()
        );
        await render(
            deriveRequest(req, {
                user: { ...user, wishlistFilter: action.filter }
            }),
            undefined
        );
    }
};
