import {
    removeReplyKeyboard,
    removeValueKeyboard
} from '../../bot/content/keyboards';
import { getTranslator } from '../../bot/i18n';
import { parseWishImages } from '../../bot/input/wish-images';
import { pickLargestPhoto } from '../../bot/input/photo';
import {
    loadSession,
    saveSessionIfChanged
} from '../../bot/runtime/session-store';
import { createWishService } from '../../bot/services/wish-service';
import type { WishRecord } from '../../db/repositories';
import {
    APP_MAX_WISH_IMAGES,
    APP_UPLOAD_MAX_BYTES,
    type OwnWishDto
} from '../../shared/app-api';
import {
    appPhotoUploadedEvent,
    type AppPhotoUploadResult
} from '../../worker/telemetry';
import {
    emitApiTelemetry,
    getSigner,
    getTelegramApi,
    requireUser,
    runInBackground,
    type ApiContext,
    type ApiHandler
} from '../context';
import { mintWishImages, resolveRequestLocale, toOwnWishDto } from '../dto';
import { ApiError } from '../errors';
import { releaseImagesInBackground } from '../photos/image-cleanup';
import { getImageIdentity, IMAGE_HASH_PATTERN } from '../photos/image-key';
import { matchesDeclaredImageType } from '../photos/image-signature';
import { normalizeImageContentType } from '../photos/image-store';
import { TelegramApiError, type TelegramApi } from '../telegram-api';
import { readIdParam, readIndexParam, validationError } from '../validate';

const TELEGRAM_FORBIDDEN_CODE = 403;
const UPLOAD_FILE_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
} as const;

const isTelegramForbidden = (error: unknown) => {
    return (
        error instanceof TelegramApiError &&
        error.response.error_code === TELEGRAM_FORBIDDEN_CODE
    );
};

const getWishService = (c: ApiContext) => {
    return createWishService(c.var.repos, c.var.deps.now);
};

const requireOwnedWish = async (c: ApiContext) => {
    const user = requireUser(c);
    const wishId = readIdParam(c, 'id');
    const wish = await getWishService(c).findOwned(wishId, user.id);

    if (wish === null) {
        throw new ApiError('notFound');
    }

    return { user, wishId, wish };
};

const respondWithWish = async (c: ApiContext, wish: WishRecord) => {
    const images = await mintWishImages(
        {
            crypto: c.var.deps.crypto,
            signer: getSigner(c),
            now: c.var.deps.now()
        },
        wish
    );
    const body: OwnWishDto = toOwnWishDto(wish, images);

    return c.json(body);
};

const reloadOwnedWish = async (c: ApiContext, wishId: number) => {
    const wish = await getWishService(c).findOwned(wishId, requireUser(c).id);

    if (wish === null) {
        throw new ApiError('notFound');
    }

    return wish;
};

const rejectUpload = (
    c: ApiContext,
    result: AppPhotoUploadResult,
    error: ApiError
): never => {
    emitApiTelemetry(c, appPhotoUploadedEvent(result));

    throw error;
};

const sendUploadedPhoto = async (
    c: ApiContext,
    api: TelegramApi,
    bytes: ArrayBuffer,
    contentType: keyof typeof UPLOAD_FILE_EXTENSIONS
) => {
    try {
        return await api.sendPhoto(
            c.var.actor.id,
            new Blob([bytes], { type: contentType }),
            {
                disable_notification: true,
                filename: `photo.${UPLOAD_FILE_EXTENSIONS[contentType]}`
            }
        );
    } catch (error) {
        return rejectUpload(
            c,
            isTelegramForbidden(error)
                ? 'writeAccessRequired'
                : 'telegramError',
            new ApiError(
                isTelegramForbidden(error) ? 'writeAccessRequired' : 'upstream'
            )
        );
    }
};

const readUploadBody = async (c: ApiContext) => {
    let bytes: ArrayBuffer;

    try {
        bytes = await c.req.arrayBuffer();
    } catch {
        return rejectUpload(c, 'tooLarge', new ApiError('payloadTooLarge'));
    }

    if (bytes.byteLength > APP_UPLOAD_MAX_BYTES) {
        return rejectUpload(c, 'tooLarge', new ApiError('payloadTooLarge'));
    }

    if (bytes.byteLength === 0) {
        throw validationError('body', 'empty');
    }

    return bytes;
};

