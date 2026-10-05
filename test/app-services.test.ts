import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';
import type { User } from 'telegraf/types';

import {
    deliver,
    renderAdminFeedback,
    type FeedbackTransport
} from '../src/bot/services/feedback-service';
import { createShareService } from '../src/bot/services/share-service';
import { createWishService } from '../src/bot/services/wish-service';
import type { Repositories, ShareRecord } from '../src/db/repositories';

const now = new Date('2026-10-03T10:00:00Z');

const ACTOR: User = {
    id: 100,
    is_bot: false,
    first_name: 'Olena',
    username: 'olena'
};

interface SentMessage {
    chatId: string;
    html: string;
    extra: { parse_mode: 'HTML' };
}

const createTransport = (failWith?: unknown) => {
    const sent: SentMessage[] = [];
    const transport: FeedbackTransport = {
        sendMessage(chatId, html, extra) {
            sent.push({ chatId, html, extra });

            return failWith === undefined
                ? Promise.resolve({})
                : Promise.reject(failWith);
        }
    };

    return { transport, sent };
};

const telegramError = (errorCode: number) => {
    return Object.assign(new Error(`telegram ${errorCode}`), {
        response: { error_code: errorCode, description: 'failure' }
    });
};

test('bot feedback is delivered with the unchanged admin layout', async () => {
    const { transport, sent } = createTransport();
    const delivery = await deliver(transport, ' 42 ', ACTOR, 'Hi <b>', 'bot');

    assert.deepEqual(delivery, { status: 'delivered' });
    assert.deepEqual(sent, [
        {
            chatId: '42',
            html: '#відгук від Olena @olena\n\nHi &lt;b&gt;',
            extra: { parse_mode: 'HTML' }
        }
    ]);
    assert.equal(sent[0]?.html, renderAdminFeedback(ACTOR, 'Hi <b>', 'bot'));
});

test('app feedback carries the app tag after the text', async () => {
    const { transport, sent } = createTransport();
    const delivery = await deliver(transport, '42', ACTOR, 'Hello', 'app');

    assert.deepEqual(delivery, { status: 'delivered' });
    assert.equal(
        sent[0]?.html,
        `${renderAdminFeedback(ACTOR, 'Hello', 'bot')}\n\n#app`
    );
});

test('a missing admin id skips delivery without sending', async () => {
    const warnings: unknown[] = [];
    const originalWarn = console.warn;

    console.warn = (...args: unknown[]) => {
        warnings.push(args[0]);
    };

    try {
        for (const adminId of [undefined, '', '   ']) {
            const { transport, sent } = createTransport();

            assert.deepEqual(
                await deliver(transport, adminId, ACTOR, 'Hello', 'app'),
                { status: 'skipped' }
            );
            assert.equal(sent.length, 0);
        }
    } finally {
        console.warn = originalWarn;
    }

    assert.equal(warnings.length, 3);
});

test('403 and 400 from Telegram report notDelivered instead of throwing', async () => {
    for (const code of [403, 400]) {
        const { transport } = createTransport(telegramError(code));
        const delivery = await deliver(transport, '42', ACTOR, 'Hello', 'app');

        assert.equal(delivery.status, 'notDelivered');
    }
});

test('other Telegram failures are rethrown', async () => {
    const { transport } = createTransport(telegramError(500));

    await assert.rejects(
        deliver(transport, '42', ACTOR, 'Hello', 'bot'),
        /telegram 500/
    );
});

