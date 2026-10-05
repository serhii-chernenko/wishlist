import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
    createTelegramApi,
    type MediaGroupPhoto,
    type SentPhotoMessage
} from '../src/api/telegram-api';
import {
    findReleaseMediaProblems,
    getReleaseMedia,
    readReleaseMediaFileIds
} from '../src/bot/content/release-media';
import {
    loadPhotos,
    mergeReleaseMedia,
    parseUploadArguments,
    PHOTO_MAX_BYTES,
    pickLargestFileId,
    RELEASE_MEDIA_CONFIG_FILE,
    resolveUploadCredentials,
    uploadReleaseMedia
} from '../scripts/releases/upload-media';

const botToken = '123456:secret-token';
const adminChatId = '777';

const photoMessage = (
    messageId: number,
    sizes: { id: string; width: number; height: number; size?: number }[]
) => {
    return {
        message_id: messageId,
        photo: sizes.map(size => {
            return {
                file_id: size.id,
                file_unique_id: `${size.id}-unique`,
                width: size.width,
                height: size.height,
                ...(size.size === undefined ? {} : { file_size: size.size })
            };
        })
    } as unknown as SentPhotoMessage;
};

const albumMessages = [
    photoMessage(41, [
        { id: 'a-small', width: 90, height: 112 },
        { id: 'a-large', width: 1080, height: 1350 },
        { id: 'a-medium', width: 320, height: 400 }
    ]),
    photoMessage(42, [
        { id: 'b-large', width: 1080, height: 1350 },
        { id: 'b-small', width: 90, height: 112 }
    ]),
    photoMessage(43, [{ id: 'c-large', width: 1080, height: 1350 }])
];

const photos: MediaGroupPhoto[] = ['1.jpg', '2.jpg', '3.jpg'].map(name => {
    return { photo: new Blob(['x'], { type: 'image/jpeg' }), filename: name };
});

const createFakeApi = (
    options: { deleteFails?: boolean; messages?: SentPhotoMessage[] } = {}
) => {
    const calls = {
        albums: [] as {
            chatId: number | string;
            count: number;
            silent: boolean | undefined;
        }[],
        photos: [] as {
            chatId: number | string;
            filename: string | undefined;
            silent: boolean | undefined;
        }[],
        deleted: [] as { chatId: number | string; messageId: number }[]
    };

    return {
        calls,
        api: {
            async sendPhoto(
                chatId: number | string,
                _photo: Blob,
                extra?: { disable_notification?: boolean; filename?: string }
            ) {
                calls.photos.push({
                    chatId,
                    filename: extra?.filename,
                    silent: extra?.disable_notification
                });
                return options.messages?.[0] ?? albumMessages[0]!;
            },
            async sendMediaGroup(
                chatId: number | string,
                items: readonly MediaGroupPhoto[],
                extra?: { disable_notification?: boolean }
            ) {
                calls.albums.push({
                    chatId,
                    count: items.length,
                    silent: extra?.disable_notification
                });
                return options.messages ?? albumMessages;
            },
            async deleteMessage(chatId: number | string, messageId: number) {
                if (options.deleteFails) {
                    throw new Error('delete failed');
                }

                calls.deleted.push({ chatId, messageId });
                return true;
            }
        }
    };
};

test('the committed release media config is valid', () => {
    const config: unknown = JSON.parse(
        fs.readFileSync(RELEASE_MEDIA_CONFIG_FILE, 'utf8')
    );

    assert.deepEqual(findReleaseMediaProblems(config), []);
});

test('the release media config is tracked by the gitignore allowlist', () => {
    const gitignore = fs.readFileSync('.gitignore', 'utf8').split('\n');

    assert.ok(gitignore.includes(`!${RELEASE_MEDIA_CONFIG_FILE}`));
});

test('release media reads one to ten file ids and ignores anything else', () => {
    const config = {
        '2.0.0': ['a', 'b', 'c'],
        '2.1.0': ['only-one'],
        '2.5.0': [],
        '2.2.0': Array.from({ length: 11 }, (_, index) => `id-${index}`),
        '2.3.0': ['a', ''],
        '2.4.0': 'a,b'
    };

    assert.deepEqual(readReleaseMediaFileIds(config, '2.0.0'), ['a', 'b', 'c']);
    assert.deepEqual(readReleaseMediaFileIds(config, '2.1.0'), ['only-one']);

    for (const version of ['2.5.0', '2.2.0', '2.3.0', '2.4.0', '9.9.9']) {
        assert.deepEqual(readReleaseMediaFileIds(config, version), []);
    }

    assert.deepEqual(readReleaseMediaFileIds(null, '2.0.0'), []);
    assert.deepEqual(readReleaseMediaFileIds(config, 'toString'), []);
    assert.equal(findReleaseMediaProblems(config).length, 4);
    assert.deepEqual(findReleaseMediaProblems({ latest: ['a', 'b'] }), [
        'latest: the key must be a release version'
    ]);
    assert.ok(Array.isArray(getReleaseMedia('0.0.1')));
});

