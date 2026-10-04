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
import { isSkippedStagedImage } from '../../bot/services/link-import/types';
import { createWishService } from '../../bot/services/wish-service';
import type { UserRecord, WishRecord } from '../../db/repositories';
import {
    APP_MAX_WISH_IMAGES,
    APP_UPLOAD_MAX_BYTES,
    IMAGE_REORDER_SOURCES,
    LINK_IMPORT_IMAGE_MAX_BYTES,
    LINK_IMPORT_MAX_IMAGE_CANDIDATES,
    type AppUploadContentType,
    type OwnWishDto
} from '../../shared/app-api';
import { isLinkImportEnabled } from '../../worker/env';
import {
    appPhotoUploadedEvent,
    type AppPhotoUploadResult
} from '../../worker/telemetry';
import {
    emitApiTelemetry,
    getImportSigner,
    getLinkImportDeps,
    getSigner,
    getTelegramApi,
    requireLinkImportServices,
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
import { emitAppAction } from '../telemetry';
import {
    createBodyReader,
    type BodyReader,
    readIdParam,
    readIndexParam,
    readJsonBody,
    validationError
} from '../validate';

const TELEGRAM_BAD_REQUEST_CODE = 400;
const TELEGRAM_FORBIDDEN_CODE = 403;
const UPLOAD_FILE_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
} as const;

const hasTelegramErrorCode = (error: unknown, code: number) => {
    return (
        error instanceof TelegramApiError && error.response.error_code === code
    );
};

const isTelegramForbidden = (error: unknown) => {
    return hasTelegramErrorCode(error, TELEGRAM_FORBIDDEN_CODE);
};

type TelegramPhotoRejection = 'upstream' | 'unsupportedMedia';

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

const rejectTelegramFailure = (
    c: ApiContext,
    error: unknown,
    badRequestCode: TelegramPhotoRejection
): never => {
    if (isTelegramForbidden(error)) {
        return rejectUpload(
            c,
            'writeAccessRequired',
            new ApiError('writeAccessRequired')
        );
    }

    if (
        badRequestCode === 'unsupportedMedia' &&
        hasTelegramErrorCode(error, TELEGRAM_BAD_REQUEST_CODE)
    ) {
        return rejectUpload(c, 'unsupported', new ApiError('unsupportedMedia'));
    }

    return rejectUpload(c, 'telegramError', new ApiError('upstream'));
};

