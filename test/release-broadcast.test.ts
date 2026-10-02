import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import {
    RELEASE_QUEUE_BATCH_LIMIT,
    STALE_ANNOUNCEMENT_AGE_MILLISECONDS,
    runReleaseBroadcast,
    type ReleaseBroadcastDependencies
} from '../src/worker/scheduled/release-broadcast';
import {
    RELEASE_BROADCAST_CRON,
    runScheduledTasks
} from '../src/worker/scheduled/tasks';
import type { ReleaseAnnouncementJob } from '../src/worker/queues/release-announcement-job';
import type { WorkerBindings } from '../src/worker/env';

const currentVersion = '2.0.0';

const createEnv = (flag: 'true' | 'false', environment = 'preview') => {
    return {
        BOT_ENVIRONMENT: environment,
        ENABLE_RELEASE_BROADCAST: flag
    } as unknown as WorkerBindings;
};

const createDependencies = (
    candidates: { id: number; releaseVersion: string }[],
    overrides: Partial<ReleaseBroadcastDependencies> = {}
) => {
    const calls = {
        inserted: [] as number[][],
        deleted: [] as number[][],
        batches: [] as ReleaseAnnouncementJob[][],
        logs: [] as Record<string, unknown>[]
    };
    const dependencies: ReleaseBroadcastDependencies = {
        getCurrentReleaseVersion: () => currentVersion,
        async listCandidates() {
            return candidates;
        },
        async insertQueued(_version, userIds) {
            calls.inserted.push(userIds);
            return userIds;
        },
        async deleteQueued(_version, userIds) {
            calls.deleted.push(userIds);
        },
        async requeueStale() {
            return [];
        },
        async skipStuckSending() {
            return 0;
        },
        async sendBatch(jobs) {
            calls.batches.push(jobs);
        },
        now: () => new Date(STALE_ANNOUNCEMENT_AGE_MILLISECONDS * 2),
        log: entry => calls.logs.push(entry),
        ...overrides
    };

    return { calls, dependencies };
};

test('release broadcast does nothing when the flag is disabled', async () => {
    const { calls, dependencies } = createDependencies([
        { id: 1, releaseVersion: '1.7.1' }
    ]);

    const summary = await runReleaseBroadcast(
        createEnv('false', 'local'),
        dependencies
    );

    assert.equal(summary, null);
    assert.deepEqual(calls.inserted, []);
    assert.deepEqual(calls.batches, []);
    assert.equal(calls.logs[0]?.reason, 'disabled');
});

test('release broadcast does nothing when every user is current', async () => {
    const { calls, dependencies } = createDependencies([
        { id: 1, releaseVersion: '2.0.0' },
        { id: 2, releaseVersion: '2.1.0' }
    ]);

    const summary = await runReleaseBroadcast(createEnv('true'), dependencies);

    assert.deepEqual(summary, {
        releaseVersion: currentVersion,
        candidates: 0,
        inserted: 0,
        enqueued: 0
    });
    assert.deepEqual(calls.inserted, []);
    assert.deepEqual(calls.batches, []);
});

test('release broadcast treats unparsable user versions as outdated', async () => {
    const { calls, dependencies } = createDependencies([
        { id: 1, releaseVersion: 'garbage' },
        { id: 2, releaseVersion: '1.7.1' },
        { id: 3, releaseVersion: '2.0.0' }
    ]);

    await runReleaseBroadcast(createEnv('true'), dependencies);

    assert.deepEqual(calls.inserted, [[1, 2]]);
    assert.deepEqual(calls.batches, [
        [
            { releaseVersion: currentVersion, userId: 1 },
            { releaseVersion: currentVersion, userId: 2 }
        ]
    ]);
});

test('release broadcast enqueues only rows this run inserted', async () => {
    const { calls, dependencies } = createDependencies(
        [
            { id: 1, releaseVersion: '1.7.1' },
            { id: 2, releaseVersion: '1.7.1' },
            { id: 3, releaseVersion: '1.7.1' }
        ],
        {
            async insertQueued() {
                return [2];
            }
        }
    );

    const summary = await runReleaseBroadcast(createEnv('true'), dependencies);

    assert.deepEqual(calls.batches, [
        [{ releaseVersion: currentVersion, userId: 2 }]
    ]);
    assert.deepEqual(summary, {
        releaseVersion: currentVersion,
        candidates: 3,
        inserted: 1,
        enqueued: 1
    });
});

test('release broadcast chunks queue batches to the queue limit', async () => {
    const userCount = RELEASE_QUEUE_BATCH_LIMIT * 2 + 7;
    const candidates = Array.from({ length: userCount }, (_value, index) => {
        return { id: index + 1, releaseVersion: '1.7.1' };
    });
    const { calls, dependencies } = createDependencies(candidates);

    const summary = await runReleaseBroadcast(createEnv('true'), dependencies);

    assert.deepEqual(
        calls.batches.map(batch => batch.length),
        [RELEASE_QUEUE_BATCH_LIMIT, RELEASE_QUEUE_BATCH_LIMIT, 7]
    );
    assert.equal(summary?.enqueued, userCount);
    assert.equal(calls.logs.at(-1)?.event, 'release_broadcast_completed');
});

