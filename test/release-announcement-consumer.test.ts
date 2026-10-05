import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
    DISABLED_RETRY_DELAY_SECONDS,
    getBackoffSeconds,
    LOGGED_DESCRIPTION_MAX_LENGTH,
    processReleaseAnnouncementBatch,
    QUEUE_MAX_DELIVERIES,
    QUEUE_MAX_RETRIES,
    STATE_WRITE_MAX_ATTEMPTS,
    type AnnouncementUser,
    type AnnouncementRecord,
    type ReleaseAnnouncementConsumerDependencies,
    type ReleaseAnnouncementMessage
} from '../src/worker/queues/release-announcements';

const releaseVersion = '2.0.0';

const telegramError = (
    code: number,
    options: {
        retryAfter?: number;
        description?: string;
    } = {}
) => {
    return Object.assign(new Error(`Telegram ${code}`), {
        response: {
            ok: false,
            error_code: code,
            description: options.description,
            parameters: options.retryAfter
                ? { retry_after: options.retryAfter }
                : undefined
        }
    });
};

interface Scenario {
    announcement?: AnnouncementRecord | null;
    user?: AnnouncementUser | null;
    sendErrors?: unknown[];
    sendError?: unknown;
    rendered?: string | null;
    enabled?: boolean;
    claimed?: boolean;
    currentVersion?: string;
    media?: readonly string[];
    mediaErrors?: unknown[];
}

const createUser = (overrides: Partial<AnnouncementUser> = {}) => {
    return {
        id: 1,
        telegramId: 5001,
        language: null,
        telegramLanguageCode: null,
        releaseVersion: '1.7.1',
        blockedAt: null,
        ...overrides
    } satisfies AnnouncementUser;
};

const createHarness = (scenario: Scenario = {}) => {
    const announcement =
        scenario.announcement === undefined
            ? { id: 10, status: 'queued' as const, mediaSentAt: null }
            : scenario.announcement;
    const user = scenario.user === undefined ? createUser() : scenario.user;
    const pendingErrors = [...(scenario.sendErrors ?? [])];
    const pendingMediaErrors = [...(scenario.mediaErrors ?? [])];
    const state = {
        sent: [] as { telegramId: number; html: string }[],
        albums: [] as { telegramId: number; fileIds: readonly string[] }[],
        calls: [] as string[],
        mediaMarks: [] as number[],
        blocked: [] as number[],
        marks: [] as unknown[][],
        sleeps: [] as number[],
        logs: [] as Record<string, unknown>[],
        requeued: [] as { job: unknown; delaySeconds: number }[],
        claims: 0,
        clock: 1000,
        locales: [] as string[]
    };
    const dependencies: ReleaseAnnouncementConsumerDependencies = {
        isBroadcastEnabled: () => scenario.enabled ?? true,
        getCurrentReleaseVersion: () => {
            return scenario.currentVersion ?? releaseVersion;
        },
        async findAnnouncement() {
            return announcement;
        },
        async findUser() {
            return user;
        },
        renderAnnouncement(_version, locale) {
            state.locales.push(locale);
            return scenario.rendered === undefined
                ? `announcement ${locale}`
                : scenario.rendered;
        },
        getReleaseMedia: () => scenario.media ?? [],
        async claimForSending() {
            state.claims += 1;
            return scenario.claimed ?? true;
        },
        async sendMediaGroup(telegramId, fileIds) {
            state.calls.push('album');

            const queuedError = pendingMediaErrors.shift();

            if (queuedError) {
                throw queuedError;
            }

            state.albums.push({ telegramId, fileIds });
        },
        async sendMessage(telegramId, html) {
            state.calls.push('text');

            const queuedError = pendingErrors.shift();

            if (queuedError) {
                throw queuedError;
            }

            if (scenario.sendError) {
                throw scenario.sendError;
            }

            state.sent.push({ telegramId, html });
        },
        async markMediaSent(announcementId) {
            state.mediaMarks.push(announcementId);
        },
        async markBlocked(telegramId) {
            state.blocked.push(telegramId);
        },
        async markSent(...arguments_) {
            state.marks.push(['sent', ...arguments_.slice(0, 3)]);
        },
        async markSkipped(...arguments_) {
            state.marks.push(['skipped', ...arguments_.slice(0, 4)]);
        },
        async releaseToQueue(...arguments_) {
            state.marks.push(['queued', ...arguments_.slice(0, 3)]);
        },
        async markFailed(...arguments_) {
            state.marks.push(['failed', ...arguments_.slice(0, 2)]);
        },
        async requeueJob(job, delaySeconds) {
            state.requeued.push({ job, delaySeconds });
        },
        async sleep(milliseconds) {
            state.sleeps.push(milliseconds);
            state.clock += milliseconds;
        },
        now: () => state.clock,
        log: entry => state.logs.push(entry)
    };

    return { dependencies, state };
};

