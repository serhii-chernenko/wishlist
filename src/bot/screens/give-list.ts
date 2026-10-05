import type { InlineKeyboardButton } from 'telegraf/types';

import {
    callbackButton,
    homeButton,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { getPageWindow, normalizeOffset } from '../content/pagination';
import { renderWishHtml, toWishMessage } from '../content/wish-markup';
import type { UserRecord, WishRecord } from '../../db/repositories';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createWishFormatters,
    createWishScreenServices,
    getOwnerPublicUsername,
    openLinkButton,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { escapeHtml } from '../utils/strings';
import { screen as thirdWishlistScreen } from './third-wishlist';

export interface GiveListParams {
    offset?: number;
}

const buildGiveKeyboard = (
    req: BotRequest,
    wish: Pick<WishRecord, 'id' | 'link'>,
    ownerId: number | null
) => {
    return singleColumnKeyboard([
        ...openLinkButton(req, wish.link),
        callbackButton(req.LL.findList.actions.take(), {
            type: 'giveRemove',
            wishId: wish.id
        }),
        ownerId === null
            ? null
            : callbackButton(req.LL.giveList.actions.owner(), {
                  type: 'giveOwnerList',
                  ownerId
              })
    ]);
};

const resolveReachableOwnerId = async (
    req: BotRequest,
    viewerId: number,
    owner: UserRecord | null
) => {
    const { ownerAccess } = createWishScreenServices(req);
    const access = await ownerAccess.resolve(viewerId, owner);

    return owner !== null && access?.kind === 'findable' ? owner.id : null;
};

const resolveOwnerQueryLabel = (req: BotRequest, owner: UserRecord) => {
    return getOwnerPublicUsername(owner) ?? req.LL.giveList.ownerFallback();
};

const buildRemoveConfirmationKeyboard = (req: BotRequest, wishId: number) => {
    const { remove } = req.LL.giveList;

    return singleColumnKeyboard([
        callbackButton(remove.yes(), { type: 'giveRemoveConfirm', wishId }),
        callbackButton(remove.no(), { type: 'giveRemoveKeep', wishId })
    ]);
};

const hasOwnGive = async (req: BotRequest, wishId: number) => {
    const user = requireUser(req);
    const { gives } = createWishScreenServices(req);
    const giversByWish = await gives.giversOf([wishId]);

    return (giversByWish.get(wishId) ?? []).includes(user.id);
};

const render = async (req: BotRequest, params: GiveListParams | undefined) => {
    const { LL } = req;
    const user = requireUser(req);
    const { gives } = createWishScreenServices(req);
    let offset = params?.offset ?? 0;
    let page = await gives.listForGiver(user.id, offset);

    if (offset > 0 && page.items.length === 0 && page.total > 0) {
        offset = normalizeOffset(offset, page.total);
        page = await gives.listForGiver(user.id, offset);
    }

    updateSession(req, { pendingInput: null });

    if (page.total === 0) {
        await req.send.text(
            LL.giveList.empty(),
            singleColumnKeyboard([
                navigationButton(LL.findList.title(), 'findList'),
                homeButton(LL)
            ])
        );

        return;
    }

    const window = getPageWindow(offset, page.items.length, page.total);

    if (window.isFirstPage) {
        await req.send.text(LL.giveList.filled.before(), removeReplyKeyboard());
    }

    const giversByWish = await gives.giversOf(
        page.items.map(entry => {
            return entry.wish.id;
        })
    );

    for (const { wish, owner } of page.items) {
        const otherGivers = (giversByWish.get(wish.id) ?? []).length - 1;
        const reference = owner === null ? null : getOwnerPublicUsername(owner);
        const html =
            renderWishHtml(LL, wish, createWishFormatters(req), {
                detail: 'full',
                showHidden: false
            }) +
            (otherGivers > 0 ? LL.giveList.givers(String(otherGivers)) : '') +
            (reference ? LL.giveList.owner(escapeHtml(reference)) : '');

        await req.send.wish(
            toWishMessage(html, wish),
            buildGiveKeyboard(
                req,
                wish,
                await resolveReachableOwnerId(req, user.id, owner)
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
                  type: 'giveListPage',
                  offset: window.nextOffset
              }),
        callbackButton(LL.actions.clean(), { type: 'giveListClean' }),
        homeButton(LL)
    ];

    await req.send.text(
        LL.giveList.filled.after() + rangeLine,
        singleColumnKeyboard(footerButtons)
    );
};

export const screen: ScreenModule<GiveListParams | undefined> = {
    id: 'giveList',
    render
};

export const callbacks: CallbackTable = {
    giveListPage: async (req, action) => {
        await render(req, { offset: action.offset });
    },
    giveRemove: async (req, action) => {
        if (!(await hasOwnGive(req, action.wishId))) {
            await req.send.toast(req.LL.findList.errors.take());
            await req.send.replaceKeyboard({ inline_keyboard: [] });

            return;
        }

        await req.send.toast(req.LL.giveList.remove.confirm());
        await req.send.replaceKeyboard(
            buildRemoveConfirmationKeyboard(req, action.wishId)
        );
    },
    giveRemoveKeep: async (req, action) => {
        const user = requireUser(req);

        const { wishes, search } = createWishScreenServices(req);
        const wish = await wishes.findVisible(action.wishId);
        const owner =
            wish === null || wish.userId === null
                ? null
                : await search.findById(wish.userId);

        await req.send.replaceKeyboard(
            buildGiveKeyboard(
                req,
                wish ?? { id: action.wishId, link: null },
                await resolveReachableOwnerId(req, user.id, owner)
            )
        );
    },
    giveOwnerList: async (req, action) => {
        const user = requireUser(req);
        const { ownerAccess } = createWishScreenServices(req);
        const target = await ownerAccess.resolveForGiver(
            user.id,
            action.ownerId
        );

        if (target === null || target.access.kind !== 'findable') {
            await req.send.toast(req.LL.errors.outdatedButton());

            return;
        }

        req.telemetry.botActionCompleted({ action: 'give_owner_opened' });
        await thirdWishlistScreen.render(req, {
            ownerId: target.owner.id,
            offset: 0,
            query: resolveOwnerQueryLabel(req, target.owner)
        });
    },
    giveRemoveConfirm: async (req, action) => {
        const user = requireUser(req);
        const { gives } = createWishScreenServices(req);
        const removed = await gives.take(user.id, action.wishId);

        if (removed) {
            req.telemetry.botActionCompleted({ action: 'give_removed' });
        }

        await req.send.toast(
            removed
                ? req.LL.giveList.success.remove()
                : req.LL.findList.errors.take()
        );
        await req.send.replaceKeyboard({ inline_keyboard: [] });
    },
    giveListClean: async req => {
        const { LL } = req;

        requireUser(req);
        await req.send.text(
            LL.giveList.clean.confirm(),
            singleColumnKeyboard([
                callbackButton(LL.actions.yes(), {
                    type: 'giveListCleanConfirm'
                }),
                navigationButton(LL.actions.no(), 'giveList')
            ])
        );
    },
    giveListCleanConfirm: async req => {
        const user = requireUser(req);
        const { gives } = createWishScreenServices(req);

        await gives.removeAll(user.id);
        req.telemetry.botActionCompleted({ action: 'give_list_cleaned' });
        await req.send.text(req.LL.giveList.success.clean());
        await render(req, undefined);
    }
};
