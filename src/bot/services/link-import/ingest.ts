import type {
    MediaGroupPhoto,
    SentPhotoMessage,
    TelegramApi
} from '../../../api/telegram-api';
import type { AppUploadContentType } from '../../../shared/app-api';
import { pickLargestPhoto } from '../../input/photo';
import { sendWithRetry, TELEGRAM_CAPTION_LIMIT } from '../../runtime/send';
import { getVisibleHtmlLength } from '../../utils/strings';
import {
    isTelegramBadRequest,
    isTelegramForbidden
} from '../../utils/telegram-errors';
import type {
    ImportPreviewInput,
    SendImportPreview,
    StagedImageBody
} from './types';

const HTML_PARSE_MODE = 'HTML';
const ALBUM_MIN_PHOTOS = 2;
const PHOTO_FILE_EXTENSIONS: Record<AppUploadContentType, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
};

export type ImportIngestResult =
    | { ok: true; fileId: string }
    | { ok: false; reason: 'writeAccessRequired' | 'telegramError' };

const toPhotoFilename = (image: StagedImageBody, position: number) => {
    return `photo-${position}.${PHOTO_FILE_EXTENSIONS[image.contentType]}`;
};

const toMediaGroupPhoto = (
    image: StagedImageBody,
    position: number
): MediaGroupPhoto & { filename: string } => {
    return {
        photo: new Blob([image.body], { type: image.contentType }),
        filename: toPhotoFilename(image, position)
    };
};

const toFileId = (message: SentPhotoMessage) => {
    return pickLargestPhoto(message.photo ?? [])?.file_id ?? null;
};

const collectFileIds = (messages: readonly SentPhotoMessage[]) => {
    return messages.flatMap(message => {
        const fileId = toFileId(message);

        return fileId === null ? [] : [fileId];
    });
};

const fitsCaption = (html: string) => {
    return getVisibleHtmlLength(html) <= TELEGRAM_CAPTION_LIMIT;
};

const skipBadRequest = async <Result>(
    operation: () => Promise<Result>
): Promise<Result | null> => {
    try {
        return await sendWithRetry(operation);
    } catch (error) {
        if (isTelegramBadRequest(error)) {
            return null;
        }

        throw error;
    }
};

const sendText = async (api: TelegramApi, input: ImportPreviewInput) => {
    await sendWithRetry(() => {
        return api.sendMessage(input.chatId, input.html, {
            parse_mode: HTML_PARSE_MODE,
            ...(input.replyMarkup === undefined
                ? {}
                : { reply_markup: input.replyMarkup })
        });
    });
};

const sendPhotosOneByOne = async (
    api: TelegramApi,
    input: ImportPreviewInput
) => {
    const fileIds: string[] = [];

    for (const [position, image] of input.images.entries()) {
        const { photo, filename } = toMediaGroupPhoto(image, position);
        const sent = await skipBadRequest(() => {
            return api.sendPhoto(input.chatId, photo, { filename });
        });
        const fileId = sent === null ? null : toFileId(sent);

        if (fileId !== null) {
            fileIds.push(fileId);
        }
    }

    return fileIds;
};

const sendSinglePhotoPreview = async (
    api: TelegramApi,
    input: ImportPreviewInput,
    image: StagedImageBody
) => {
    const { photo, filename } = toMediaGroupPhoto(image, 0);
    const captioned = fitsCaption(input.html);
    const sent = await skipBadRequest(() => {
        return api.sendPhoto(input.chatId, photo, {
            filename,
            ...(captioned
                ? {
                      caption: input.html,
                      parse_mode: HTML_PARSE_MODE,
                      ...(input.replyMarkup === undefined
                          ? {}
                          : { reply_markup: input.replyMarkup })
                  }
                : {})
        });
    });
    const fileId = sent === null ? null : toFileId(sent);

    if (sent === null || !captioned) {
        await sendText(api, input);
    }

    return { fileIds: fileId === null ? [] : [fileId], textDelivered: true };
};

const sendAlbumPreview = async (
    api: TelegramApi,
    input: ImportPreviewInput
) => {
    const captioned =
        input.replyMarkup === undefined && fitsCaption(input.html);
    const album = await skipBadRequest(() => {
        return api.sendMediaGroup(
            input.chatId,
            input.images.map(toMediaGroupPhoto),
            captioned
                ? { caption: input.html, parse_mode: HTML_PARSE_MODE }
                : {}
        );
    });

    if (album !== null && captioned) {
        return { fileIds: collectFileIds(album), textDelivered: true };
    }

    const fileIds =
        album === null
            ? await sendPhotosOneByOne(api, input)
            : collectFileIds(album);

    await sendText(api, input);

    return { fileIds, textDelivered: true };
};

/**
 * Sends the bot's import preview, which doubles as the upload: the returned
 * file ids are what the wish stores. Two or more images go out as an album
 * whose first item carries the caption when it fits and there is no reply
 * markup; otherwise a text message with the markup follows. A refused album
 * falls back to one photo at a time, then to text only. Errors other than
 * 400 propagate.
 */
export const sendImportPreview: SendImportPreview = async (api, input) => {
    const [firstImage] = input.images;

    if (firstImage === undefined) {
        await sendText(api, input);

        return { fileIds: [], textDelivered: true };
    }

    return input.images.length < ALBUM_MIN_PHOTOS
        ? sendSinglePhotoPreview(api, input, firstImage)
        : sendAlbumPreview(api, input);
};

const scheduleCleanup = async (
    api: TelegramApi,
    chatId: number,
    messageId: number,
    waitUntil: ((promise: Promise<unknown>) => void) | undefined
) => {
    const cleanup = api.deleteMessage(chatId, messageId).catch(() => {
        return false;
    });

    if (waitUntil === undefined) {
        await cleanup;
    } else {
        waitUntil(cleanup);
    }
};

/**
 * Uploads one staged image to the user's own chat the way Mini App uploads
 * do: multipart `sendPhoto`, keep the largest `file_id`, then delete the
 * message in the background. A 403 means the bot may not write to the user.
 */
export const ingestStagedImage = async (
    api: TelegramApi,
    input: {
        chatId: number;
        image: StagedImageBody;
        waitUntil?: (promise: Promise<unknown>) => void;
    }
): Promise<ImportIngestResult> => {
    const { photo, filename } = toMediaGroupPhoto(input.image, 0);
    let sent: SentPhotoMessage;

    try {
        sent = await api.sendPhoto(input.chatId, photo, {
            disable_notification: true,
            filename
        });
    } catch (error) {
        return {
            ok: false,
            reason: isTelegramForbidden(error)
                ? 'writeAccessRequired'
                : 'telegramError'
        };
    }

    await scheduleCleanup(api, input.chatId, sent.message_id, input.waitUntil);

    const fileId = toFileId(sent);

    return fileId === null
        ? { ok: false, reason: 'telegramError' }
        : { ok: true, fileId };
};