const createMessage = (
    attempts = 1,
    userId = 1,
    body: unknown = { releaseVersion, userId }
) => {
    const outcome = {
        acked: false,
        retried: false,
        retryOptions: undefined as { delaySeconds?: number } | undefined
    };
    const message: ReleaseAnnouncementMessage = {
        body,
        attempts,
        ack() {
            outcome.acked = true;
        },
        retry(options) {
            outcome.retried = true;
            outcome.retryOptions = options;
        }
    };

    return { message, outcome };
};

const runOne = async (scenario: Scenario, attempts = 1, body?: unknown) => {
    const harness = createHarness(scenario);
    const { message, outcome } = createMessage(attempts, 1, body);

    await processReleaseAnnouncementBatch([message], harness.dependencies);

    return { ...harness, outcome };
};

test('successful delivery marks the row sent and acknowledges', async () => {
    const { dependencies, state } = createHarness();
    const { message, outcome } = createMessage();

    await processReleaseAnnouncementBatch([message], dependencies);

    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.deepEqual(state.sent, [
        { telegramId: 5001, html: 'announcement uk' }
    ]);
    assert.deepEqual(state.marks, [['sent', 10, 1, releaseVersion]]);
    assert.equal(state.logs[0]?.event, 'release_announcement_sent');
    assert.deepEqual(Object.keys(state.logs[0] ?? {}).sort(), [
        'event',
        'releaseVersion'
    ]);
});

test('the announcement is rendered in the stored language of the user', async () => {
    const { dependencies, state } = createHarness({
        user: createUser({ language: 'pl', telegramLanguageCode: 'uk' })
    });

    await processReleaseAnnouncementBatch(
        [createMessage().message],
        dependencies
    );

    assert.deepEqual(state.locales, ['pl']);
    assert.equal(state.sent[0]?.html, 'announcement pl');
});

test('Auto language users get the locale resolved from their Telegram language code', async () => {
    const expectations: [string | null, string][] = [
        ['uk', 'uk'],
        ['uk-UA', 'uk'],
        ['pl', 'pl'],
        ['en', 'en'],
        ['de', 'en'],
        ['', 'uk'],
        [null, 'uk']
    ];

    for (const [telegramLanguageCode, locale] of expectations) {
        const { dependencies, state } = createHarness({
            user: createUser({ language: null, telegramLanguageCode })
        });

        await processReleaseAnnouncementBatch(
            [createMessage().message],
            dependencies
        );

        assert.deepEqual(state.locales, [locale], String(telegramLanguageCode));
    }
});

test('429 acknowledges and re-enqueues a fresh job without counting an attempt', async () => {
    const { outcome, state } = await runOne({
        sendError: telegramError(429, { retryAfter: 12 })
    });

    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.deepEqual(state.requeued, [
        { job: { releaseVersion, userId: 1 }, delaySeconds: 13 }
    ]);
    assert.deepEqual(state.marks, [['queued', 10, 429, false]]);
    assert.equal(state.logs[0]?.event, 'release_announcement_rate_limited');
});

test('403 marks the user blocked, skips the announcement and acknowledges', async () => {
    const { outcome, state } = await runOne({ sendError: telegramError(403) });

    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.deepEqual(state.blocked, [5001]);
    assert.deepEqual(state.marks, [['skipped', 10, 1, releaseVersion, 403]]);
    assert.equal(state.logs[0]?.event, 'release_announcement_skipped');
});

