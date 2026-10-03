import {
    buildAuthorName,
    canShowPublicUsername,
    createShareService,
    resolvePublicOrigin
} from '../../bot/services/share-service';
import type { UserRecord } from '../../db/repositories';
import { buildShareUrl } from '../../web/share/public-id';
import type { ApiContext, ApiHandler } from '../context';
import { requireUser } from '../context';
import { toShareDto } from '../dto';
import { ApiError } from '../errors';
import { createBodyReader, readJsonBody, validationError } from '../validate';
import { emitAppAction } from '../telemetry';

const SHARE_PAGE_FALLBACK_NAME = '—';

const getShareService = (c: ApiContext) => {
    return createShareService(c.var.repos, c.var.deps.now);
};

const getPublicOrigin = (c: ApiContext) => {
    return resolvePublicOrigin(
        new URL(c.req.url).origin,
        c.env.BOT_ENVIRONMENT
    );
};

const respondWithShare = async (c: ApiContext, user: UserRecord) => {
    const service = getShareService(c);
    const state = await service.getEntryState(user.id);
    const share = state === 'shared' ? await service.getShare(user.id) : null;
    const origin = getPublicOrigin(c);

    return c.json(
        toShareDto({
            state: share === null && state === 'shared' ? 'unshared' : state,
            share,
            url: share === null ? null : buildShareUrl(origin, share.publicId),
            user,
            consentName:
                buildAuthorName(c.var.actor) || SHARE_PAGE_FALLBACK_NAME,
            host: new URL(origin).host
        })
    );
};

export const getShare: ApiHandler = async c => {
    return respondWithShare(c, requireUser(c));
};

export const publishShare: ApiHandler = async c => {
    const user = requireUser(c);
    const outcome = await getShareService(c).publish(
        user,
        buildAuthorName(c.var.actor)
    );

    if (outcome.status === 'empty') {
        throw new ApiError('shareEmpty');
    }

    emitAppAction(c, 'wishlist_shared', {
        result: outcome.status === 'created' ? 'published' : 'existing'
    });

    return respondWithShare(c, user);
};

export const setShareUsername: ApiHandler = async c => {
    const user = requireUser(c);
    const reader = createBodyReader(await readJsonBody(c));
    const show = reader.requiredBoolean('show');

    reader.finish();

    if (show === undefined) {
        throw new ApiError('validation');
    }

    const outcome = await getShareService(c).setShowUsername(user, show);

    if (outcome === null) {
        throw new ApiError('notShared');
    }

    if (show && !canShowPublicUsername(user)) {
        throw validationError('show', 'usernameUnavailable');
    }

    if (outcome.changed) {
        emitAppAction(c, 'wishlist_share_username_toggled', {
            result: show ? 'on' : 'off'
        });
    }

    return respondWithShare(c, user);
};

export const rotateShare: ApiHandler = async c => {
    const user = requireUser(c);
    const rotated = await getShareService(c).rotate(user.id);

    if (rotated === null) {
        throw new ApiError('notShared');
    }

    emitAppAction(c, 'wishlist_share_rotated', { result: 'success' });

    return respondWithShare(c, user);
};

export const stopShare: ApiHandler = async c => {
    const user = requireUser(c);
    const stopped = await getShareService(c).stop(user.id);

    if (stopped) {
        emitAppAction(c, 'wishlist_share_stopped', { result: 'success' });
    }

    return respondWithShare(c, user);
};