test('upload arguments take a version, one to ten photos and an optional target', () => {
    assert.deepEqual(parseUploadArguments(['2.0.0', 'a.jpg', 'b.PNG']), {
        version: '2.0.0',
        files: ['a.jpg', 'b.PNG'],
        target: 'production'
    });
    assert.deepEqual(
        parseUploadArguments(['--target=preview', '2.0.0', 'a.jpeg', 'b.webp'])
            .target,
        'preview'
    );

    assert.deepEqual(parseUploadArguments(['2.0.0', 'cover.jpg']).files, [
        'cover.jpg'
    ]);

    const rejected: string[][] = [
        [],
        ['2.0', 'a.jpg', 'b.jpg'],
        ['v2.0.0', 'a.jpg', 'b.jpg'],
        ['2.0.0'],
        ['2.0.0', ...Array.from({ length: 11 }, (_, index) => `${index}.jpg`)],
        ['2.0.0', ...Array.from({ length: 11 }, (_, index) => `${index}.jpg`)],
        ['2.0.0', 'a.jpg', 'b.gif'],
        ['2.0.0', 'a.jpg', 'b.jpg', '--target=staging'],
        ['2.0.0', 'a.jpg', 'b.jpg', '--force']
    ];

    for (const argv of rejected) {
        assert.throws(
            () => parseUploadArguments(argv),
            /Usage|Unsupported/,
            JSON.stringify(argv)
        );
    }
});

test('photos are read as typed blobs and oversized files are rejected', async () => {
    const loaded = await loadPhotos(
        ['/tmp/one.png', '/tmp/two.jpg'],
        async () => {
            return new Uint8Array([1, 2, 3]);
        }
    );

    assert.deepEqual(
        loaded.map(item => {
            return [item.filename, item.photo.type, item.photo.size];
        }),
        [
            ['one.png', 'image/png', 3],
            ['two.jpg', 'image/jpeg', 3]
        ]
    );

    await assert.rejects(
        loadPhotos(['big.jpg', 'small.jpg'], async () => {
            return new Uint8Array(PHOTO_MAX_BYTES + 1);
        }),
        /larger than 10 MB/
    );
});

test('the largest photo size is chosen whatever the order Telegram returns', () => {
    assert.equal(pickLargestFileId(albumMessages[0]!), 'a-large');
    assert.equal(
        pickLargestFileId(
            photoMessage(1, [
                { id: 'same-small', width: 10, height: 10, size: 5 },
                { id: 'same-big', width: 10, height: 10, size: 9 }
            ])
        ),
        'same-big'
    );
    assert.throws(() => pickLargestFileId(photoMessage(1, [])), /photo sizes/);
});

test('uploading sends one silent album to the admin chat, reads the file ids and deletes the messages', async () => {
    const { api, calls } = createFakeApi();
    const fileIds = await uploadReleaseMedia({
        api,
        chatId: adminChatId,
        photos,
        log: () => undefined
    });

    assert.deepEqual(fileIds, ['a-large', 'b-large', 'c-large']);
    assert.deepEqual(calls.albums, [
        { chatId: adminChatId, count: 3, silent: true }
    ]);
    assert.deepEqual(calls.deleted, [
        { chatId: adminChatId, messageId: 41 },
        { chatId: adminChatId, messageId: 42 },
        { chatId: adminChatId, messageId: 43 }
    ]);
});

test('uploading one photo sends a single silent photo, reads its file id and deletes the message', async () => {
    const { api, calls } = createFakeApi();
    const fileIds = await uploadReleaseMedia({
        api,
        chatId: adminChatId,
        photos: photos.slice(0, 1),
        log: () => undefined
    });

    assert.deepEqual(fileIds, ['a-large']);
    assert.deepEqual(calls.photos, [
        { chatId: adminChatId, filename: '1.jpg', silent: true }
    ]);
    assert.deepEqual(calls.albums, []);
    assert.deepEqual(calls.deleted, [{ chatId: adminChatId, messageId: 41 }]);
});