test('a failing blocked write is retried and still skips the announcement', async () => {
    const harness = createHarness({ sendError: telegramError(403) });
    const { message, outcome } = createMessage();
    let writes = 0;

    harness.dependencies.markBlocked = async () => {
        writes += 1;
        throw new Error('D1 unavailable');
    };

    await processReleaseAnnouncementBatch([message], harness.dependencies);

    assert.equal(writes, STATE_WRITE_MAX_ATTEMPTS);
    assert.equal(outcome.acked, true);
    assert.deepEqual(harness.state.marks, [
        ['skipped', 10, 1, releaseVersion, 403]
    ]);
});

test('permanent 400 descriptions skip the user case-insensitively', async () => {
    const descriptions = [
        'Bad Request: chat not found',
        'Bad Request: bot was kicked from the supergroup chat',
        'Bad Request: bot is not a member of the channel chat',
        'Bad Request: have no rights to send a message',
        'Bad Request: CHAT_WRITE_FORBIDDEN',
        'Bad Request: user is deactivated',
        'Bad Request: PEER_ID_INVALID',
        'Bad Request: GROUP CHAT WAS DEACTIVATED'
    ];

    for (const description of descriptions) {
        const { outcome, state } = await runOne({
            sendError: telegramError(400, { description })
        });

        assert.equal(outcome.acked, true, description);
        assert.deepEqual(state.blocked, [], description);
        assert.deepEqual(
            state.marks,
            [['skipped', 10, 1, releaseVersion, 400]],
            description
        );
    }
});

test('other 400 errors fail the row without bumping the version and log a truncated description', async () => {
    const description = `Bad Request: can't parse entities ${'x'.repeat(500)}`;
    const { outcome, state } = await runOne({
        sendError: telegramError(400, { description })
    });

    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.deepEqual(state.marks, [['failed', 10, 400]]);
    assert.equal(state.logs[0]?.event, 'release_announcement_failed');
    assert.equal(
        String(state.logs[0]?.description).length,
        LOGGED_DESCRIPTION_MAX_LENGTH
    );
});

test('any 5xx is ambiguous, skipped with its status code and never resent', async () => {
    for (const errorCode of [500, 502, 504]) {
        for (const attempts of [1, QUEUE_MAX_DELIVERIES]) {
            const { outcome, state } = await runOne(
                { sendError: telegramError(errorCode) },
                attempts
            );

            assert.equal(outcome.acked, true);
            assert.equal(outcome.retried, false);
            assert.deepEqual(state.marks, [
                ['skipped', 10, 1, releaseVersion, errorCode]
            ]);
            assert.equal(
                state.logs[0]?.event,
                'release_announcement_ambiguous'
            );
            assert.equal(state.logs[0]?.errorCode, errorCode);
            assert.deepEqual(state.sent, []);
        }
    }
});

test('a network failure without a Telegram response is ambiguous and never resent', async () => {
    const { outcome, state } = await runOne({
        sendError: new TypeError('fetch failed')
    });

    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.deepEqual(state.marks, [['skipped', 10, 1, releaseVersion, null]]);
    assert.equal(state.logs[0]?.event, 'release_announcement_ambiguous');
    assert.deepEqual(state.sent, []);
});

test('backoff is capped at one hour', () => {
    assert.equal(getBackoffSeconds(1), 30);
    assert.equal(getBackoffSeconds(8), 3600);
    assert.equal(getBackoffSeconds(50), 3600);
});

test('queue delivery limits match the committed wrangler consumers', () => {
    const config = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'wrangler.jsonc'), 'utf8')
    );

    const consumers = config.env.production.queues.consumers;

    assert.equal(consumers.length, 1);
    assert.equal(consumers[0].max_retries, QUEUE_MAX_RETRIES);

    assert.equal(QUEUE_MAX_DELIVERIES, QUEUE_MAX_RETRIES + 1);
});

test('duplicate delivery of a settled row acknowledges without sending', async () => {
    for (const status of ['sent', 'skipped', 'failed'] as const) {
        const { outcome, state } = await runOne({
            announcement: { id: 10, status, mediaSentAt: null }
        });

        assert.equal(outcome.acked, true);
        assert.deepEqual(state.sent, []);
        assert.deepEqual(state.marks, []);
    }
});

