import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    createTelegramApi,
    TelegramApiError,
    type MediaGroupPhoto,
    type SendMediaGroupExtra,
    type SendPhotoExtra,
    type SentPhotoMessage,
    type TelegramApi
} from '../src/api/telegram-api';
import {
    ingestStagedImage,
    sendBotImportPreview,
    sendImportPreview
} from '../src/bot/services/link-import/ingest';
import type { StagedImageBody } from '../src/bot/services/link-import/types';
import {
    JPEG_BYTES,
    PNG_BYTES,
    toArrayBuffer,
    WEBP_BYTES
} from './fixtures/link-import-fakes';

const CHAT_ID = 4242;
const BOT_TOKEN = '123456:SECRET';
const SHORT_HTML = '<b>Чайник</b>\nЗаповнено з rozetka.com.ua';
const LONG_HTML = `<b>${'а'.repeat(1100)}</b>`;
const KEYBOARD = {
    inline_keyboard: [[{ text: 'Відкрити', url: 'https://shop.example' }]]
};

const staged = (
    bytes: Uint8Array,
    contentType: StagedImageBody['contentType']
) => {
    return { body: toArrayBuffer(bytes), contentType };
};

const JPEG = staged(JPEG_BYTES, 'image/jpeg');
const PNG = staged(PNG_BYTES, 'image/png');
const WEBP = staged(WEBP_BYTES, 'image/webp');

const photoMessage = (fileId: string, messageId = 1) => {
    return {
        message_id: messageId,
        photo: [
            { file_id: `${fileId}-small`, width: 90, height: 90 },
            { file_id: fileId, width: 1280, height: 960 }
        ]
    } as unknown as SentPhotoMessage;
};

const badRequest = (method: string) => {
    return new TelegramApiError(method, {
        error_code: 400,
        description: 'Bad Request: IMAGE_PROCESS_FAILED'
    });
};

interface RecordingTelegram extends TelegramApi {
    calls: string[];
    photoExtras: (SendPhotoExtra | undefined)[];
    albumExtras: (SendMediaGroupExtra | undefined)[];
    albumPhotos: (readonly MediaGroupPhoto[])[];
    textExtras: unknown[];
    deleted: number[];
    failAlbum: boolean;
    failPhotoAt: Set<number>;
    photoError: Error | null;
}

const createRecordingTelegram = (): RecordingTelegram => {
    let photoCount = 0;
    const fake: RecordingTelegram = {
        calls: [],
        photoExtras: [],
        albumExtras: [],
        albumPhotos: [],
        textExtras: [],
        deleted: [],
        failAlbum: false,
        failPhotoAt: new Set(),
        photoError: null,
        async sendMessage(_chatId, text, extra) {
            fake.calls.push(`text:${text === LONG_HTML ? 'long' : 'short'}`);
            fake.textExtras.push(extra);

            return {} as Awaited<ReturnType<TelegramApi['sendMessage']>>;
        },
        async sendPhoto(_chatId, _photo, extra) {
            const position = photoCount;

            photoCount += 1;
            fake.calls.push(`photo:${position}`);
            fake.photoExtras.push(extra);

            if (fake.photoError !== null) {
                throw fake.photoError;
            }

            if (fake.failPhotoAt.has(position)) {
                throw badRequest('sendPhoto');
            }

            return photoMessage(`photo-${position}`, 100 + position);
        },
        async sendMediaGroup(_chatId, photos, extra) {
            fake.calls.push(`album:${photos.length}`);
            fake.albumPhotos.push(photos);
            fake.albumExtras.push(extra);

            if (fake.failAlbum) {
                throw badRequest('sendMediaGroup');
            }

            return photos.map((_, index) => {
                return photoMessage(`album-${index}`, 200 + index);
            });
        },
        async editMessageText() {
            throw new Error('unexpected editMessageText');
        },
        async deleteMessage(_chatId, messageId) {
            fake.deleted.push(messageId);

            return true;
        },
        async getFile() {
            throw new Error('unexpected getFile');
        },
        async downloadFile() {
            throw new Error('unexpected downloadFile');
        }
    };

    return fake;
};

