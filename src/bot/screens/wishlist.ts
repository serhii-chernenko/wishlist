import type { InlineKeyboardButton } from 'telegraf/types';

import { escapeHtml } from '../utils/strings';
import {
    getFilterMarker,
    getFilterTitle,
    buildFilterKeyboard
} from '../content/filters';
import {
    appEntryButton,
    callbackButton,
    homeButton,
    inlineKeyboard,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard,
    urlButton
} from '../content/keyboards';
import { normalizeOffset, getPageWindow } from '../content/pagination';
import { renderWishHtml, toWishMessage } from '../content/wish-markup';
import type {
    BotActionName,
    BotRequest,
    CallbackAction,
    CallbackTable,
    ScreenModule,
    WishFilter
} from '../runtime/types';
import {
    createWishFormatters,
    createWishScreenServices,
    getPriceBoundsByCurrency,
    releaseRemovedImages,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { getErrorType } from '../errors';
import { deriveRequest } from '../runtime/context';
import type { ShareRecord } from '../../db/repositories';
import { buildShareAppLink } from '../../shared/app-links';
import { buildShareUrl } from '../../web/share/public-id';
import {
    buildAuthorName,
    canShowPublicUsername,
    resolvePublicOrigin
} from '../services/share-service';

export interface WishlistParams {
    offset?: number;
}

const buildMenu = (
    req: BotRequest,
    options: {
        filter: WishFilter | null;
        hasWishes: boolean;
        canShare: boolean;
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
        options.canShare
            ? callbackButton(LL.actions.share(), { type: 'wishlistShare' })
            : null,
        appEntryButton(req, 'wishes'),
        homeButton(LL)
    ];

    return singleColumnKeyboard(buttons);
};

const render = async (req: BotRequest, params: WishlistParams | undefined) => {
    const { LL } = req;
    const user = requireUser(req);
    const { wishes, share } = createWishScreenServices(req);
    const filter = wishes.getOwnerFilter(user);
    const priceBounds = getPriceBoundsByCurrency(req, filter);
    const formatters = createWishFormatters(req);
    let offset = params?.offset ?? 0;
    let page = await wishes.listOwned({
        ownerId: user.id,
        priceBounds,
        offset
    });

    if (offset > 0 && page.items.length === 0 && page.total > 0) {
        offset = normalizeOffset(offset, page.total);
        page = await wishes.listOwned({
            ownerId: user.id,
            priceBounds,
            offset
        });
    }

    updateSession(req, { pendingInput: null });

    if (page.total === 0) {
        await req.send.text(
            filter === null ? LL.wishlist.empty() : LL.wishlist.filtered(),
            buildMenu(req, {
                filter,
                hasWishes: false,
                canShare: (await share.getShare(user.id)) !== null,
                nextOffset: null
            })
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
            canShare: true,
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
    await req.send.text(
        req.LL.filters.description(),
        buildFilterKeyboard(req.LL, req.locale, req.displayCurrency, filter => {
            return { type: 'wishlistFilter', filter };
        })
    );
};

const SHARE_PAGE_FALLBACK_NAME = '—';
const TELEGRAM_SHARE_URL = 'https://t.me/share/url';

type ShareActionName = Extract<
    BotActionName,
    | 'wishlist_shared'
    | 'wishlist_share_stopped'
    | 'wishlist_share_rotated'
    | 'wishlist_share_username_toggled'
>;

interface ShareLinks {
    appUrl: string;
    pageUrl: string;
}

type ShareAttempt<Value> = { ok: true; value: Value } | { ok: false };

const attemptShare = async <Value>(
    req: BotRequest,
    action: ShareActionName,
    task: () => Promise<Value>
): Promise<ShareAttempt<Value>> => {
    try {
        return { ok: true, value: await task() };
    } catch (error) {
        req.telemetry.botActionCompleted({ action, result: 'failed' });
        req.telemetry.internalFailure({
            event: 'share_failed',
            errorType: getErrorType(error)
        });
        await req.send.text(req.LL.errors.unknown());
        await render(req, undefined);

        return { ok: false };
    }
};

const buildTelegramShareUrl = (req: BotRequest, links: ShareLinks) => {
    const text = req.LL.wishlist.share.sendText({ pageUrl: links.pageUrl });

    return `${TELEGRAM_SHARE_URL}?url=${encodeURIComponent(links.appUrl)}&text=${encodeURIComponent(text)}`;
};

const buildUsernameToggleButton = (
    req: BotRequest,
    share: Pick<ShareRecord, 'showUsername'>
) => {
    if (req.user === null || !canShowPublicUsername(req.user)) {
        return null;
    }

    const { actions } = req.LL.wishlist.share;

    return callbackButton(
        share.showUsername ? actions.hideUsername() : actions.showUsername(),
        { type: 'wishlistShareUsername' }
    );
};

const buildShareLinkKeyboard = (
    req: BotRequest,
    share: Pick<ShareRecord, 'showUsername'>,
    links: ShareLinks
) => {
    const { LL } = req;
    const { actions } = LL.wishlist.share;

    return singleColumnKeyboard([
        urlButton(actions.openTelegram(), links.appUrl),
        urlButton(actions.openBrowser(), links.pageUrl),
        urlButton(actions.send(), buildTelegramShareUrl(req, links)),
        appEntryButton(req, 'share'),
        buildUsernameToggleButton(req, share),
        navigationButton(LL.disclosure.title(), 'disclosure'),
        callbackButton(actions.newLink(), { type: 'wishlistShareRotate' }),
        callbackButton(actions.stop(), { type: 'wishlistShareStop' }),
        navigationButton(LL.actions.back(), 'wishlist')
    ]);
};

const getPublicOrigin = (req: BotRequest) => {
    return resolvePublicOrigin(req.publicOrigin, req.env.BOT_ENVIRONMENT);
};

const renderShareLink = async (
    req: BotRequest,
    share: Pick<ShareRecord, 'publicId' | 'showUsername'>,
    buildText: (links: ShareLinks) => string
) => {
    const pageUrl = buildShareUrl(getPublicOrigin(req), share.publicId);
    const links: ShareLinks = {
        pageUrl,
        appUrl:
            buildShareAppLink(req.env.WISHLIST_TG_URL, share.publicId) ??
            pageUrl
    };

    await req.send.text(
        buildText({
            appUrl: escapeHtml(links.appUrl),
            pageUrl: escapeHtml(links.pageUrl)
        }),
        buildShareLinkKeyboard(req, share, links)
    );
};

const renderShareEmpty = async (req: BotRequest) => {
    req.telemetry.botActionCompleted({
        action: 'wishlist_shared',
        result: 'empty'
    });
    await req.send.text(req.LL.wishlist.share.empty());
    await render(req, undefined);
};

const renderShareConsent = async (req: BotRequest) => {
    const { LL } = req;
    const name = buildAuthorName(req.actor) || SHARE_PAGE_FALLBACK_NAME;
    const { host } = new URL(getPublicOrigin(req));

    await req.send.text(
        LL.wishlist.share.consent({
            name: escapeHtml(name),
            host: escapeHtml(host)
        }),
        singleColumnKeyboard([
            callbackButton(LL.wishlist.share.actions.publish(), {
                type: 'wishlistSharePublish'
            }),
            navigationButton(LL.actions.back(), 'wishlist')
        ])
    );
};

const publishShare = async (req: BotRequest) => {
    const user = requireUser(req);
    const { share } = createWishScreenServices(req);
    const attempt = await attemptShare(req, 'wishlist_shared', () => {
        return share.publish(user, buildAuthorName(req.actor));
    });

    if (!attempt.ok) {
        return;
    }

    const outcome = attempt.value;

    if (outcome.status === 'empty') {
        await renderShareEmpty(req);

        return;
    }

    req.telemetry.botActionCompleted({
        action: 'wishlist_shared',
        result: outcome.status === 'created' ? 'published' : 'existing'
    });
    await renderShareLink(req, outcome.share, links => {
        const ready = req.LL.wishlist.share.ready(links);

        return outcome.pageEmpty
            ? `${ready}\n\n${req.LL.wishlist.share.pageEmpty()}`
            : ready;
    });
};

const openShare = async (req: BotRequest) => {
    const user = requireUser(req);
    const { share } = createWishScreenServices(req);
    const attempt = await attemptShare(req, 'wishlist_shared', () => {
        return share.getEntryState(user.id);
    });

    if (!attempt.ok) {
        return;
    }

    switch (attempt.value) {
        case 'empty':
            await renderShareEmpty(req);
            return;
        case 'unshared':
            await renderShareConsent(req);
            return;
        case 'shared':
            await publishShare(req);
            return;
    }
};

const renderShareConfirmation = async (
    req: BotRequest,
    text: string,
    confirmAction: Extract<
        CallbackAction,
        { type: 'wishlistShareStopConfirm' | 'wishlistShareRotateConfirm' }
    >
) => {
    const { LL } = req;

    await req.send.text(
        text,
        singleColumnKeyboard([
            callbackButton(LL.actions.yes(), confirmAction),
            callbackButton(LL.actions.no(), { type: 'wishlistShare' })
        ])
    );
};

const stopShare = async (req: BotRequest) => {
    const user = requireUser(req);
    const { share } = createWishScreenServices(req);
    const attempt = await attemptShare(req, 'wishlist_share_stopped', () => {
        return share.stop(user.id);
    });

    if (!attempt.ok) {
        return;
    }

    if (!attempt.value) {
        await openShare(req);

        return;
    }

    req.telemetry.botActionCompleted({
        action: 'wishlist_share_stopped',
        result: 'success'
    });
    await req.send.text(req.LL.wishlist.share.stopped());
    await render(req, undefined);
};

const rotateShare = async (req: BotRequest) => {
    const user = requireUser(req);
    const { share } = createWishScreenServices(req);
    const attempt = await attemptShare(req, 'wishlist_share_rotated', () => {
        return share.rotate(user.id);
    });

    if (!attempt.ok) {
        return;
    }

    if (attempt.value === null) {
        await openShare(req);

        return;
    }

    req.telemetry.botActionCompleted({
        action: 'wishlist_share_rotated',
        result: 'success'
    });
    await renderShareLink(req, attempt.value, links => {
        return req.LL.wishlist.share.rotated(links);
    });
};

const toggleShareUsername = async (req: BotRequest) => {
    const user = requireUser(req);
    const { share } = createWishScreenServices(req);
    const attempt = await attemptShare(
        req,
        'wishlist_share_username_toggled',
        () => {
            return share.toggleUsername(user);
        }
    );

    if (!attempt.ok) {
        return;
    }

    if (attempt.value === null) {
        await openShare(req);

        return;
    }

    const { share: toggled, changed } = attempt.value;

    if (changed) {
        req.telemetry.botActionCompleted({
            action: 'wishlist_share_username_toggled',
            result: toggled.showUsername ? 'on' : 'off'
        });
    }

    await renderShareLink(req, toggled, links => {
        return req.LL.wishlist.share.ready(links);
    });
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
        const imageFileIds = await wishes.listActiveImageFileIds(user.id);
        const removed = await wishes.removeAll(user.id);

        if (removed === 0) {
            await req.send.text(LL.wishlist.clean.error());
        } else {
            releaseRemovedImages(req, imageFileIds);
            req.telemetry.botActionCompleted({ action: 'wishlist_cleaned' });
            await req.send.text(LL.wishlist.clean.success());
        }

        await render(req, undefined);
    },
    wishlistShare: async req => {
        await openShare(req);
    },
    wishlistSharePublish: async req => {
        await publishShare(req);
    },
    wishlistShareStop: async req => {
        requireUser(req);
        await renderShareConfirmation(
            req,
            req.LL.wishlist.share.stopConfirm(),
            { type: 'wishlistShareStopConfirm' }
        );
    },
    wishlistShareStopConfirm: async req => {
        await stopShare(req);
    },
    wishlistShareRotate: async req => {
        requireUser(req);
        await renderShareConfirmation(req, req.LL.wishlist.share.newConfirm(), {
            type: 'wishlistShareRotateConfirm'
        });
    },
    wishlistShareRotateConfirm: async req => {
        await rotateShare(req);
    },
    wishlistShareUsername: async req => {
        await toggleShareUsername(req);
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