test('a row already in sending is ambiguous: skipped, logged and never resent', async () => {
    const { outcome, state } = await runOne({
        announcement: { id: 10, status: 'sending', mediaSentAt: null }
    });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.sent, []);
    assert.equal(state.claims, 0);
    assert.deepEqual(state.marks, [['skipped', 10, 1, releaseVersion, null]]);
    assert.equal(state.logs[0]?.event, 'release_announcement_ambiguous');
});

test('a lost compare-and-set acknowledges without sending', async () => {
    const { outcome, state } = await runOne({ claimed: false });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.sent, []);
    assert.deepEqual(state.marks, []);
});

test('a user already on or past the version is acknowledged without sending', async () => {
    for (const userVersion of ['2.0.0', '2.1.0']) {
        const { outcome, state } = await runOne({
            user: createUser({ releaseVersion: userVersion })
        });

        assert.equal(outcome.acked, true);
        assert.deepEqual(state.sent, []);
    }
});

test('a missing user or announcement row is acknowledged', async () => {
    for (const scenario of [{ user: null }, { announcement: null }]) {
        const { outcome, state } = await runOne(scenario);

        assert.equal(outcome.acked, true);
        assert.deepEqual(state.sent, []);
    }
});

test('a blocked user is skipped without sending', async () => {
    const { outcome, state } = await runOne({
        user: createUser({ blockedAt: new Date(500) })
    });

    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.deepEqual(state.sent, []);
    assert.deepEqual(state.blocked, []);
    assert.equal(state.claims, 0);
    assert.deepEqual(state.marks, [['skipped', 10, 1, releaseVersion, null]]);
    assert.equal(state.logs[0]?.event, 'release_announcement_skipped');
    assert.equal(state.logs[0]?.reason, 'user_blocked');
});

test('missing release notes retry without touching state', async () => {
    const { outcome, state } = await runOne({ rendered: null });

    assert.equal(outcome.acked, false);
    assert.deepEqual(outcome.retryOptions, { delaySeconds: 30 });
    assert.deepEqual(state.sent, []);
    assert.equal(state.claims, 0);
});

test('the kill switch retries every message after ten minutes without sending or writing', async () => {
    const { outcome, state } = await runOne({ enabled: false });

    assert.equal(outcome.acked, false);
    assert.deepEqual(outcome.retryOptions, {
        delaySeconds: DISABLED_RETRY_DELAY_SECONDS
    });
    assert.equal(DISABLED_RETRY_DELAY_SECONDS, 600);
    assert.deepEqual(state.sent, []);
    assert.deepEqual(state.marks, []);
    assert.equal(state.claims, 0);
});

test('invalid job bodies are acknowledged and logged', async () => {
    const bodies = [
        null,
        'text',
        {},
        { releaseVersion: '2.0', userId: 1 },
        { releaseVersion: '02.0.0', userId: 1 },
        { releaseVersion: '2.0.0-rc', userId: 1 },
        { releaseVersion, userId: 0 },
        { releaseVersion, userId: -3 },
        { releaseVersion, userId: 1.5 },
        { releaseVersion, userId: Number.MAX_SAFE_INTEGER + 2 },
        { releaseVersion, userId: '1' },
        { releaseVersion, channelId: 1 }
    ];

    for (const body of bodies) {
        const { outcome, state } = await runOne({}, 1, body);

        assert.equal(outcome.acked, true, JSON.stringify(body));
        assert.equal(state.logs[0]?.event, 'release_announcement_invalid_job');
        assert.deepEqual(state.sent, []);
        assert.equal(state.claims, 0);
    }
});

test('jobs for a release that is no longer the latest are acknowledged as stale', async () => {
    const { outcome, state } = await runOne({ currentVersion: '2.1.0' });

    assert.equal(outcome.acked, true);
    assert.equal(state.logs[0]?.event, 'release_announcement_stale_job');
    assert.deepEqual(state.sent, []);
    assert.equal(state.claims, 0);
});

test('a state write is retried and a persistent failure acknowledges without resending', async () => {
    const harness = createHarness();
    const { message, outcome } = createMessage();
    let writes = 0;

    harness.dependencies.markSent = async () => {
        writes += 1;
        throw new Error('D1 unavailable');
    };

    await processReleaseAnnouncementBatch([message], harness.dependencies);

    assert.equal(writes, STATE_WRITE_MAX_ATTEMPTS);
    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.equal(harness.state.sent.length, 1);
    assert.equal(harness.state.sleeps.length, STATE_WRITE_MAX_ATTEMPTS - 1);
    assert.ok(
        harness.state.logs.some(entry => {
            return entry.event === 'release_announcement_state_write_failed';
        })
    );
});