test('release broadcast rolls back unsent rows when the queue rejects a batch', async () => {
    const userCount = RELEASE_QUEUE_BATCH_LIMIT + 5;
    const candidates = Array.from({ length: userCount }, (_value, index) => {
        return { id: index + 1, releaseVersion: '1.7.1' };
    });
    let sendCalls = 0;
    const { calls, dependencies } = createDependencies(candidates, {
        async sendBatch(jobs) {
            sendCalls += 1;

            if (sendCalls === 2) {
                throw new Error('queue unavailable');
            }

            calls.batches.push(jobs);
        }
    });

    await assert.rejects(
        runReleaseBroadcast(createEnv('true'), dependencies),
        /queue unavailable/
    );

    assert.equal(calls.batches.length, 1);
    assert.deepEqual(calls.deleted, [[101, 102, 103, 104, 105]]);
    assert.equal(calls.logs.at(-1)?.event, 'release_broadcast_enqueue_failed');
});

test('release broadcast re-enqueues stale queued rows and skips stuck sending rows with a three hour cutoff', async () => {
    const stale: { cutoff: Date; now: Date }[] = [];
    const stuck: Date[] = [];
    const { calls, dependencies } = createDependencies([], {
        async requeueStale(_version, cutoff, now) {
            stale.push({ cutoff, now });
            return Array.from(
                { length: RELEASE_QUEUE_BATCH_LIMIT + 3 },
                (_value, index) => index + 1
            );
        },
        async skipStuckSending(_version, cutoff) {
            stuck.push(cutoff);
            return 2;
        }
    });

    await runReleaseBroadcast(createEnv('true'), dependencies);

    const now = dependencies.now();

    assert.equal(STALE_ANNOUNCEMENT_AGE_MILLISECONDS, 3 * 60 * 60 * 1000);
    assert.equal(
        stale[0]?.cutoff.getTime(),
        now.getTime() - STALE_ANNOUNCEMENT_AGE_MILLISECONDS
    );
    assert.deepEqual(stuck, [stale[0]?.cutoff]);
    assert.deepEqual(
        calls.batches.map(batch => batch.length),
        [RELEASE_QUEUE_BATCH_LIMIT, 3]
    );
    assert.deepEqual(calls.batches[0]?.[0], {
        releaseVersion: currentVersion,
        userId: 1
    });
    assert.ok(
        calls.logs.some(entry => {
            return (
                entry.event === 'release_broadcast_stale_recovered' &&
                entry.requeued === RELEASE_QUEUE_BATCH_LIMIT + 3 &&
                entry.skippedAmbiguous === 2
            );
        })
    );
});

test('release broadcast does not touch stale rows when the flag is disabled', async () => {
    let touched = false;
    const { dependencies } = createDependencies([], {
        async requeueStale() {
            touched = true;
            return [];
        }
    });

    await runReleaseBroadcast(createEnv('false'), dependencies);

    assert.equal(touched, false);
});

test('the release cron runs the broadcast and the state snapshot but never prunes', async () => {
    const controller = {
        cron: RELEASE_BROADCAST_CRON,
        scheduledTime: Date.now(),
        noRetry() {}
    } satisfies ScheduledController;
    const calls = { broadcast: 0, prune: 0 };

    const summary = await runScheduledTasks(
        controller,
        createEnv('true', 'preview'),
        {} as ExecutionContext,
        {
            async broadcastRelease() {
                calls.broadcast += 1;
            },
            async pruneProcessedTelegramUpdates() {
                calls.prune += 1;
                return 0;
            },
            async pruneAbandonedTelegramUpdates() {
                calls.prune += 1;
                return 0;
            },
            async pruneSessions() {
                calls.prune += 1;
                return 0;
            }
        }
    );

    assert.deepEqual(calls, { broadcast: 1, prune: 0 });
    assert.deepEqual(summary.taskNames, [
        'release:broadcast',
        'bot:state-snapshot'
    ]);
});

test('a broadcast failure is rethrown so the scheduled run fails', async () => {
    const controller = {
        cron: RELEASE_BROADCAST_CRON,
        scheduledTime: Date.now(),
        noRetry() {}
    } satisfies ScheduledController;
    const errorLog = mock.method(console, 'error', () => undefined);

    try {
        await assert.rejects(
            runScheduledTasks(
                controller,
                createEnv('true', 'preview'),
                {} as ExecutionContext,
                {
                    async broadcastRelease() {
                        throw new RangeError('queue unavailable');
                    }
                }
            ),
            RangeError
        );
    } finally {
        errorLog.mock.restore();
    }
});

test('the daily cron does not run the release broadcast', async () => {
    const controller = {
        cron: '0 0 * * *',
        scheduledTime: Date.now(),
        noRetry() {}
    } satisfies ScheduledController;
    let broadcastCalls = 0;

    await runScheduledTasks(
        controller,
        createEnv('true', 'preview'),
        {} as ExecutionContext,
        {
            async broadcastRelease() {
                broadcastCalls += 1;
            }
        }
    );

    assert.equal(broadcastCalls, 0);
});

test('release broadcast jobs carry the user id and the release version only', async () => {
    const { calls, dependencies } = createDependencies([
        { id: 41, releaseVersion: '1.7.1' }
    ]);

    await runReleaseBroadcast(createEnv('true'), dependencies);

    assert.deepEqual(calls.batches, [
        [{ releaseVersion: currentVersion, userId: 41 }]
    ]);
});
