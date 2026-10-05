import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseSendTestArguments } from '../scripts/releases/send-test';
import {
    createReleaseAnnouncementSender,
    RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS,
    renderReleaseAnnouncementText,
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

interface TelegramCall {
    method: 'sendMediaGroup' | 'sendMessage';
    chatId: number | string;
    payload: unknown;
    extra?: unknown;
}

const createFakeTelegram = () => {
    const calls: TelegramCall[] = [];
    const telegram: ReleaseAnnouncementTelegram = {
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
        getMedia: () => fileIds
    });

    assert.deepEqual(result, { albumPhotos: 3 });
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

test('the test copy sends only the text when the release has no album', async () => {
    const { calls, telegram } = createFakeTelegram();

    const result = await sendReleaseAnnouncementCopy({
        sender: createReleaseAnnouncementSender(telegram),
        chatId: adminChatId,
        releaseVersion,
        locale: 'uk',
        getMedia: () => []
    });

    assert.deepEqual(result, { albumPhotos: 0 });
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
            getMedia: () => fileIds
        }),
        /No release notes found for 0.0.1/
    );
    assert.deepEqual(calls, []);
});

for (const locale of ['uk', 'en', 'pl'] as const) {
    test(`the test copy matches what the queue consumer sends in ${locale}`, async () => {
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
            getReleaseMedia: () => fileIds,
            claimForSending: async () => true,
            sendMediaGroup: sender.sendMediaGroup,
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
            getMedia: () => fileIds
        });

        assert.equal(broadcast.calls.length, 2);
        assert.deepEqual(
            withoutChat(testCopy.calls),
            withoutChat(broadcast.calls)
        );
    });
}

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