test('a state write that recovers within the retry budget still succeeds', async () => {
    const harness = createHarness();
    const { message, outcome } = createMessage();
    let writes = 0;

    harness.dependencies.markSent = async () => {
        writes += 1;

        if (writes < 3) {
            throw new Error('D1 unavailable');
        }
    };

    await processReleaseAnnouncementBatch([message], harness.dependencies);

    assert.equal(writes, 3);
    assert.equal(outcome.acked, true);
    assert.ok(
        !harness.state.logs.some(entry => {
            return entry.event === 'release_announcement_state_write_failed';
        })
    );
});

test('an unexpected error before sending retries the message and never throws', async () => {
    const harness = createHarness();
    const { message, outcome } = createMessage();

    harness.dependencies.claimForSending = async () => {
        throw new Error('D1 unavailable');
    };

    await processReleaseAnnouncementBatch([message], harness.dependencies);

    assert.equal(outcome.acked, false);
    assert.equal(outcome.retried, true);
    assert.deepEqual(harness.state.sent, []);
});

test('sends inside a batch are paced at least 50ms apart', async () => {
    const { dependencies, state } = createHarness();

    await processReleaseAnnouncementBatch(
        [createMessage().message, createMessage().message],
        dependencies
    );

    assert.equal(state.sent.length, 2);
    assert.deepEqual(state.sleeps, [50]);
});

test('one blocked user does not stop the rest of the batch', async () => {
    const { dependencies, state } = createHarness();
    const first = createMessage();
    const second = createMessage();
    let calls = 0;

    dependencies.sendMessage = async (telegramId, html) => {
        calls += 1;

        if (calls === 1) {
            throw telegramError(403);
        }

        state.sent.push({ telegramId, html });
    };

    await processReleaseAnnouncementBatch(
        [first.message, second.message],
        dependencies
    );

    assert.equal(first.outcome.acked, true);
    assert.equal(second.outcome.acked, true);
    assert.equal(state.sent.length, 1);
});

const albumFileIds = ['photo-a', 'photo-b', 'photo-c'];

const mediaEvents = (logs: readonly Record<string, unknown>[]) => {
    return logs.filter(entry => {
        return entry.event === 'release_announcement_media';
    });
};

test('a release with media sends the album first and then the announcement text', async () => {
    const { outcome, state } = await runOne({ media: albumFileIds });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.calls, ['album', 'text']);
    assert.deepEqual(state.albums, [
        { telegramId: 5001, fileIds: albumFileIds }
    ]);
    assert.deepEqual(state.sent, [
        { telegramId: 5001, html: 'announcement uk' }
    ]);
    assert.deepEqual(state.mediaMarks, [10]);
    assert.deepEqual(state.marks, [['sent', 10, 1, releaseVersion]]);
    assert.deepEqual(mediaEvents(state.logs), [
        { event: 'release_announcement_media', outcome: 'sent', releaseVersion }
    ]);
});

test('the text after an album waits one send interval per photo', async () => {
    const { state } = await runOne({ media: albumFileIds });

    assert.deepEqual(state.sleeps, [150]);
});

test('a retry after a delivered album sends only the text', async () => {
    const { outcome, state } = await runOne({
        media: albumFileIds,
        announcement: { id: 10, status: 'queued', mediaSentAt: new Date(500) }
    });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.calls, ['text']);
    assert.deepEqual(state.mediaMarks, []);
    assert.deepEqual(state.marks, [['sent', 10, 1, releaseVersion]]);
    assert.deepEqual(mediaEvents(state.logs), []);
});

test('a 429 on the text after a delivered album keeps the album mark for the retry', async () => {
    const { outcome, state } = await runOne({
        media: albumFileIds,
        sendErrors: [telegramError(429, { retryAfter: 4 })]
    });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.calls, ['album', 'text']);
    assert.deepEqual(state.mediaMarks, [10]);
    assert.deepEqual(state.marks, [['queued', 10, 429, false]]);
    assert.deepEqual(state.requeued, [
        { job: { releaseVersion, userId: 1 }, delaySeconds: 5 }
    ]);
});

