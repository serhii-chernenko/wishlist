import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseSendTestArguments } from '../scripts/releases/send-test';
import {
    createReleaseAnnouncementSender,
    RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS,
    renderReleaseAnnouncementText,
    renderShortReleaseAnnouncementText,
    sendReleaseAnnouncementCopy,
    type ReleaseAnnouncementTelegram
} from '../src/worker/queues/release-announcement-delivery';
import {
    processReleaseAnnouncementBatch,
    type ReleaseAnnouncementConsumerDependencies
} from '../src/worker/queues/release-announcements';

const releaseVersion = '2.0.0';
const adminChatId = '777';
const fileIds = ['file-a', 'file-b', 'file-c'];
const noShortText = () => null;
const shortCaption = '<b>Short</b>';

interface TelegramCall {
    method: 'sendPhoto' | 'sendMediaGroup' | 'sendMessage';
    chatId: number | string;
    payload: unknown;
    extra?: unknown;
}

const createFakeTelegram = () => {
    const calls: TelegramCall[] = [];
    const telegram: ReleaseAnnouncementTelegram = {
        async sendPhoto(chatId, photo, extra) {
            calls.push({
                method: 'sendPhoto',
                chatId,
                payload: photo,
                ...(extra === undefined ? {} : { extra })
            });
        },
        async sendMediaGroup(chatId, media) {
            calls.push({ method: 'sendMediaGroup', chatId, payload: media });
        },
        async sendMessage(chatId, text, extra) {
            calls.push({
                method: 'sendMessage',
                chatId,
                payload: text,
                extra
            });
        }
    };

    return { calls, telegram };
};

const withoutChat = (calls: readonly TelegramCall[]) => {
    return calls.map(({ chatId: _chatId, ...rest }) => rest);
};

test('the test copy sends the album first and then the announcement text', async () => {
    const { calls, telegram } = createFakeTelegram();

    const result = await sendReleaseAnnouncementCopy({
        sender: createReleaseAnnouncementSender(telegram),
        chatId: adminChatId,
        releaseVersion,
        locale: 'en',
        getMedia: () => fileIds,
        getShortText: noShortText
    });

    assert.deepEqual(result, { mediaPhotos: 3, shortAnnouncement: false });
    assert.deepEqual(
        calls.map(call => call.method),
        ['sendMediaGroup', 'sendMessage']
    );
    assert.ok(calls.every(call => call.chatId === adminChatId));
    assert.deepEqual(calls[0]?.payload, [
        { type: 'photo', media: 'file-a' },
        { type: 'photo', media: 'file-b' },
        { type: 'photo', media: 'file-c' }
    ]);
    assert.equal(
        calls[1]?.payload,
        renderReleaseAnnouncementText(releaseVersion, 'en')
    );
    assert.deepEqual(calls[1]?.extra, RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS);
    assert.equal(RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS.parse_mode, 'HTML');
});

test('the test copy sends one file id as a single photo and then the text', async () => {
    const { calls, telegram } = createFakeTelegram();

    const result = await sendReleaseAnnouncementCopy({
        sender: createReleaseAnnouncementSender(telegram),
        chatId: adminChatId,
        releaseVersion,
        locale: 'uk',
        getMedia: () => ['cover'],
        getShortText: noShortText
    });

    assert.deepEqual(result, { mediaPhotos: 1, shortAnnouncement: false });
    assert.deepEqual(
        calls.map(call => call.method),
        ['sendPhoto', 'sendMessage']
    );
    assert.equal(calls[0]?.chatId, adminChatId);
    assert.equal(calls[0]?.payload, 'cover');
});

test('the test copy sends only the text when the release has no album', async () => {
    const { calls, telegram } = createFakeTelegram();

    const result = await sendReleaseAnnouncementCopy({
        sender: createReleaseAnnouncementSender(telegram),
        chatId: adminChatId,
        releaseVersion,
        locale: 'uk',
        getMedia: () => [],
        getShortText: noShortText
    });

    assert.deepEqual(result, { mediaPhotos: 0, shortAnnouncement: false });
    assert.deepEqual(
        calls.map(call => call.method),
        ['sendMessage']
    );
});