export const uploadWishImage: ApiHandler = async c => {
    const { user, wishId, wish } = await requireOwnedWish(c);

    if (parseWishImages(wish.images).length >= APP_MAX_WISH_IMAGES) {
        return rejectUpload(c, 'full', new ApiError('imagesFull'));
    }

    const contentType = normalizeImageContentType(c.req.header('Content-Type'));

    if (contentType === null) {
        return rejectUpload(c, 'unsupported', new ApiError('unsupportedMedia'));
    }

    const bytes = await readUploadBody(c);

    if (!matchesDeclaredImageType(bytes, contentType)) {
        return rejectUpload(c, 'unsupported', new ApiError('unsupportedMedia'));
    }

    const api = getTelegramApi(c);
    const sent = await sendUploadedPhoto(c, api, bytes, contentType);
    const cleanUp = runInBackground(
        c,
        api.deleteMessage(c.var.actor.id, sent.message_id)
    );
    const photo = pickLargestPhoto(sent.photo);

    if (photo === null) {
        await cleanUp;

        return rejectUpload(c, 'telegramError', new ApiError('upstream'));
    }

    const appended = await getWishService(c).appendImage(
        wishId,
        user.id,
        photo.file_id
    );

    await cleanUp;

    switch (appended.outcome) {
        case 'missing':
            throw new ApiError('notFound');
        case 'full':
            return rejectUpload(c, 'full', new ApiError('imagesFull'));
        case 'duplicate':
        case 'appended':
            emitApiTelemetry(c, appPhotoUploadedEvent(appended.outcome));

            return respondWithWish(c, await reloadOwnedWish(c, wishId));
    }
};

const readHashQuery = (c: ApiContext) => {
    const hash = c.req.query('hash');

    if (hash === undefined || hash === '') {
        throw validationError('hash', 'required');
    }

    if (!IMAGE_HASH_PATTERN.test(hash)) {
        throw validationError('hash', 'invalid');
    }

    return hash;
};

export const removeWishImage: ApiHandler = async c => {
    const { user, wishId, wish } = await requireOwnedWish(c);
    const index = readIndexParam(c, 'index');
    const hash = readHashQuery(c);
    const fileId = parseWishImages(wish.images)[index];

    if (
        fileId === undefined ||
        (await getImageIdentity(c.var.deps.crypto, fileId)).hash !== hash
    ) {
        throw new ApiError('imageChanged');
    }

    const updated = await getWishService(c).removeImageAt(
        wishId,
        user.id,
        index,
        wish.images
    );

    if (updated === null) {
        await reloadOwnedWish(c, wishId);

        throw new ApiError('imageChanged');
    }

    await releaseImagesInBackground(c, [fileId]);

    return respondWithWish(c, updated);
};

export const clearWishImages: ApiHandler = async c => {
    const { user, wishId, wish } = await requireOwnedWish(c);
    const cleared = await getWishService(c).clearImages(wishId, user.id);

    if (!cleared) {
        throw new ApiError('notFound');
    }

    await releaseImagesInBackground(c, parseWishImages(wish.images));

    return respondWithWish(c, await reloadOwnedWish(c, wishId));
};

export const startImageChatIntent: ApiHandler = async c => {
    const { wishId, wish } = await requireOwnedWish(c);
    const { actor, repos, deps } = c.var;
    const LL = getTranslator(resolveRequestLocale(actor, c.var.user, null));
    const hasImages = parseWishImages(wish.images).length > 0;
    const scenes = LL.wishlist.edit.scenes;

    try {
        await getTelegramApi(c).sendMessage(
            actor.id,
            hasImages ? scenes.updateImages() : scenes.addImages(),
            {
                reply_markup: hasImages
                    ? removeValueKeyboard(LL)
                    : removeReplyKeyboard()
            }
        );
    } catch (error) {
        throw isTelegramForbidden(error)
            ? new ApiError('writeAccessRequired')
            : new ApiError('upstream');
    }

    const session = await loadSession(repos, actor.id);

    await saveSessionIfChanged(
        repos,
        actor.id,
        session.state,
        {
            ...session.state,
            pendingInput: { kind: 'wishField', wishId, field: 'images' }
        },
        deps.now()
    );

    return c.body(null, 204);
};
