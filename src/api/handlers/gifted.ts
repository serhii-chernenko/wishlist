import {
    createGiftedService,
    getReleasableImages
} from '../../bot/services/gifted-service';
import {
    getSigner,
    requireUser,
    type ApiContext,
    type ApiHandler
} from '../context';
import {
    mintWishImages,
    resolveRequestLocale,
    toMeDto,
    toOwnWishDto
} from '../dto';
import { ApiError } from '../errors';
import { releaseImagesInBackground } from '../photos/image-cleanup';
import { emitAppAction } from '../telemetry';
import { createBodyReader, readIdParam, readJsonBody } from '../validate';

const NO_CONTENT = 204;

const getGiftedService = (c: ApiContext) => {
    return createGiftedService(c.var.repos, c.var.deps.now);
};

const readRequiredFlag = async (c: ApiContext, name: string) => {
    const reader = createBodyReader(await readJsonBody(c));
    const value = reader.requiredBoolean(name);

    reader.finish();

    if (value === undefined) {
        throw new ApiError('validation');
    }

    return value;
};

export const restoreWish: ApiHandler = async c => {
    const user = requireUser(c);
    const outcome = await getGiftedService(c).restore(
        readIdParam(c, 'id'),
        user.id
    );

    if (outcome.status === 'wishLimit') {
        throw new ApiError('wishLimit');
    }

    if (outcome.status === 'missing') {
        throw new ApiError('notFound');
    }

    if (outcome.status === 'restored') {
        emitAppAction(c, 'wish_restored');
    }

    const images = await mintWishImages(
        {
            crypto: c.var.deps.crypto,
            signer: getSigner(c),
            now: c.var.deps.now(),
            audience: 'owner'
        },
        outcome.wish
    );

    return c.json(toOwnWishDto(outcome.wish, images));
};

export const hideGiftedWish: ApiHandler = async c => {
    const user = requireUser(c);
    const wishId = readIdParam(c, 'id');
    const hidden = await readRequiredFlag(c, 'hidden');
    const outcome = await getGiftedService(c).setHidden(
        wishId,
        user.id,
        hidden
    );

    if (outcome.status === 'missing') {
        throw new ApiError('notFound');
    }

    await releaseImagesInBackground(c, getReleasableImages(outcome, hidden));
    emitAppAction(c, 'gifted_hidden', { result: hidden ? 'on' : 'off' });

    return c.body(null, NO_CONTENT);
};

export const setShowGifted: ApiHandler = async c => {
    const user = requireUser(c);
    const show = await readRequiredFlag(c, 'show');
    const outcome = await getGiftedService(c).setShowGifted(user, show);

    if (outcome === null) {
        throw new ApiError('internal');
    }

    if (outcome.changed) {
        emitAppAction(c, 'show_gifted_changed', {
            result: show ? 'on' : 'off'
        });
    }

    const { actor } = c.var;

    return c.json(
        toMeDto({
            actor,
            user: outcome.user,
            sessionLanguage: null,
            locale: resolveRequestLocale(actor, outcome.user, null)
        })
    );
};