test('the test copy fails before sending anything for an unknown release', async () => {
    const { calls, telegram } = createFakeTelegram();

    await assert.rejects(
        sendReleaseAnnouncementCopy({
            sender: createReleaseAnnouncementSender(telegram),
            chatId: adminChatId,
            releaseVersion: '0.0.1',
            locale: 'uk',
            getMedia: () => fileIds,
            getShortText: noShortText
        }),
        /No release notes found for 0.0.1/
    );
    assert.deepEqual(calls, []);
});

const parityCases = [
    {
        name: 'photo',
        ids: ['cover'],
        short: null,
        methods: ['sendPhoto', 'sendMessage']
    },
    {
        name: 'album',
        ids: fileIds,
        short: null,
        methods: ['sendMediaGroup', 'sendMessage']
    },
    {
        name: 'captioned photo',
        ids: ['cover'],
        short: shortCaption,
        methods: ['sendPhoto']
    },
    {
        name: 'short text with an album',
        ids: fileIds,
        short: shortCaption,
        methods: ['sendMediaGroup', 'sendMessage']
    },
    {
        name: 'short text without media',
        ids: [],
        short: shortCaption,
        methods: ['sendMessage']
    }
];

for (const { name, ids, short, methods } of parityCases) {
    for (const locale of ['uk', 'en', 'pl'] as const) {
        test(`the test copy matches what the queue consumer sends as a ${name} in ${locale}`, async () => {
            const broadcast = createFakeTelegram();
            const testCopy = createFakeTelegram();
            const sender = createReleaseAnnouncementSender(broadcast.telegram);
            const dependencies: ReleaseAnnouncementConsumerDependencies = {
                isBroadcastEnabled: () => true,
                getCurrentReleaseVersion: () => releaseVersion,
                async findAnnouncement() {
                    return { id: 1, status: 'queued', mediaSentAt: null };
                },
                async findUser() {
                    return {
                        id: 1,
                        telegramId: Number(adminChatId),
                        language: locale,
                        telegramLanguageCode: null,
                        releaseVersion: '1.0.0',
                        blockedAt: null
                    };
                },
                renderAnnouncement: renderReleaseAnnouncementText,
                renderShortAnnouncement: () => short,
                getReleaseMedia: () => ids,
                claimForSending: async () => true,
                sendReleaseMedia: sender.sendReleaseMedia,
                sendReleasePhotoWithCaption: sender.sendReleasePhotoWithCaption,
                sendMessage: sender.sendMessage,
                markMediaSent: async () => undefined,
                markBlocked: async () => undefined,
                markSent: async () => undefined,
                markSkipped: async () => undefined,
                releaseToQueue: async () => undefined,
                markFailed: async () => undefined,
                requeueJob: async () => undefined,
                sleep: async () => undefined,
                now: () => 0,
                log: () => undefined
            };

            await processReleaseAnnouncementBatch(
                [
                    {
                        body: { releaseVersion, userId: 1 },
                        attempts: 1,
                        ack: () => undefined,
                        retry: () => undefined
                    }
                ],
                dependencies
            );
            await sendReleaseAnnouncementCopy({
                sender: createReleaseAnnouncementSender(testCopy.telegram),
                chatId: adminChatId,
                releaseVersion,
                locale,
                getMedia: () => ids,
                getShortText: () => short
            });

            assert.deepEqual(
                broadcast.calls.map(call => call.method),
                methods
            );
            assert.deepEqual(
                withoutChat(testCopy.calls),
                withoutChat(broadcast.calls)
            );
        });
    }
}