const sendUploadedPhoto = async (
    c: ApiContext,
    api: TelegramApi,
    bytes: ArrayBuffer,
    contentType: AppUploadContentType,
    badRequestCode: TelegramPhotoRejection
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
        return rejectTelegramFailure(c, error, badRequestCode);
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

const ingestPhotoBytes = async (
    c: ApiContext,
    input: {
        user: UserRecord;
        wishId: number;
        bytes: ArrayBuffer;
        contentType: AppUploadContentType;
        badRequestCode: TelegramPhotoRejection;
    }
) => {
    const { user, wishId, bytes, contentType } = input;
    const api = getTelegramApi(c);
    const sent = await sendUploadedPhoto(
        c,
        api,
        bytes,
        contentType,
        input.badRequestCode
    );
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

    return ingestPhotoBytes(c, {
        user,
        wishId,
        bytes,
        contentType,
        badRequestCode: 'upstream'
    });
};

const IMPORT_TOKEN_MAX_LENGTH = 160;

const readImportIndex = (reader: BodyReader) => {
    const raw = reader.body['index'];

    if (!reader.has('index')) {
        reader.fail('index', 'required');

        return undefined;
    }

    if (
        typeof raw !== 'number' ||
        !Number.isInteger(raw) ||
        raw < 0 ||
        raw >= LINK_IMPORT_MAX_IMAGE_CANDIDATES
    ) {
        reader.fail('index', 'invalid');

        return undefined;
    }

    return raw;
};

const readImportInput = async (c: ApiContext) => {
    const reader = createBodyReader(await readJsonBody(c));
    const importToken = reader.requiredString('importToken', {
        maxLength: IMPORT_TOKEN_MAX_LENGTH
    });
    const index = readImportIndex(reader);

    reader.finish();

    if (importToken === undefined || index === undefined) {
        throw new ApiError('validation');
    }

    return { importToken, index };
};

const requireImportClaims = async (
    c: ApiContext,
    userId: number,
    importToken: string
) => {
    const verified = await getImportSigner(c).verifyImportToken(
        importToken,
        c.var.deps.now()
    );

    if (!verified.ok || verified.claims.userId !== userId) {
        throw validationError('importToken', 'invalid');
    }

    return verified.claims;
};

export const importWishImage: ApiHandler = async c => {
    if (!isLinkImportEnabled(c.env)) {
        throw new ApiError('disabled');
    }

    const services = requireLinkImportServices(c);
    const { user, wishId, wish } = await requireOwnedWish(c);

    if (parseWishImages(wish.images).length >= APP_MAX_WISH_IMAGES) {
        return rejectUpload(c, 'full', new ApiError('imagesFull'));
    }

    const { importToken, index } = await readImportInput(c);
    const claims = await requireImportClaims(c, user.id, importToken);
    const staged = await services.loadStagedImage(getLinkImportDeps(c), {
        urlHash: claims.urlHash,
        index
    });

    if (isSkippedStagedImage(staged)) {
        return staged.skipped === 'unsupportedFormat'
            ? rejectUpload(c, 'unsupported', new ApiError('unsupportedMedia'))
            : rejectUpload(c, 'telegramError', new ApiError('upstream'));
    }

    if (
        staged.body.byteLength > LINK_IMPORT_IMAGE_MAX_BYTES ||
        !matchesDeclaredImageType(staged.body, staged.contentType)
    ) {
        return rejectUpload(c, 'unsupported', new ApiError('unsupportedMedia'));
    }

    return ingestPhotoBytes(c, {
        user,
        wishId,
        bytes: staged.body,
        contentType: staged.contentType,
        badRequestCode: 'unsupportedMedia'
    });
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

const isImageHash = (value: unknown): value is string => {
    return typeof value === 'string' && IMAGE_HASH_PATTERN.test(value);
};

const readReorderSource = (body: Record<string, unknown>) => {
    const reader = createBodyReader(body);
    const source = reader.optionalOneOf('source', IMAGE_REORDER_SOURCES);

    reader.finish();

    return source;
};

const readReorderInput = async (c: ApiContext) => {
    const body = await readJsonBody(c);
    const raw = body['hashes'];

    if (raw === undefined) {
        throw validationError('hashes', 'required');
    }

    if (
        !Array.isArray(raw) ||
        raw.length > APP_MAX_WISH_IMAGES ||
        !raw.every(isImageHash) ||
        new Set(raw).size !== raw.length
    ) {
        throw validationError('hashes', 'invalid');
    }

    return { hashes: raw, source: readReorderSource(body) };
};

const mapHashesToFileIds = async (
    c: ApiContext,
    fileIds: readonly string[],
    hashes: readonly string[]
) => {
    const entries = await Promise.all(
        fileIds.map(async fileId => {
            const { hash } = await getImageIdentity(c.var.deps.crypto, fileId);

            return [hash, fileId] as const;
        })
    );
    const fileIdByHash = new Map(entries);

    if (
        hashes.length !== fileIds.length ||
        fileIdByHash.size !== fileIds.length
    ) {
        return null;
    }

    const ordered = hashes.map(hash => fileIdByHash.get(hash));

    return ordered.every((fileId): fileId is string => fileId !== undefined)
        ? ordered
        : null;
};

const isSameFileOrder = (left: readonly string[], right: readonly string[]) => {
    return left.every((fileId, index) => fileId === right[index]);
};

export const reorderWishImages: ApiHandler = async c => {
    const { user, wishId, wish } = await requireOwnedWish(c);
    const { hashes, source } = await readReorderInput(c);
    const current = parseWishImages(wish.images);
    const ordered = await mapHashesToFileIds(c, current, hashes);

    if (ordered === null) {
        throw new ApiError('imageChanged');
    }

    if (isSameFileOrder(ordered, current)) {
        return respondWithWish(c, wish);
    }

    const updated = await getWishService(c).reorderImages(
        wishId,
        user.id,
        ordered,
        wish.images
    );

    if (updated === null) {
        await reloadOwnedWish(c, wishId);

        throw new ApiError('imageChanged');
    }

    emitAppAction(
        c,
        'wish_images_reordered',
        source === undefined ? {} : { result: source }
    );

    return respondWithWish(c, updated);
};
