import type { File, Message, PhotoSize } from 'telegraf/types';

export interface TelegramApiErrorResponse {
    error_code: number;
    description: string;
    parameters?: { retry_after?: number };
}

const REDACTED = '[redacted]';
const API_ORIGIN = 'https://api.telegram.org';
const NETWORK_ERROR_CODE = 0;

/**
 * Error carrying Telegram's `error_code`/`description` in the same `response`
 * shape as Telegraf's TelegramError, so `src/bot/utils/telegram-errors`
 * helpers and `sendWithRetry` work unchanged. Never contains the bot token or
 * any api.telegram.org URL.
 */
export class TelegramApiError extends Error {
    readonly response: TelegramApiErrorResponse;

    constructor(method: string, response: TelegramApiErrorResponse) {
        super(`Telegram ${method} failed with ${response.error_code}`);
        this.name = 'TelegramApiError';
        this.response = response;
    }
}

export interface SendMessageExtra {
    parse_mode?: 'HTML';
    disable_notification?: boolean;
    reply_markup?: unknown;
    link_preview_options?: { is_disabled?: boolean };
}

export interface SendPhotoExtra {
    caption?: string;
    parse_mode?: 'HTML';
    disable_notification?: boolean;
    reply_markup?: unknown;
    filename?: string;
}

export interface MediaGroupPhoto {
    photo: Blob;
    filename?: string;
}

export interface SendMediaGroupExtra {
    caption?: string;
    parse_mode?: 'HTML';
    disable_notification?: boolean;
}

export type SentPhotoMessage = Message.PhotoMessage & { photo: PhotoSize[] };

export interface TelegramApi {
    sendMessage(
        chatId: number | string,
        text: string,
        extra?: SendMessageExtra
    ): Promise<Message.TextMessage>;
    sendPhoto(
        chatId: number | string,
        photo: Blob,
        extra?: SendPhotoExtra
    ): Promise<SentPhotoMessage>;
    sendMediaGroup(
        chatId: number | string,
        photos: readonly MediaGroupPhoto[],
        extra?: SendMediaGroupExtra
    ): Promise<SentPhotoMessage[]>;
    deleteMessage(chatId: number | string, messageId: number): Promise<boolean>;
    getFile(fileId: string): Promise<File>;
    downloadFile(filePath: string): Promise<Response>;
}

export interface TelegramApiOptions {
    botToken: string;
    fetch?: typeof fetch;
}

type TelegramEnvelope<Result> =
    | { ok: true; result: Result }
    | {
          ok: false;
          error_code?: number;
          description?: string;
          parameters?: { retry_after?: number };
      };

const DEFAULT_PHOTO_FILENAME = 'photo.jpg';
const MEDIA_ATTACHMENT_PREFIX = 'p';

const setOptionalField = (
    form: FormData,
    name: string,
    value: string | boolean | undefined
) => {
    if (value !== undefined) {
        form.set(name, String(value));
    }
};

const buildMediaGroupItems = (count: number, extra: SendMediaGroupExtra) => {
    return Array.from({ length: count }, (_, index) => {
        const isCaptioned = index === 0 && extra.caption !== undefined;

        return {
            type: 'photo',
            media: `attach://${MEDIA_ATTACHMENT_PREFIX}${index}`,
            ...(isCaptioned ? { caption: extra.caption } : {}),
            ...(isCaptioned && extra.parse_mode !== undefined
                ? { parse_mode: extra.parse_mode }
                : {})
        };
    });
};

export const createTelegramApi = (options: TelegramApiOptions): TelegramApi => {
    const send = options.fetch ?? fetch;
    const redact = (value: string) => {
        return options.botToken
            ? value.replaceAll(options.botToken, REDACTED)
            : value;
    };
    const fail = (
        method: string,
        response: TelegramApiErrorResponse
    ): TelegramApiError => {
        return new TelegramApiError(method, {
            ...response,
            description: redact(response.description)
        });
    };

    const call = async <Result>(
        method: string,
        body: BodyInit,
        headers?: HeadersInit
    ): Promise<Result> => {
        let response: Response;

        try {
            response = await send(
                `${API_ORIGIN}/bot${options.botToken}/${method}`,
                {
                    method: 'POST',
                    body,
                    ...(headers === undefined ? {} : { headers })
                }
            );
        } catch {
            throw fail(method, {
                error_code: NETWORK_ERROR_CODE,
                description: 'Network error'
            });
        }

        let payload: TelegramEnvelope<Result>;

        try {
            payload = (await response.json()) as TelegramEnvelope<Result>;
        } catch {
            throw fail(method, {
                error_code: response.status,
                description: 'Invalid response'
            });
        }

        if (!payload.ok) {
            throw fail(method, {
                error_code: payload.error_code ?? response.status,
                description: payload.description ?? '',
                ...(payload.parameters === undefined
                    ? {}
                    : { parameters: payload.parameters })
            });
        }

        return payload.result;
    };

    const callJson = <Result>(method: string, body: object) => {
        return call<Result>(method, JSON.stringify(body), {
            'Content-Type': 'application/json'
        });
    };

    return {
        sendMessage(chatId, text, extra = {}) {
            return callJson<Message.TextMessage>('sendMessage', {
                chat_id: chatId,
                text,
                ...extra
            });
        },
        sendPhoto(chatId, photo, extra = {}) {
            const form = new FormData();

            form.set('chat_id', String(chatId));
            form.set('photo', photo, extra.filename ?? DEFAULT_PHOTO_FILENAME);
            setOptionalField(form, 'caption', extra.caption);
            setOptionalField(form, 'parse_mode', extra.parse_mode);
            setOptionalField(
                form,
                'disable_notification',
                extra.disable_notification
            );

            if (extra.reply_markup !== undefined) {
                form.set('reply_markup', JSON.stringify(extra.reply_markup));
            }

            return call<SentPhotoMessage>('sendPhoto', form);
        },
        sendMediaGroup(chatId, photos, extra = {}) {
            const form = new FormData();

            form.set('chat_id', String(chatId));
            form.set(
                'media',
                JSON.stringify(buildMediaGroupItems(photos.length, extra))
            );
            setOptionalField(
                form,
                'disable_notification',
                extra.disable_notification
            );
            photos.forEach((item, index) => {
                form.set(
                    `${MEDIA_ATTACHMENT_PREFIX}${index}`,
                    item.photo,
                    item.filename ?? DEFAULT_PHOTO_FILENAME
                );
            });

            return call<SentPhotoMessage[]>('sendMediaGroup', form);
        },
        deleteMessage(chatId, messageId) {
            return callJson<boolean>('deleteMessage', {
                chat_id: chatId,
                message_id: messageId
            });
        },
        getFile(fileId) {
            return callJson<File>('getFile', { file_id: fileId });
        },
        async downloadFile(filePath) {
            let response: Response;

            try {
                response = await send(
                    `${API_ORIGIN}/file/bot${options.botToken}/${filePath}`
                );
            } catch {
                throw fail('downloadFile', {
                    error_code: NETWORK_ERROR_CODE,
                    description: 'Network error'
                });
            }

            if (!response.ok) {
                throw fail('downloadFile', {
                    error_code: response.status,
                    description: 'Download failed'
                });
            }

            return response;
        }
    };
};