test('the test copy sends one photo with the short text as an HTML caption', async () => {
    const { calls, telegram } = createFakeTelegram();

    const result = await sendReleaseAnnouncementCopy({
        sender: createReleaseAnnouncementSender(telegram),
        chatId: adminChatId,
        releaseVersion,
        locale: 'en',
        getMedia: () => ['cover'],
        getShortText: () => shortCaption
    });

    assert.deepEqual(result, { mediaPhotos: 1, shortAnnouncement: true });
    assert.deepEqual(calls, [
        {
            method: 'sendPhoto',
            chatId: adminChatId,
            payload: 'cover',
            extra: { parse_mode: 'HTML', caption: shortCaption }
        }
    ]);
});

test('the test copy sends the short text as a normal message when there is no media', async () => {
    const { calls, telegram } = createFakeTelegram();

    await sendReleaseAnnouncementCopy({
        sender: createReleaseAnnouncementSender(telegram),
        chatId: adminChatId,
        releaseVersion,
        locale: 'pl',
        getMedia: () => [],
        getShortText: () => shortCaption
    });

    assert.deepEqual(calls, [
        {
            method: 'sendMessage',
            chatId: adminChatId,
            payload: shortCaption,
            extra: RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS
        }
    ]);
});

test('the test copy asks for the short text of the requested locale', async () => {
    const { telegram } = createFakeTelegram();
    const requestedLocales: string[] = [];

    await sendReleaseAnnouncementCopy({
        sender: createReleaseAnnouncementSender(telegram),
        chatId: adminChatId,
        releaseVersion,
        locale: 'pl',
        getMedia: () => ['cover'],
        getShortText: (_version, locale) => {
            requestedLocales.push(locale);
            return shortCaption;
        }
    });

    assert.deepEqual(requestedLocales, ['pl']);
});

test('the committed 2.0.0 announcement goes out as one captioned photo in every locale', async () => {
    for (const locale of ['uk', 'en', 'pl'] as const) {
        const { calls, telegram } = createFakeTelegram();

        await sendReleaseAnnouncementCopy({
            sender: createReleaseAnnouncementSender(telegram),
            chatId: adminChatId,
            releaseVersion,
            locale,
            getMedia: () => ['cover']
        });

        assert.equal(calls.length, 1, locale);
        assert.equal(calls[0]?.method, 'sendPhoto', locale);
        assert.deepEqual(
            calls[0]?.extra,
            {
                parse_mode: 'HTML',
                caption: renderShortReleaseAnnouncementText(
                    releaseVersion,
                    locale
                )
            },
            locale
        );
    }
});

test('the queue handler builds its sender and text from the shared delivery module', () => {
    const source = fs.readFileSync(
        'src/worker/queues/release-announcements-handler.ts',
        'utf8'
    );

    assert.match(source, /createReleaseAnnouncementSender\(/);
    assert.match(source, /renderAnnouncement: renderReleaseAnnouncementText/);
    assert.doesNotMatch(source, /parse_mode/);
});

test('send-test arguments default to production, the latest version and uk', () => {
    assert.deepEqual(parseSendTestArguments([], '2.1.0'), {
        version: '2.1.0',
        locale: 'uk',
        target: 'production'
    });
});

test('send-test arguments accept spaced and equals forms', () => {
    assert.deepEqual(
        parseSendTestArguments(
            ['--version', '2.0.0', '--locale', 'pl', '--target=preview'],
            '2.1.0'
        ),
        { version: '2.0.0', locale: 'pl', target: 'preview' }
    );
    assert.deepEqual(
        parseSendTestArguments(
            ['--version=1.7.1', '--locale=en', '--target=local'],
            '2.1.0'
        ),
        { version: '1.7.1', locale: 'en', target: 'local' }
    );
});

test('send-test arguments reject bad input', () => {
    assert.throws(
        () => parseSendTestArguments(['--version', 'latest']),
        /version/
    );
    assert.throws(() => parseSendTestArguments(['--version']), /version/);
    assert.throws(() => parseSendTestArguments(['--locale', 'de']), /locale/);
    assert.throws(() => parseSendTestArguments(['--target=staging']), /target/);
    assert.throws(() => parseSendTestArguments(['2.0.0']), /Unknown argument/);
});