test('a 403 on the album blocks the user and skips the text', async () => {
    const { outcome, state } = await runOne({
        media: albumFileIds,
        mediaErrors: [telegramError(403)]
    });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.calls, ['album']);
    assert.deepEqual(state.blocked, [5001]);
    assert.deepEqual(state.mediaMarks, []);
    assert.deepEqual(state.marks, [['skipped', 10, 1, releaseVersion, 403]]);
    assert.deepEqual(mediaEvents(state.logs), [
        {
            event: 'release_announcement_media',
            outcome: 'skipped',
            errorCode: 403,
            releaseVersion
        }
    ]);
});

test('a chat-level 400 on the album skips the user without the text', async () => {
    const { outcome, state } = await runOne({
        media: albumFileIds,
        mediaErrors: [
            telegramError(400, { description: 'Bad Request: chat not found' })
        ]
    });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.calls, ['album']);
    assert.deepEqual(state.blocked, []);
    assert.deepEqual(state.marks, [['skipped', 10, 1, releaseVersion, 400]]);
});

test('a 429 on the album re-enqueues the job without counting an attempt or sending the text', async () => {
    const { outcome, state } = await runOne({
        media: albumFileIds,
        mediaErrors: [telegramError(429, { retryAfter: 20 })]
    });

    assert.equal(outcome.acked, true);
    assert.equal(outcome.retried, false);
    assert.deepEqual(state.calls, ['album']);
    assert.deepEqual(state.mediaMarks, []);
    assert.deepEqual(state.marks, [['queued', 10, 429, false]]);
    assert.deepEqual(state.requeued, [
        { job: { releaseVersion, userId: 1 }, delaySeconds: 21 }
    ]);
    assert.equal(mediaEvents(state.logs)[0]?.outcome, 'rate_limited');
});

test('a bad file id on the album logs a failed album and still sends the text', async () => {
    const { outcome, state } = await runOne({
        media: albumFileIds,
        mediaErrors: [
            telegramError(400, {
                description: 'Bad Request: wrong remote file identifier'
            })
        ]
    });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.calls, ['album', 'text']);
    assert.deepEqual(state.mediaMarks, []);
    assert.deepEqual(state.marks, [['sent', 10, 1, releaseVersion]]);
    assert.deepEqual(mediaEvents(state.logs), [
        {
            event: 'release_announcement_media',
            outcome: 'failed',
            errorCode: 400,
            releaseVersion
        }
    ]);
    assert.ok(
        !state.logs.some(entry => {
            return JSON.stringify(entry).includes('wrong remote file');
        })
    );
});

test('an ambiguous album failure is never resent and the text still goes out', async () => {
    for (const mediaError of [telegramError(502), new TypeError('fetch')]) {
        const { outcome, state } = await runOne({
            media: albumFileIds,
            mediaErrors: [mediaError]
        });

        assert.equal(outcome.acked, true);
        assert.deepEqual(state.calls, ['album', 'text']);
        assert.deepEqual(state.mediaMarks, [10]);
        assert.deepEqual(state.marks, [['sent', 10, 1, releaseVersion]]);
        assert.equal(mediaEvents(state.logs)[0]?.outcome, 'ambiguous');
    }
});

test('without configured media the delivery is unchanged', async () => {
    const { outcome, state } = await runOne({ media: [] });

    assert.equal(outcome.acked, true);
    assert.deepEqual(state.calls, ['text']);
    assert.deepEqual(state.albums, []);
    assert.deepEqual(state.mediaMarks, []);
    assert.deepEqual(state.sleeps, []);
    assert.deepEqual(state.marks, [['sent', 10, 1, releaseVersion]]);
});

test('albums inside a batch keep the next user one interval per photo away', async () => {
    const { dependencies, state } = createHarness({ media: albumFileIds });

    await processReleaseAnnouncementBatch(
        [createMessage().message, createMessage().message],
        dependencies
    );

    assert.deepEqual(state.calls, ['album', 'text', 'album', 'text']);
    assert.deepEqual(state.sleeps, [150, 50, 150]);
});
