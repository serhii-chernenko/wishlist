import type {
    InlineKeyboardButton,
    InlineKeyboardMarkup
} from 'telegraf/types';

import type { UserRecord, WishRecord } from '../../db/repositories';
import {
    buildFilterKeyboard,
    getFilterMarker,
    getFilterTitle
} from '../content/filters';
import {
    callbackButton,
    homeButton,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { getPageWindow, normalizeOffset } from '../content/pagination';
import { renderWishHtml, toWishMessage } from '../content/wish-markup';
import type {
    BotRequest,
    CallbackTable,
    ScreenModule,
    WishFilter
} from '../runtime/types';
import { summarizeGivers, type GiverSummary } from '../services/give-service';
import {
    createWishFormatters,
    createWishScreenServices,
    getOwnerReference,
    isFindableOwner,
    openLinkButton,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { escapeHtml } from '../utils/strings';
import { screen as findListScreen } from './find-list';

export interface ThirdWishlistParams {
    ownerId: number;
    offset?: number;
    query?: string;
}

const getOwnerFilter = (req: BotRequest, ownerId: number) => {
    const find = req.session.find;

    return find !== null && find.targetUserId === ownerId ? find.filter : null;
};

const getGiversLine = (req: BotRequest, summary: GiverSummary) => {
    const { givers } = req.LL.findList;

    switch (summary.kind) {
        case 'you':
            return givers.you();
        case 'somebodyAndYou':
            return givers.somebodyAndYou(String(summary.others));
        case 'somebody':
            return givers.somebody(String(summary.count));
        case 'none':
            return '';
    }
};

const buildGiftKeyboard = (
    req: BotRequest,
    wish: Pick<WishRecord, 'id' | 'link'>,
    gives: boolean
): InlineKeyboardMarkup => {
    const { actions } = req.LL.findList;

    return singleColumnKeyboard([
        ...openLinkButton(req, wish.link),
        gives
            ? callbackButton(actions.take(), {
                  type: 'thirdTake',
                  wishId: wish.id
              })
            : callbackButton(actions.give(), {
                  type: 'thirdGive',
                  wishId: wish.id
              })
    ]);
};

const buildFilterButton = (
    req: BotRequest,
    ownerId: number,
    filter: WishFilter | null
) => {
    return callbackButton(
        `${req.LL.filters.title()} ${getFilterMarker(filter)}`,
        { type: 'thirdFilterMenu', ownerId }
    );
};

const renderUnavailableOwner = async (req: BotRequest) => {
    await req.send.text(req.LL.findList.errors.notFound());
    await findListScreen.render(req, undefined);
};

const loadOwner = async (
    req: BotRequest,
    ownerId: number
): Promise<UserRecord | null> => {
    const viewer = requireUser(req);
    const { search } = createWishScreenServices(req);
    const owner = await search.findById(ownerId);

    if (owner === null || !isFindableOwner(owner)) {
        return null;
    }

    return owner.id === viewer.id && !req.isAdmin ? null : owner;
};

const resolveQueryLabel = (
    req: BotRequest,
    owner: UserRecord,
    explicitQuery: string | undefined
) => {
    const find = req.session.find;
    const storedQuery =
        find !== null && find.targetUserId === owner.id ? find.query : '';

    return explicitQuery || storedQuery || getOwnerReference(owner) || '';
};

const render = async (req: BotRequest, params: ThirdWishlistParams) => {
    const { LL } = req;
    const viewer = requireUser(req);
    const owner = await loadOwner(req, params.ownerId);

    if (owner === null) {
        await renderUnavailableOwner(req);

        return;
    }

    const { wishes, gives } = createWishScreenServices(req);
    const formatters = createWishFormatters(req);
    const filter = getOwnerFilter(req, owner.id);
    const query = resolveQueryLabel(req, owner, params.query);
    const requestedOffset = params.offset ?? 0;
    let offset = requestedOffset;
    let page = await wishes.listVisibleOf({
        ownerId: owner.id,
        filter,
        offset
    });

    if (offset > 0 && page.items.length === 0 && page.total > 0) {
        offset = normalizeOffset(offset, page.total);
        page = await wishes.listVisibleOf({
            ownerId: owner.id,
            filter,
            offset
        });
    }

    updateSession(req, {
        pendingInput: null,
        find: { targetUserId: owner.id, query, filter }
    });

    if (page.total === 0) {
        if (filter === null) {
            await req.send.text(LL.findList.empty());
            await findListScreen.render(req, undefined);

            return;
        }

        await req.send.text(
            LL.findList.filtered(),
            singleColumnKeyboard([
                buildFilterButton(req, owner.id, filter),
                homeButton(LL)
            ])
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
            LL.findList.filled.before(escapeHtml(query)) + appliedFilter,
            removeReplyKeyboard()
        );
    }

    const giversByWish = await gives.giversOf(
        page.items.map(wish => {
            return wish.id;
        })
    );

    for (const wish of page.items) {
        const giverIds = giversByWish.get(wish.id) ?? [];
        const summary = summarizeGivers(giverIds, viewer.id);
        const html =
            renderWishHtml(LL, wish, formatters, {
                audience: 'watcher',
                detail: 'full',
                showHidden: false
            }) + getGiversLine(req, summary);

        await req.send.wish(
            toWishMessage(html, wish),
            buildGiftKeyboard(
                req,
                wish,
                summary.kind === 'you' || summary.kind === 'somebodyAndYou'
            )
        );
    }

    if (owner.payments && !window.hasMore) {
        await req.send.text(
            LL.findList.filled.payments(escapeHtml(owner.payments)),
            removeReplyKeyboard()
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
                  type: 'thirdPage',
                  ownerId: owner.id,
                  offset: window.nextOffset
              }),
        buildFilterButton(req, owner.id, filter),
        navigationButton(LL.actions.back(), 'findList'),
        homeButton(LL)
    ];

    await req.send.text(
        LL.findList.filled.after() + rangeLine,
        singleColumnKeyboard(footerButtons)
    );
};

export const screen: ScreenModule<ThirdWishlistParams> = {
    id: 'thirdWishlist',
    render
};

const findGiftableWish = async (req: BotRequest, wishId: number) => {
    const viewer = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const wish = await wishes.findVisible(wishId);

    if (wish === null || wish.userId === viewer.id) {
        return null;
    }

    return wish;
};

export const callbacks: CallbackTable = {
    thirdPage: async (req, action) => {
        await render(req, {
            ownerId: action.ownerId,
            offset: action.offset
        });
    },
    thirdFilterMenu: async (req, action) => {
        const formatters = createWishFormatters(req);

        requireUser(req);
        await req.send.text(
            req.LL.filters.description(),
            buildFilterKeyboard(req.LL, formatters.formatMoney, filter => {
                return {
                    type: 'thirdFilter',
                    ownerId: action.ownerId,
                    filter
                };
            })
        );
    },
    thirdFilter: async (req, action) => {
        const { LL } = req;

        requireUser(req);

        const current = req.session.find;
        const query =
            current !== null && current.targetUserId === action.ownerId
                ? current.query
                : '';

        updateSession(req, {
            find: {
                targetUserId: action.ownerId,
                query,
                filter: action.filter
            }
        });
        req.telemetry.botActionCompleted({
            action: 'wishlist_filtered',
            result: action.filter === null ? 'reset' : 'set'
        });
        await req.send.text(
            action.filter === null
                ? LL.filters.success.reset()
                : LL.filters.success.set()
        );
        await render(req, { ownerId: action.ownerId, offset: 0 });
    },
    thirdGive: async (req, action) => {
        const { LL } = req;
        const viewer = requireUser(req);
        const wish = await findGiftableWish(req, action.wishId);

        if (wish === null) {
            await req.send.toast(LL.errors.outdatedButton());

            return;
        }

        const { gives } = createWishScreenServices(req);
        const result = await gives.give(viewer.id, wish.id);

        if (result === 'added') {
            req.telemetry.botActionCompleted({ action: 'give_added' });
        }

        await req.send.toast(
            result === 'added'
                ? LL.findList.success.give()
                : LL.findList.errors.give()
        );
        await req.send.replaceKeyboard(buildGiftKeyboard(req, wish, true));
    },
    thirdTake: async (req, action) => {
        const { LL } = req;
        const viewer = requireUser(req);
        const wish = await findGiftableWish(req, action.wishId);

        if (wish === null) {
            await req.send.toast(LL.errors.outdatedButton());

            return;
        }

        const { gives } = createWishScreenServices(req);
        const removed = await gives.take(viewer.id, wish.id);

        if (removed) {
            req.telemetry.botActionCompleted({ action: 'give_removed' });
        }

        await req.send.toast(
            removed ? LL.findList.success.take() : LL.findList.errors.take()
        );
        await req.send.replaceKeyboard(buildGiftKeyboard(req, wish, false));
    }
};
