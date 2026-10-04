import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { sha256Hex } from '../../src/api/auth/crypto';
import {
    TelegramApiError,
    type SentPhotoMessage,
    type TelegramApi
} from '../../src/api/telegram-api';
import { decodeSessionState } from '../../src/bot/runtime/session-store';
import {
    APP_UPLOAD_MAX_BYTES,
    type ApiErrorBody,
    type OwnWishDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const OWNER_TELEGRAM_ID = 4_001;
const OTHER_TELEGRAM_ID = 4_002;
const SENT_MESSAGE_ID = 9_001;
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]);
const WEBP_BYTES = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50
]);
const TELEGRAM_REENCODED_BYTES = new Uint8Array([
    0xff, 0xd8, 0xff, 0xdb, 4, 3, 2, 1
]);
const CLIENT_IP = '198.51.100.9';
const ACTIVE_WISH_LIMIT = 500;

const OWNER: InitDataUserFixture = {
    id: OWNER_TELEGRAM_ID,
    first_name: 'Owner',
    username: 'owner_user',
    language_code: 'en'
};
const OTHER: InitDataUserFixture = {
    id: OTHER_TELEGRAM_ID,
    first_name: 'Other',
    username: 'other_user',
    language_code: 'en'
};

interface FakeTelegram extends TelegramApi {
    sendPhotoCalls: {
        chatId: number | string;
        size: number;
        type: string;
        disableNotification: boolean | undefined;
    }[];
    deleteCalls: { chatId: number | string; messageId: number }[];
    sendMessageCalls: {
        chatId: number | string;
        text: string;
        replyMarkup: unknown;
    }[];
    getFileCalls: string[];
    downloadCalls: string[];
    nextFileIds: string[];
    failWith: TelegramApiError | null;
}

const createFakeTelegram = (): FakeTelegram => {
    const fake: FakeTelegram = {
        sendPhotoCalls: [],
        deleteCalls: [],
        sendMessageCalls: [],
        getFileCalls: [],
        downloadCalls: [],
        nextFileIds: [],
        failWith: null,
        async sendMessage(chatId, text, extra) {
            if (fake.failWith) {
                throw fake.failWith;
            }

            fake.sendMessageCalls.push({
                chatId,
                text,
                replyMarkup: extra?.reply_markup
            });

            return { message_id: 1 } as never;
        },
        async sendPhoto(chatId, photo, extra) {
            if (fake.failWith) {
                throw fake.failWith;
            }

            fake.sendPhotoCalls.push({
                chatId,
                size: photo.size,
                type: photo.type,
                disableNotification: extra?.disable_notification
            });

            const fileId =
                fake.nextFileIds.shift() ??
                `large-${fake.sendPhotoCalls.length}`;

            return {
                message_id: SENT_MESSAGE_ID,
                photo: [
                    { file_id: `${fileId}-small`, width: 90, height: 90 },
                    { file_id: fileId, width: 1280, height: 1280 },
                    { file_id: `${fileId}-medium`, width: 320, height: 320 }
                ]
            } as unknown as SentPhotoMessage;
        },
        async deleteMessage(chatId, messageId) {
            fake.deleteCalls.push({ chatId, messageId });

            return true;
        },
        async getFile(fileId) {
            fake.getFileCalls.push(fileId);

            return {
                file_id: fileId,
                file_unique_id: 'u',
                file_path: `photos/${fileId}.jpg`
            };
        },
        async downloadFile(filePath) {
            fake.downloadCalls.push(filePath);

            return new Response(TELEGRAM_REENCODED_BYTES, {
                headers: { 'Content-Type': 'image/jpeg' }
            });
        }
    };

    return fake;
};

const telegramError = (errorCode: number) => {
    return new TelegramApiError('sendPhoto', {
        error_code: errorCode,
        description: 'Forbidden: bot was blocked by the user'
    });
};

