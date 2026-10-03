import type { InlineKeyboardButton } from 'telegraf/types';

import { releaseOrphanedImages } from '../../api/photos/image-cleanup';
import type { UserRecord } from '../../db/repositories';
import { getAllLocaleTexts } from '../content/messages';
import { formatCurrency, formatDate } from '../content/intl';
import { urlButton } from '../content/keyboards';
import { isRenderableLink } from '../input/link';
import type { WishMarkupFormatters } from '../content/wish-markup';
import { BotUserError } from '../errors';
import type { BotRequest, SessionState } from '../runtime/types';
import { createGiveService } from './give-service';
import { createSearchService } from './search-service';
import { createShareService } from './share-service';
import { createWishService } from './wish-service';

export const requireUser = (req: BotRequest): UserRecord => {
    if (req.user === null) {
        throw new BotUserError(req.LL.errors.outdatedButton());
    }

    return req.user;
};

export const createWishFormatters = (req: BotRequest): WishMarkupFormatters => {
    const currency = req.user?.currency;

    return {
        formatMoney: value => {
            return formatCurrency(value, req.locale, currency);
        },
        formatDate: value => {
            return formatDate(value, req.locale);
        }
    };
};

export const getRemoveLabels = () => {
    return getAllLocaleTexts(LL => {
        return LL.actions.remove();
    });
};

export const createWishScreenServices = (req: BotRequest) => {
    return {
        wishes: createWishService(req.repos),
        gives: createGiveService(req.repos),
        search: createSearchService(req.repos),
        share: createShareService(req.repos)
    };
};

export const releaseRemovedImages = (
    req: BotRequest,
    fileIds: readonly string[]
) => {
    if (fileIds.length === 0) {
        return;
    }

    req.defer(() => {
        return releaseOrphanedImages(
            { repositories: req.repos, bucket: req.env.IMAGES },
            fileIds
        );
    }, 0);
};

export const updateSession = (
    req: BotRequest,
    patch: Partial<Pick<SessionState, 'pendingInput' | 'find'>>
) => {
    const next: SessionState = { ...req.session, ...patch };

    req.setSession(next);

    return next;
};

export const openLinkButton = (
    req: BotRequest,
    link: string | null
): InlineKeyboardButton[] => {
    return isRenderableLink(link)
        ? [urlButton(req.LL.actions.open(), link)]
        : [];
};

export const getOwnerPublicUsername = (
    owner: Pick<UserRecord, 'username' | 'usernameSearchable'>
) => {
    if (owner.usernameSearchable && owner.username) {
        return `@${owner.username}`;
    }

    return null;
};

export const isFindableOwner = (
    owner: Pick<UserRecord, 'usernameSearchable' | 'phone' | 'blockedAt'>
) => {
    return (
        owner.blockedAt === null &&
        (owner.usernameSearchable || owner.phone !== null)
    );
};