describe('sendImportPreview', () => {
    it('sends text only when no image survived', async () => {
        const telegram = createRecordingTelegram();
        const result = await sendImportPreview(telegram, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            replyMarkup: KEYBOARD,
            images: []
        });

        assert.deepEqual(result, {
            fileIds: [],
            rejected: 0,
            textDelivered: true
        });
        assert.deepEqual(telegram.calls, ['text:short']);
        assert.deepEqual(telegram.textExtras[0], {
            parse_mode: 'HTML',
            reply_markup: KEYBOARD
        });
    });

    it('sends one image with the caption and the keyboard when the caption fits', async () => {
        const telegram = createRecordingTelegram();
        const result = await sendImportPreview(telegram, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            replyMarkup: KEYBOARD,
            images: [WEBP]
        });

        assert.deepEqual(result, {
            fileIds: ['photo-0'],
            rejected: 0,
            textDelivered: true
        });
        assert.deepEqual(telegram.calls, ['photo:0']);
        assert.deepEqual(telegram.photoExtras[0], {
            filename: 'photo-0.webp',
            caption: SHORT_HTML,
            parse_mode: 'HTML',
            reply_markup: KEYBOARD
        });
    });

    it('sends a long caption as a separate text after the photo', async () => {
        const telegram = createRecordingTelegram();
        const result = await sendImportPreview(telegram, {
            chatId: CHAT_ID,
            html: LONG_HTML,
            images: [JPEG]
        });

        assert.deepEqual(result.fileIds, ['photo-0']);
        assert.deepEqual(telegram.calls, ['photo:0', 'text:long']);
        assert.deepEqual(telegram.photoExtras[0], { filename: 'photo-0.jpg' });
    });

    it('falls back to text when the only photo is refused', async () => {
        const telegram = createRecordingTelegram();

        telegram.failPhotoAt.add(0);

        const result = await sendImportPreview(telegram, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            images: [JPEG]
        });

        assert.deepEqual(result, {
            fileIds: [],
            rejected: 1,
            textDelivered: true
        });
        assert.deepEqual(telegram.calls, ['photo:0', 'text:short']);
    });

    it('sends an album with the caption on the first item when there is no keyboard', async () => {
        const telegram = createRecordingTelegram();
        const result = await sendImportPreview(telegram, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            images: [JPEG, PNG, WEBP]
        });

        assert.deepEqual(result, {
            fileIds: ['album-0', 'album-1', 'album-2'],
            rejected: 0,
            textDelivered: true
        });
        assert.deepEqual(telegram.calls, ['album:3']);
        assert.deepEqual(telegram.albumExtras[0], {
            caption: SHORT_HTML,
            parse_mode: 'HTML'
        });
        assert.deepEqual(
            telegram.albumPhotos[0]?.map(item => {
                return [item.filename, item.photo.type];
            }),
            [
                ['photo-0.jpg', 'image/jpeg'],
                ['photo-1.png', 'image/png'],
                ['photo-2.webp', 'image/webp']
            ]
        );
    });

    it('follows an album with a text message for the keyboard or a long caption', async () => {
        const withKeyboard = createRecordingTelegram();

        await sendImportPreview(withKeyboard, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            replyMarkup: KEYBOARD,
            images: [JPEG, PNG]
        });

        assert.deepEqual(withKeyboard.calls, ['album:2', 'text:short']);
        assert.deepEqual(withKeyboard.albumExtras[0], {});

        const longCaption = createRecordingTelegram();

        await sendImportPreview(longCaption, {
            chatId: CHAT_ID,
            html: LONG_HTML,
            images: [JPEG, PNG]
        });

        assert.deepEqual(longCaption.calls, ['album:2', 'text:long']);
    });

    it('falls back to one photo at a time when the album is refused', async () => {
        const telegram = createRecordingTelegram();

        telegram.failAlbum = true;
        telegram.failPhotoAt.add(1);

        const result = await sendImportPreview(telegram, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            images: [JPEG, PNG, WEBP]
        });

        assert.deepEqual(result, {
            fileIds: ['photo-0', 'photo-2'],
            rejected: 1,
            textDelivered: true
        });
        assert.deepEqual(telegram.calls, [
            'album:3',
            'photo:0',
            'photo:1',
            'photo:2',
            'text:short'
        ]);
    });

    it('propagates errors other than bad requests', async () => {
        const telegram = createRecordingTelegram();

        telegram.photoError = new TelegramApiError('sendPhoto', {
            error_code: 403,
            description: 'Forbidden: bot was blocked by the user'
        });

        await assert.rejects(
            sendImportPreview(telegram, {
                chatId: CHAT_ID,
                html: SHORT_HTML,
                images: [JPEG]
            }),
            TelegramApiError
        );
    });
});