test('a failed cleanup still returns the file ids and asks for a manual delete', async () => {
    const { api } = createFakeApi({ deleteFails: true });
    const logs: string[] = [];
    const fileIds = await uploadReleaseMedia({
        api,
        chatId: adminChatId,
        photos,
        log: message => logs.push(message)
    });

    assert.equal(fileIds.length, 3);
    assert.match(logs.join('\n'), /Could not delete 3/);
});

test('an album answer with a different photo count is rejected', async () => {
    const { api } = createFakeApi({ messages: albumMessages.slice(0, 2) });

    await assert.rejects(
        uploadReleaseMedia({ api, chatId: adminChatId, photos }),
        /2 messages for 3 photos/
    );
});

test('the upload goes through the multipart Telegram client without leaking the token', async () => {
    const requests: { url: string; media: unknown; files: number }[] = [];
    const api = createTelegramApi({
        botToken,
        fetch: async (input, init) => {
            const url = String(input);
            const body = init?.body;

            if (body instanceof FormData) {
                requests.push({
                    url,
                    media: JSON.parse(String(body.get('media'))),
                    files: [...body.keys()].filter(key => /^p\d$/.test(key))
                        .length
                });
                return Response.json({ ok: true, result: albumMessages });
            }

            requests.push({ url, media: null, files: 0 });
            return Response.json({
                ok: false,
                error_code: 400,
                description: `message to delete not found for ${botToken}`
            });
        }
    });
    const logs: string[] = [];
    const fileIds = await uploadReleaseMedia({
        api,
        chatId: adminChatId,
        photos,
        log: message => logs.push(message)
    });

    assert.deepEqual(fileIds, ['a-large', 'b-large', 'c-large']);
    assert.ok(requests[0]?.url.endsWith('/sendMediaGroup'));
    assert.equal(requests[0]?.files, 3);
    assert.deepEqual(requests[0]?.media, [
        { type: 'photo', media: 'attach://p0' },
        { type: 'photo', media: 'attach://p1' },
        { type: 'photo', media: 'attach://p2' }
    ]);
    assert.equal(
        requests.filter(request => request.url.endsWith('/deleteMessage'))
            .length,
        3
    );
    assert.ok(!logs.join('\n').includes(botToken));
});

test('merging keeps other versions and writes formatted JSON', () => {
    const merged = mergeReleaseMedia('{"1.9.0": ["x", "y"]}\n', '2.0.0', [
        'a',
        'b',
        'c'
    ]);

    assert.deepEqual(JSON.parse(merged), {
        '1.9.0': ['x', 'y'],
        '2.0.0': ['a', 'b', 'c']
    });
    assert.ok(merged.endsWith('}\n'));
    assert.match(merged, /\n {4}"2\.0\.0": \[\n {8}"a",/);
    assert.deepEqual(JSON.parse(mergeReleaseMedia(null, '2.0.0', ['a', 'b'])), {
        '2.0.0': ['a', 'b']
    });
    assert.deepEqual(
        JSON.parse(
            mergeReleaseMedia('{"2.0.0": ["old", "ids"]}', '2.0.0', ['n', 'm'])
        ),
        { '2.0.0': ['n', 'm'] }
    );
    assert.throws(
        () => mergeReleaseMedia('{"2.0.0": "broken"}', '2.1.0', ['a', 'b']),
        /is invalid/
    );
});

test('upload credentials load the target env file only when a key is missing', () => {
    const loadedTargets: string[] = [];
    const loadEnvFile = (target: string) => loadedTargets.push(target);

    assert.deepEqual(
        resolveUploadCredentials(
            'production',
            { BOT_TOKEN: botToken, ADMIN_ID: adminChatId },
            loadEnvFile
        ),
        { botToken, chatId: adminChatId }
    );
    assert.deepEqual(loadedTargets, []);
    assert.throws(
        () => {
            return resolveUploadCredentials(
                'preview',
                { BOT_TOKEN: botToken },
                loadEnvFile
            );
        },
        error => {
            assert.ok(error instanceof Error);
            assert.match(
                error.message,
                /Missing required environment variables: ADMIN_ID/
            );
            assert.ok(!error.message.includes(botToken));
            return true;
        }
    );
    assert.deepEqual(loadedTargets, ['preview']);
});
