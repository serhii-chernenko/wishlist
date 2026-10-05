import type {
    InlineKeyboardButton,
    InlineKeyboardMarkup
} from 'telegraf/types';

import type { UserRecord, WishRecord } from '../../db/repositories';
import type { OwnerContactDto } from '../../shared/app-api';
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
import { PAYMENTS_MAX_LENGTH, truncateWithMark } from '../input/limits';
import { renderWishHtml, toWishMessage } from '../content/wish-markup';
import type {
    BotRequest,
    CallbackTable,
    ScreenModule,
    WishFilter
} from '../runtime/types';
import { resolveOwnerContact } from '../services/contact-service';
import { summarizeGivers, type GiverSummary } from '../services/give-service';
import {
    createWishFormatters,
    createWishScreenServices,
    getPriceBoundsByCurrency,
    isFindableOwner,
    openLinkButton,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { escapeHtml } from '../utils/strings';
import { screen as findListScreen } from './find-list';
import { screen as homeScreen } from './home';

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

const renderContactHtml = (req: BotRequest, contact: OwnerContactDto) => {
    const { contact: texts } = req.LL.findList.filled;
    const lines = [
        texts.title(),
        contact.phone === null
            ? null
            : texts.phone({ phone: escapeHtml(contact.phone) }),
        contact.address === null
            ? null
            : texts.address({ address: escapeHtml(contact.address) })
    ];

    return lines
        .filter(line => {
            return line !== null;
        })
        .join('\n\n');
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

    return explicitQuery || storedQuery;
};

const isSearchedOwner = (req: BotRequest, ownerId: number) => {
    return req.session.find?.targetUserId === ownerId;
};

const rejectOutdatedButton = async (req: BotRequest) => {
    await req.send.toast(req.LL.errors.outdatedButton());
    await homeScreen.render(req, undefined);
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
    const priceBounds = getPriceBoundsByCurrency(req, filter);
    const query = resolveQueryLabel(req, owner, params.query);
    const requestedOffset = params.offset ?? 0;
    let offset = requestedOffset;
    let page = await wishes.listVisibleOf({
        ownerId: owner.id,
        priceBounds,
        offset
    });

    if (offset > 0 && page.items.length === 0 && page.total > 0) {
        offset = normalizeOffset(offset, page.total);
        page = await wishes.listVisibleOf({
            ownerId: owner.id,
            priceBounds,
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
                          getFilterTitle(
                              LL,
                              req.locale,
                              req.displayCurrency,
                              filter
                          )
                      )
                  );

        await req.send.text(
            LL.findList.filled.before(escapeHtml(query)) + appliedFilter,
            removeReplyKeyboard()
        );

        if (owner.showPayments && owner.payments) {
            await req.send.text(
                LL.findList.filled.payments(
                    escapeHtml(
                        truncateWithMark(owner.payments, PAYMENTS_MAX_LENGTH)
                    )
                ),
                removeReplyKeyboard()
            );
        }

        const contact = resolveOwnerContact({ owner, viewer, offset: 0 });

        if (contact !== null) {
            await req.send.text(
                renderContactHtml(req, contact),
                removeReplyKeyboard(),
                { disableLinkPreview: true }
            );
        }
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

    if (
        wish === null ||
        wish.userId === null ||
        wish.userId === viewer.id ||
        !isSearchedOwner(req, wish.userId)
    ) {
        return null;
    }

    return wish;
};

const hasGiven = async (req: BotRequest, viewerId: number, wishId: number) => {
    const { gives } = createWishScreenServices(req);
    const giversByWish = await gives.giversOf([wishId]);

    return (giversByWish.get(wishId) ?? []).includes(viewerId);
};

export const callbacks: CallbackTable = {
    thirdPage: async (req, action) => {
        requireUser(req);

        if (!isSearchedOwner(req, action.ownerId)) {
            await rejectOutdatedButton(req);

            return;
        }

        await render(req, {
            ownerId: action.ownerId,
            offset: action.offset
        });
    },
    thirdFilterMenu: async (req, action) => {
        requireUser(req);

        if (!isSearchedOwner(req, action.ownerId)) {
            await rejectOutdatedButton(req);

            return;
        }

        await req.send.text(
            req.LL.filters.description(),
            buildFilterKeyboard(
                req.LL,
                req.locale,
                req.displayCurrency,
                filter => {
                    return {
                        type: 'thirdFilter',
                        ownerId: action.ownerId,
                        filter
                    };
                }
            )
        );
    },
    thirdFilter: async (req, action) => {
        const { LL } = req;

        requireUser(req);

        const current = req.session.find;

        if (current === null || current.targetUserId !== action.ownerId) {
            await rejectOutdatedButton(req);

            return;
        }

        updateSession(req, {
            find: {
                targetUserId: action.ownerId,
                query: current.query,
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

        if (!(await hasGiven(req, viewer.id, action.wishId))) {
            await req.send.toast(LL.errors.outdatedButton());

            return;
        }

        const { gives, wishes } = createWishScreenServices(req);
        const wish = await wishes.findVisible(action.wishId);
        const removed = await gives.take(viewer.id, action.wishId);

        if (removed) {
            req.telemetry.botActionCompleted({ action: 'give_removed' });
        }

        await req.send.toast(
            removed ? LL.findList.success.take() : LL.findList.errors.take()
        );
        await req.send.replaceKeyboard(
            wish === null
                ? { inline_keyboard: [] }
                : buildGiftKeyboard(req, wish, false)
        );
    }
};