describe('Mini App photo endpoints', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];
    let telegram: FakeTelegram;
    let consoleOutput: string[];
    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };

    const restoreConsole = () => {
        Object.assign(console, originalConsole);
    };

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            MINI_APP_ENABLED: 'true',
            ADMIN_ID: '1',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            IMAGE_PROXY_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const request = (
        path: string,
        init: {
            method?: string;
            user?: InitDataUserFixture;
            body?: BodyInit;
            contentType?: string;
        } = {}
    ) => {
        const deps = {
            now: () => NOW,
            crypto: createNodeApiCrypto(),
            createTelegramApi: () => telegram,
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };
        const app = createApp({}, {}, {}, deps, deps);
        const headers = new Headers({
            'cf-connecting-ip': CLIENT_IP,
            Authorization: `tma ${createSignedInitData({
                user: init.user ?? OWNER,
                authDate: NOW_SECONDS
            })}`
        });

        if (init.contentType !== undefined) {
            headers.set('Content-Type', init.contentType);
        }

        return app.request(
            path,
            {
                method: init.method ?? 'GET',
                headers,
                ...(init.body === undefined ? {} : { body: init.body })
            },
            buildEnv()
        );
    };

    const upload = (
        wishId: number,
        body: BodyInit = JPEG_BYTES,
        contentType = 'image/jpeg',
        user: InitDataUserFixture = OWNER
    ) => {
        return request(`/api/app/wishes/${wishId}/images`, {
            method: 'POST',
            user,
            body,
            contentType
        });
    };

    const readError = async (response: Response) => {
        return ((await response.json()) as ApiErrorBody).error;
    };

    const createUser = async (telegramId: number, username: string) => {
        const created = await run(
            harness.repositories.users.create({
                telegramId,
                username,
                usernameSearchable: true,
                createdAt: NOW
            })
        );

        assert.ok(created);

        return created;
    };

    const seedWish = async (telegramId = OWNER_TELEGRAM_ID) => {
        const user = await createUser(telegramId, `user_${telegramId}`);
        const wish = await run(
            harness.repositories.wishes.create(user.id, 'Camera', 'UAH', NOW)
        );

        assert.ok(wish);

        return { user, wish };
    };

    const storedImages = async (wishId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT images FROM wishes WHERE id = ?'
        )
            .bind(wishId)
            .first<{ images: string }>();

        return JSON.parse(row?.images ?? '[]') as string[];
    };

    const seedImages = async (
        userId: number,
        wishId: number,
        fileIds: string[]
    ) => {
        for (const fileId of fileIds) {
            await run(
                harness.repositories.wishes.appendImage(
                    wishId,
                    userId,
                    fileId,
                    NOW
                )
            );
        }
    };

    const clearBucket = async () => {
        const listed = await harness.env.IMAGES.list();

        await Promise.all(
            listed.objects.map(object => {
                return harness.env.IMAGES.delete(object.key);
            })
        );
    };

    const eventResults = () => {
        return events
            .filter(event => event.event === 'app_photo_uploaded')
            .map(event => event.result);
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        events = [];
        telegram = createFakeTelegram();
        consoleOutput = [];
        await harness.clearApplicationTables();
        await clearBucket();

        for (const method of ['log', 'info', 'warn', 'error'] as const) {
            console[method] = (...args: unknown[]) => {
                consoleOutput.push(args.map(String).join(' '));
            };
        }
    });

    afterEach(restoreConsole);

    it('uploads through Telegram, keeps the largest file id and never seeds R2 from the uploaded bytes', async () => {
        const { wish } = await seedWish();
        telegram.nextFileIds = ['AgAD-large'];

        const response = await upload(wish.id);
        const body = (await response.json()) as OwnWishDto;

        restoreConsole();
        assert.equal(response.status, 200);
        assert.deepEqual(await storedImages(wish.id), ['AgAD-large']);
        assert.deepEqual(telegram.sendPhotoCalls, [
            {
                chatId: OWNER_TELEGRAM_ID,
                size: JPEG_BYTES.byteLength,
                type: 'image/jpeg',
                disableNotification: true
            }
        ]);
        assert.deepEqual(telegram.deleteCalls, [
            { chatId: OWNER_TELEGRAM_ID, messageId: SENT_MESSAGE_ID }
        ]);

        const key = await sha256Hex(createNodeApiCrypto(), 'AgAD-large');

        assert.equal(await harness.env.IMAGES.get(key), null);
        assert.equal(body.images.length, 1);
        assert.equal(body.images[0]?.hash, key.slice(0, 16));
        assert.match(
            body.images[0]?.url ?? '',
            new RegExp(`^/img/w/${wish.id}/0/${key.slice(0, 16)}\\?e=\\d+&s=`)
        );
        assert.deepEqual(eventResults(), ['appended']);
    });

    it('populates R2 from the Telegram re-encoded file on the first proxy miss', async () => {
        const { wish } = await seedWish();
        telegram.nextFileIds = ['AgAD-large'];

        const uploaded = (await (
            await upload(wish.id, PNG_BYTES, 'image/png')
        ).json()) as OwnWishDto;
        const image = await request(uploaded.images[0]?.url ?? '');
        const key = await sha256Hex(createNodeApiCrypto(), 'AgAD-large');
        const stored = await harness.env.IMAGES.get(key);

        restoreConsole();
        assert.equal(image.status, 200);
        assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
        assert.deepEqual(
            new Uint8Array(await image.arrayBuffer()),
            TELEGRAM_REENCODED_BYTES
        );
        assert.deepEqual(telegram.getFileCalls, ['AgAD-large']);
        assert.ok(stored);
        assert.deepEqual(
            new Uint8Array(await stored.arrayBuffer()),
            TELEGRAM_REENCODED_BYTES
        );
    });

    it('accepts PNG and WebP uploads whose magic bytes match the declared type', async () => {
        const { wish } = await seedWish();
        const png = await upload(wish.id, PNG_BYTES, 'image/png');
        const webp = await upload(wish.id, WEBP_BYTES, 'image/webp');

        restoreConsole();
        assert.equal(png.status, 200);
        assert.equal(webp.status, 200);
        assert.equal(telegram.sendPhotoCalls.length, 2);
    });

    it('rejects uploads whose magic bytes do not match the declared type before Telegram', async () => {
        const { wish } = await seedWish();
        const pngAsJpeg = await upload(wish.id, PNG_BYTES, 'image/jpeg');
        const jpegAsPng = await upload(wish.id, JPEG_BYTES, 'image/png');
        const jpegAsWebp = await upload(wish.id, JPEG_BYTES, 'image/webp');
        const riffWithoutWebp = await upload(
            wish.id,
            new Uint8Array([
                0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20
            ]),
            'image/webp'
        );
        const text = await upload(wish.id, 'GIF89a-not-a-jpeg', 'image/jpeg');

        restoreConsole();

        for (const response of [
            pngAsJpeg,
            jpegAsPng,
            jpegAsWebp,
            riffWithoutWebp,
            text
        ]) {
            assert.equal(response.status, 415);
            assert.deepEqual(await readError(response), {
                code: 'unsupportedMedia'
            });
        }

        assert.deepEqual(telegram.sendPhotoCalls, []);
        assert.deepEqual(await storedImages(wish.id), []);
    });

    it('rejects the tenth photo without calling Telegram', async () => {
        const { user, wish } = await seedWish();

        await seedImages(
            user.id,
            wish.id,
            Array.from({ length: 9 }, (_, index) => `existing-${index}`)
        );

        const response = await upload(wish.id);

        restoreConsole();
        assert.equal(response.status, 409);
        assert.deepEqual(await readError(response), { code: 'imagesFull' });
        assert.deepEqual(telegram.sendPhotoCalls, []);
        assert.equal((await storedImages(wish.id)).length, 9);
        assert.deepEqual(eventResults(), ['full']);
    });

    it('treats a re-sent file id as a duplicate and keeps one copy', async () => {
        const { user, wish } = await seedWish();

        await seedImages(user.id, wish.id, ['same-file']);
        telegram.nextFileIds = ['same-file'];

        const response = await upload(wish.id);
        const body = (await response.json()) as OwnWishDto;

        restoreConsole();
        assert.equal(response.status, 200);
        assert.equal(body.images.length, 1);
        assert.deepEqual(await storedImages(wish.id), ['same-file']);
        assert.deepEqual(eventResults(), ['duplicate']);
        assert.equal(telegram.deleteCalls.length, 1);
    });

    it('rejects oversized and unsupported uploads before Telegram', async () => {
        const { wish } = await seedWish();
        const oversized = await upload(
            wish.id,
            new Uint8Array(APP_UPLOAD_MAX_BYTES + 1)
        );
        const gif = await upload(wish.id, JPEG_BYTES, 'image/gif');
        const text = await upload(wish.id, 'hello', 'text/plain');
        const empty = await upload(wish.id, new Uint8Array(0));

        restoreConsole();
        assert.equal(oversized.status, 413);
        assert.deepEqual(await readError(oversized), {
            code: 'payloadTooLarge'
        });
        assert.equal(gif.status, 415);
        assert.deepEqual(await readError(gif), { code: 'unsupportedMedia' });
        assert.equal(text.status, 415);
        assert.equal(empty.status, 422);
        assert.deepEqual(telegram.sendPhotoCalls, []);
        assert.deepEqual(eventResults(), [
            'tooLarge',
            'unsupported',
            'unsupported'
        ]);
    });

    it('maps a Telegram 403 to writeAccessRequired without blocking the user', async () => {
        const { user, wish } = await seedWish();
        telegram.failWith = telegramError(403);

        const response = await upload(wish.id);

        restoreConsole();
        assert.equal(response.status, 409);
        assert.deepEqual(await readError(response), {
            code: 'writeAccessRequired'
        });

        const stored = await run(
            harness.repositories.users.findByTelegramId(OWNER_TELEGRAM_ID)
        );

        assert.equal(stored?.id, user.id);
        assert.equal(stored?.blockedAt, null);
        assert.deepEqual(await storedImages(wish.id), []);
        assert.deepEqual(eventResults(), ['writeAccessRequired']);
        assert.equal((await harness.env.IMAGES.list()).objects.length, 0);
    });

    it('maps other Telegram failures to 502 upstream', async () => {
        const { wish } = await seedWish();
        telegram.failWith = telegramError(500);

        const response = await upload(wish.id);

        restoreConsole();
        assert.equal(response.status, 502);
        assert.deepEqual(await readError(response), { code: 'upstream' });
        assert.deepEqual(eventResults(), ['telegramError']);
    });

    it('hides other users wishes behind 404 for every photo endpoint', async () => {
        const { wish } = await seedWish();

        await createUser(OTHER_TELEGRAM_ID, 'other_user');

        const responses = await Promise.all([
            upload(wish.id, JPEG_BYTES, 'image/jpeg', OTHER),
            request(
                `/api/app/wishes/${wish.id}/images/0?hash=${'a'.repeat(16)}`,
                {
                    method: 'DELETE',
                    user: OTHER
                }
            ),
            request(`/api/app/wishes/${wish.id}/images`, {
                method: 'DELETE',
                user: OTHER
            }),
            request(`/api/app/wishes/${wish.id}/images/chat-intent`, {
                method: 'POST',
                user: OTHER
            })
        ]);

        restoreConsole();
        assert.deepEqual(
            responses.map(response => response.status),
            [404, 404, 404, 404]
        );
        assert.deepEqual(telegram.sendPhotoCalls, []);
        assert.deepEqual(telegram.sendMessageCalls, []);
    });

    it('removes a photo by index only when the hash still matches', async () => {
        const { user, wish } = await seedWish();

        await seedImages(user.id, wish.id, ['first', 'second', 'third']);

        const crypto = createNodeApiCrypto();
        const hashOf = async (fileId: string) => {
            return (await sha256Hex(crypto, fileId)).slice(0, 16);
        };
        const stale = await request(
            `/api/app/wishes/${wish.id}/images/1?hash=${await hashOf('third')}`,
            { method: 'DELETE' }
        );
        const outOfRange = await request(
            `/api/app/wishes/${wish.id}/images/7?hash=${await hashOf('third')}`,
            { method: 'DELETE' }
        );
        const missingHash = await request(
            `/api/app/wishes/${wish.id}/images/1`,
            { method: 'DELETE' }
        );
        const badHash = await request(
            `/api/app/wishes/${wish.id}/images/1?hash=zz`,
            { method: 'DELETE' }
        );

        restoreConsole();
        assert.equal(stale.status, 409);
        assert.deepEqual(await readError(stale), { code: 'imageChanged' });
        assert.equal(outOfRange.status, 409);
        assert.equal(missingHash.status, 422);
        assert.equal(badHash.status, 422);
        assert.deepEqual(await storedImages(wish.id), [
            'first',
            'second',
            'third'
        ]);

        const removed = await request(
            `/api/app/wishes/${wish.id}/images/1?hash=${await hashOf('second')}`,
            { method: 'DELETE' }
        );
        const body = (await removed.json()) as OwnWishDto;

        assert.equal(removed.status, 200);
        assert.deepEqual(await storedImages(wish.id), ['first', 'third']);
        assert.deepEqual(
            body.images.map(image => image.hash),
            [await hashOf('first'), await hashOf('third')]
        );
    });

    it('clears every photo of a wish', async () => {
        const { user, wish } = await seedWish();

        await seedImages(user.id, wish.id, ['a', 'b']);

        const response = await request(`/api/app/wishes/${wish.id}/images`, {
            method: 'DELETE'
        });
        const body = (await response.json()) as OwnWishDto;

        restoreConsole();
        assert.equal(response.status, 200);
        assert.deepEqual(body.images, []);
        assert.deepEqual(await storedImages(wish.id), []);
    });

    it('starts the chat intent: pending wishField images and the add or update prompt', async () => {
        const { user, wish } = await seedWish();
        const addResponse = await request(
            `/api/app/wishes/${wish.id}/images/chat-intent`,
            { method: 'POST' }
        );

        assert.equal(addResponse.status, 204);

        const pending = async () => {
            const session = await run(
                harness.repositories.sessions.get(OWNER_TELEGRAM_ID)
            );

            return decodeSessionState(session?.state).pendingInput;
        };

        assert.deepEqual(await pending(), {
            kind: 'wishField',
            wishId: wish.id,
            field: 'images'
        });
        assert.equal(telegram.sendMessageCalls.length, 1);
        assert.equal(telegram.sendMessageCalls[0]?.chatId, OWNER_TELEGRAM_ID);
        assert.match(
            telegram.sendMessageCalls[0]?.text ?? '',
            /Add new images \(no more than 9\)$/
        );
        assert.deepEqual(telegram.sendMessageCalls[0]?.replyMarkup, {
            remove_keyboard: true
        });

        await seedImages(user.id, wish.id, ['present']);

        const updateResponse = await request(
            `/api/app/wishes/${wish.id}/images/chat-intent`,
            { method: 'POST' }
        );

        restoreConsole();
        assert.equal(updateResponse.status, 204);
        assert.match(
            telegram.sendMessageCalls[1]?.text ?? '',
            /remove all the added ones/
        );
        const updateMarkup = telegram.sendMessageCalls[1]?.replyMarkup as
            | { keyboard: unknown[] }
            | undefined;

        assert.equal(updateMarkup?.keyboard.length, 1);
    });

    it('does not save a pending input when the chat prompt cannot be delivered', async () => {
        const { wish } = await seedWish();
        telegram.failWith = telegramError(403);

        const response = await request(
            `/api/app/wishes/${wish.id}/images/chat-intent`,
            { method: 'POST' }
        );

        restoreConsole();
        assert.equal(response.status, 409);
        assert.deepEqual(await readError(response), {
            code: 'writeAccessRequired'
        });
        assert.equal(
            await run(harness.repositories.sessions.get(OWNER_TELEGRAM_ID)),
            null
        );
    });

    it('never prints the bot token or a Telegram file URL', async () => {
        const { wish } = await seedWish();

        telegram.failWith = telegramError(500);
        await upload(wish.id);
        restoreConsole();

        const printed = consoleOutput.join('\n');

        assert.doesNotMatch(printed, /api\.telegram\.org\/file\/bot/);
        assert.equal(printed.includes(TEST_BOT_TOKEN), false);
    });

    describe('R2 cleanup and the wish limit', () => {
        const keyOf = (fileId: string) => {
            return sha256Hex(createNodeApiCrypto(), fileId);
        };

        const putObject = async (fileId: string) => {
            await harness.env.IMAGES.put(await keyOf(fileId), 'bytes');
        };

        const hasObject = async (fileId: string) => {
            return (await harness.env.IMAGES.get(await keyOf(fileId))) !== null;
        };

        const createSecondWish = async (userId: number) => {
            const second = await run(
                harness.repositories.wishes.create(userId, 'Lens', 'UAH', NOW)
            );

            assert.ok(second);

            return second;
        };

        const postJson = (path: string, body?: unknown) => {
            return request(path, {
                method: 'POST',
                ...(body === undefined
                    ? {}
                    : {
                          body: JSON.stringify(body),
                          contentType: 'application/json'
                      })
            });
        };

        it('deletes the R2 object of a removed photo only when no other active wish references it', async () => {
            const { user, wish } = await seedWish();
            const other = await createSecondWish(user.id);

            await seedImages(user.id, wish.id, ['solo', 'shared']);
            await seedImages(user.id, other.id, ['shared']);
            await putObject('solo');
            await putObject('shared');

            const crypto = createNodeApiCrypto();
            const hashOf = async (fileId: string) => {
                return (await sha256Hex(crypto, fileId)).slice(0, 16);
            };

            const removeShared = await request(
                `/api/app/wishes/${wish.id}/images/1?hash=${await hashOf('shared')}`,
                { method: 'DELETE' }
            );

            assert.equal(removeShared.status, 200);
            assert.equal(await hasObject('shared'), true);

            const removeSolo = await request(
                `/api/app/wishes/${wish.id}/images/0?hash=${await hashOf('solo')}`,
                { method: 'DELETE' }
            );

            restoreConsole();
            assert.equal(removeSolo.status, 200);
            assert.equal(await hasObject('solo'), false);
            assert.equal(await hasObject('shared'), true);
        });

        it('deletes the R2 objects when all photos of a wish are cleared', async () => {
            const { user, wish } = await seedWish();

            await seedImages(user.id, wish.id, ['a', 'b']);
            await putObject('a');
            await putObject('b');

            const response = await request(
                `/api/app/wishes/${wish.id}/images`,
                { method: 'DELETE' }
            );

            restoreConsole();
            assert.equal(response.status, 200);
            assert.equal(await hasObject('a'), false);
            assert.equal(await hasObject('b'), false);
        });

        it('deletes the R2 objects of a removed wish but keeps ones another wish still uses', async () => {
            const { user, wish } = await seedWish();
            const other = await createSecondWish(user.id);

            await seedImages(user.id, wish.id, ['gone', 'kept']);
            await seedImages(user.id, other.id, ['kept']);
            await putObject('gone');
            await putObject('kept');

            const response = await postJson(
                `/api/app/wishes/${wish.id}/remove`,
                { done: false }
            );

            restoreConsole();
            assert.equal(response.status, 204);
            assert.equal(await hasObject('gone'), false);
            assert.equal(await hasObject('kept'), true);
        });

        it('deletes the R2 objects of every wish when the list is cleaned, and keeps other users objects', async () => {
            const { user, wish } = await seedWish();
            const other = await createSecondWish(user.id);
            const stranger = await seedWish(OTHER_TELEGRAM_ID);

            await seedImages(user.id, wish.id, ['one']);
            await seedImages(user.id, other.id, ['two']);
            await seedImages(stranger.user.id, stranger.wish.id, ['three']);
            await putObject('one');
            await putObject('two');
            await putObject('three');

            const response = await postJson('/api/app/wishes/clean');

            restoreConsole();
            assert.equal(response.status, 200);
            assert.equal(await hasObject('one'), false);
            assert.equal(await hasObject('two'), false);
            assert.equal(await hasObject('three'), true);
        });

        it('refuses to create the 501st active wish with 409 wishLimit and counts removed wishes out', async () => {
            const { user } = await seedWish();

            await harness.env.DB.prepare(
                `WITH RECURSIVE filler(n) AS (
                    SELECT 1 UNION ALL SELECT n + 1 FROM filler WHERE n < ?
                 )
                 INSERT INTO wishes (user_id, title, created_at, updated_at)
                 SELECT ?, 'Filler ' || n, ?, ? FROM filler`
            )
                .bind(
                    ACTIVE_WISH_LIMIT - 2,
                    user.id,
                    NOW.getTime(),
                    NOW.getTime()
                )
                .run();

            const accepted = await postJson('/api/app/wishes', {
                title: 'Last one'
            });
            const refused = await postJson('/api/app/wishes', {
                title: 'One too many'
            });

            assert.equal(accepted.status, 201);
            assert.equal(refused.status, 409);
            assert.deepEqual(await readError(refused), { code: 'wishLimit' });

            const created = (await accepted.json()) as OwnWishDto;
            const removal = await postJson(
                `/api/app/wishes/${created.id}/remove`,
                { done: false }
            );
            const retried = await postJson('/api/app/wishes', {
                title: 'Fits again'
            });

            restoreConsole();
            assert.equal(removal.status, 204);
            assert.equal(retried.status, 201);
        });
    });
});