const createShare = (overrides: Partial<ShareRecord> = {}): ShareRecord => {
    return {
        userId: 7,
        publicId: '01j9z0000000000000000000ab',
        displayName: 'Serhii',
        showUsername: false,
        allowIndexing: true,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
};

const createShareFakes = (stored: ShareRecord | null) => {
    const writes: boolean[] = [];
    const repositories = {
        wishes: {},
        shares: {
            findActiveByUserId: () => {
                return Effect.succeed(stored);
            },
            setShowUsername: (
                _userId: number,
                showUsername: boolean,
                at: Date
            ) => {
                writes.push(showUsername);

                return Effect.succeed(
                    stored === null
                        ? null
                        : { ...stored, showUsername, updatedAt: at }
                );
            }
        }
    } as unknown as Pick<Repositories, 'wishes' | 'shares'>;

    return { repositories, writes };
};

const SEARCHABLE_OWNER = {
    id: 7,
    username: 'owner',
    usernameSearchable: true
};

test('setShowUsername sets the explicit value and reports the change', async () => {
    const { repositories, writes } = createShareFakes(createShare());
    const service = createShareService(repositories, () => now);
    const enabled = await service.setShowUsername(SEARCHABLE_OWNER, true);

    assert.equal(enabled?.changed, true);
    assert.equal(enabled?.share.showUsername, true);
    assert.deepEqual(writes, [true]);
});

test('setShowUsername is a no-op when the value already matches', async () => {
    const { repositories, writes } = createShareFakes(
        createShare({ showUsername: true })
    );
    const service = createShareService(repositories, () => now);
    const outcome = await service.setShowUsername(SEARCHABLE_OWNER, true);

    assert.equal(outcome?.changed, false);
    assert.equal(outcome?.share.showUsername, true);
    assert.equal(writes.length, 0);
});

test('setShowUsername refuses to enable without a public username but may disable', async () => {
    const hidden = createShareFakes(createShare());
    const refused = await createShareService(
        hidden.repositories,
        () => now
    ).setShowUsername({ ...SEARCHABLE_OWNER, usernameSearchable: false }, true);

    assert.equal(refused?.changed, false);
    assert.equal(hidden.writes.length, 0);

    const shown = createShareFakes(createShare({ showUsername: true }));
    const disabled = await createShareService(
        shown.repositories,
        () => now
    ).setShowUsername({ ...SEARCHABLE_OWNER, username: null }, false);

    assert.equal(disabled?.changed, true);
    assert.equal(disabled?.share.showUsername, false);
});

test('setShowUsername without an active share does nothing', async () => {
    const { repositories, writes } = createShareFakes(null);
    const outcome = await createShareService(
        repositories,
        () => now
    ).setShowUsername(SEARCHABLE_OWNER, true);

    assert.equal(outcome, null);
    assert.equal(writes.length, 0);
});

test('wish service forwards the app methods with the injected clock', async () => {
    const calls: unknown[][] = [];
    const record = (name: string, result: unknown) => {
        return (...args: unknown[]) => {
            calls.push([name, ...args]);

            return Effect.succeed(result);
        };
    };
    const repositories = {
        wishes: {
            createWithFields: record('createWithFields', { id: 1 }),
            setFlags: record('setFlags', { id: 1 }),
            removeImageAt: record('removeImageAt', null),
            findImageFileId: record('findImageFileId', 'file'),
            findSharedWishImages: record('findSharedWishImages', '["a","","b"]')
        },
        users: {},
        gives: {}
    } as unknown as Parameters<typeof createWishService>[0];
    const service = createWishService(repositories, () => now);

    await service.createWithFields(7, {
        title: 'Kettle',
        price: 5,
        currency: 'UAH'
    });
    await service.setFlags(1, 7, { hidden: true });
    await service.removeImageAt(1, 7, 2, '["a","b","c"]');

    assert.equal(await service.findImageFileId(1, 0), 'file');
    assert.deepEqual(await service.findSharedWishImages('share', 1), [
        'a',
        'b'
    ]);
    assert.deepEqual(calls.slice(0, 3), [
        [
            'createWithFields',
            7,
            { title: 'Kettle', price: 5, currency: 'UAH' },
            now
        ],
        ['setFlags', 1, 7, { hidden: true }, now],
        ['removeImageAt', 1, 7, 2, '["a","b","c"]', now]
    ]);
});

test('wish service maps a missing shared wish to null images', async () => {
    const repositories = {
        wishes: {
            findSharedWishImages: () => {
                return Effect.succeed(null);
            }
        },
        users: {},
        gives: {}
    } as unknown as Parameters<typeof createWishService>[0];

    assert.equal(
        await createWishService(repositories).findSharedWishImages('x', 1),
        null
    );
});