describe('sendBotImportPreview', () => {
    const buttonUrlError = (method: string) => {
        return new TelegramApiError(method, {
            error_code: 400,
            description: 'Bad Request: BUTTON_URL_INVALID'
        });
    };

    it('retries a captioned photo without URL buttons when Telegram rejects the button URL', async () => {
        const telegram = createRecordingTelegram();
        const sendPhoto = telegram.sendPhoto;
        let refused = false;

        telegram.sendPhoto = async (chatId, photo, extra) => {
            if (!refused && extra?.reply_markup !== undefined) {
                refused = true;
                throw buttonUrlError('sendPhoto');
            }

            return sendPhoto(chatId, photo, extra);
        };

        const result = await sendBotImportPreview(telegram, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            replyMarkup: KEYBOARD,
            images: [JPEG]
        });

        assert.deepEqual(result, {
            fileIds: ['photo-0'],
            rejected: 0,
            textDelivered: true
        });
        assert.deepEqual(telegram.photoExtras[0]?.reply_markup, {
            inline_keyboard: []
        });
    });

    it('sends the text after an album without URL buttons when Telegram rejects the button URL', async () => {
        const telegram = createRecordingTelegram();
        const sendMessage = telegram.sendMessage;

        telegram.sendMessage = async (chatId, text, extra) => {
            if (extra?.reply_markup === KEYBOARD) {
                throw buttonUrlError('sendMessage');
            }

            return sendMessage(chatId, text, extra);
        };

        const result = await sendBotImportPreview(telegram, {
            chatId: CHAT_ID,
            html: SHORT_HTML,
            replyMarkup: KEYBOARD,
            images: [JPEG, PNG]
        });

        assert.deepEqual(result.fileIds, ['album-0', 'album-1']);
        assert.deepEqual(telegram.calls, ['album:2', 'text:short']);
        assert.deepEqual(telegram.textExtras[0], {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
        });
    });
});

describe('ingestStagedImage', () => {
    it('uploads silently, keeps the largest file id and deletes the message in the background', async () => {
        const telegram = createRecordingTelegram();
        const pending: Promise<unknown>[] = [];
        const result = await ingestStagedImage(telegram, {
            chatId: CHAT_ID,
            image: PNG,
            waitUntil: promise => {
                pending.push(promise);
            }
        });

        assert.deepEqual(result, { ok: true, fileId: 'photo-0' });
        assert.deepEqual(telegram.photoExtras[0], {
            disable_notification: true,
            filename: 'photo-0.png'
        });
        assert.equal(pending.length, 1);
        await Promise.all(pending);
        assert.deepEqual(telegram.deleted, [100]);
    });

    it('maps a 403 to writeAccessRequired and other failures to telegramError', async () => {
        const forbidden = createRecordingTelegram();

        forbidden.photoError = new TelegramApiError('sendPhoto', {
            error_code: 403,
            description: 'Forbidden'
        });
        assert.deepEqual(
            await ingestStagedImage(forbidden, {
                chatId: CHAT_ID,
                image: JPEG
            }),
            { ok: false, reason: 'writeAccessRequired' }
        );

        const refused = createRecordingTelegram();

        refused.failPhotoAt.add(0);
        assert.deepEqual(
            await ingestStagedImage(refused, { chatId: CHAT_ID, image: JPEG }),
            { ok: false, reason: 'telegramError' }
        );
        assert.deepEqual(forbidden.deleted, []);
    });
});

describe('telegram api multipart', () => {
    const createCapturingApi = (result: unknown) => {
        const requests: { url: string; body: FormData }[] = [];
        const api = createTelegramApi({
            botToken: BOT_TOKEN,
            fetch: async (input, init) => {
                requests.push({
                    url: String(input),
                    body: init?.body as FormData
                });

                return Response.json({ ok: true, result });
            }
        });

        return { api, requests };
    };

    it('sends a media group with attach references and the caption on the first item', async () => {
        const { api, requests } = createCapturingApi([photoMessage('a')]);

        await api.sendMediaGroup(
            CHAT_ID,
            [
                { photo: new Blob([JPEG_BYTES], { type: 'image/jpeg' }) },
                {
                    photo: new Blob([PNG_BYTES], { type: 'image/png' }),
                    filename: 'photo-1.png'
                }
            ],
            { caption: SHORT_HTML, parse_mode: 'HTML' }
        );

        const [request] = requests;

        assert.ok(request);
        assert.ok(request.url.endsWith('/sendMediaGroup'));
        assert.equal(request.body.get('chat_id'), String(CHAT_ID));
        assert.deepEqual(JSON.parse(String(request.body.get('media'))), [
            {
                type: 'photo',
                media: 'attach://p0',
                caption: SHORT_HTML,
                parse_mode: 'HTML'
            },
            { type: 'photo', media: 'attach://p1' }
        ]);

        const first = request.body.get('p0');
        const second = request.body.get('p1');

        assert.ok(first instanceof File);
        assert.ok(second instanceof File);
        assert.equal(first.name, 'photo.jpg');
        assert.equal(second.name, 'photo-1.png');
    });

    it('sends the photo caption parse mode and keyboard as multipart fields', async () => {
        const { api, requests } = createCapturingApi(photoMessage('a'));

        await api.sendPhoto(CHAT_ID, new Blob([JPEG_BYTES]), {
            caption: SHORT_HTML,
            parse_mode: 'HTML',
            reply_markup: KEYBOARD
        });

        const body = requests[0]?.body;

        assert.equal(body?.get('parse_mode'), 'HTML');
        assert.deepEqual(
            JSON.parse(String(body?.get('reply_markup'))),
            KEYBOARD
        );
        assert.equal(body?.get('disable_notification'), null);
    });
});
