import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getLatestReleaseVersion } from '../../src/bot/content/releases';
import { processReleaseAnnouncementBatch } from '../../src/worker/queues/release-announcements';
import type { ReleaseAnnouncementMessage } from '../../src/worker/queues/release-announcements';
import { createReleaseAnnouncementDependencies } from '../../src/worker/queues/release-announcements-handler';
import type { ReleaseAnnouncementJob } from '../../src/worker/queues/release-announcement-job';
import {
    createReleaseBroadcastDependencies,
    runReleaseBroadcast
} from '../../src/worker/scheduled/release-broadcast';
import {
    countRows,
    createD1Harness,
    createWorkerEnv,
    type D1Harness
} from './d1-harness';

const currentVersion = getLatestReleaseVersion();
const outdatedUserCount = 230;
const outdatedVersion = '0.1.0';

interface AnnouncementRow {
    status: string;
    attempts: number;
    lastErrorCode: number | null;
}

describe('Release announcements on D1', () => {
    let harness: D1Harness;

    const seedUsers = (
        count: number,
        releaseVersion: string,
        firstTelegramId = 1000
    ) => {
        return harness.env.DB.prepare(
            `INSERT INTO users (telegram_id, language, telegram_language_code, release_version, created_at, updated_at)
            WITH RECURSIVE sequence(n) AS (
                SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < ?
            )
            SELECT ? + n, CASE WHEN n % 2 = 0 THEN 'en' ELSE NULL END, CASE WHEN n % 2 = 0 THEN NULL ELSE 'uk' END, ?, 0, 0 FROM sequence`
        )
            .bind(count, firstTelegramId, releaseVersion)
            .run();
    };
    const readAnnouncement = (userId: number) => {
        return harness.env.DB.prepare(
            'SELECT status, attempts, last_error_code AS lastErrorCode FROM release_announcements WHERE user_id = ? AND release_version = ?'
        )
            .bind(userId, currentVersion)
            .first<AnnouncementRow>();
    };
    const readUser = (userId: number) => {
        return harness.env.DB.prepare(
            'SELECT release_version AS releaseVersion, language, blocked_at AS blockedAt FROM users WHERE id = ?'
        )
            .bind(userId)
            .first<{
                releaseVersion: string;
                language: string | null;
                blockedAt: number | null;
            }>();
    };
    const runProducer = (batches: ReleaseAnnouncementJob[][]) => {
        const env = createWorkerEnv(harness, {
            ENABLE_RELEASE_BROADCAST: 'true'
        });

        return runReleaseBroadcast(env, {
            ...createReleaseBroadcastDependencies(env),
            async sendBatch(jobs) {
                batches.push(jobs);
            },
            log: () => undefined
        });
    };
    const createMessage = (
        userId: number,
        attempts = 1
    ): ReleaseAnnouncementMessage => {
        return {
            body: { releaseVersion: currentVersion, userId },
            attempts,
            ack() {},
            retry() {}
        };
    };
    const runConsumer = (
        message: ReleaseAnnouncementMessage,
        sendMessage: (telegramId: number, html: string) => Promise<void>,
        requeueJob: (
            job: ReleaseAnnouncementJob,
            delaySeconds: number
        ) => Promise<void> = async () => undefined
    ) => {
        const env = createWorkerEnv(harness, {
            BOT_TOKEN: '123456:test',
            ENABLE_RELEASE_BROADCAST: 'true'
        });

        return processReleaseAnnouncementBatch([message], {
            ...createReleaseAnnouncementDependencies(env),
            sendMessage,
            requeueJob,
            log: () => undefined
        });
    };
    const findUserId = async (telegramId: number) => {
        const row = await harness.env.DB.prepare(
            'SELECT id FROM users WHERE telegram_id = ?'
        )
            .bind(telegramId)
            .first<{ id: number }>();

        return row?.id as number;
    };
    const telegramError = (
        code: number,
        parameters?: { retry_after?: number }
    ) => {
        return Object.assign(new Error(`Telegram ${code}`), {
            response: { error_code: code, parameters }
        });
    };
    const forceStatus = (userId: number, status: string, updatedAt: number) => {
        return harness.env.DB.prepare(
            'UPDATE release_announcements SET status = ?, updated_at = ? WHERE user_id = ? AND release_version = ?'
        )
            .bind(status, updatedAt, userId, currentVersion)
            .run();
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        await harness.clearApplicationTables();
    });

    it('enforces status values, uniqueness and user cascade deletes', async () => {
        const { DB } = harness.env;

        await seedUsers(1, outdatedVersion);
        const userId = await findUserId(1001);
        const insert = (status: string) => {
            return DB.prepare(
                "INSERT INTO release_announcements (release_version, user_id, status, attempts, created_at, updated_at) VALUES ('2.0.0', ?, ?, 0, 0, 0)"
            )
                .bind(userId, status)
                .run();
        };

        await assert.rejects(insert('bogus'), /CHECK/);
        await insert('sending');
        await DB.prepare('DELETE FROM release_announcements').run();
        await insert('queued');
        await assert.rejects(insert('queued'), /UNIQUE/);
        assert.equal(await countRows(harness, 'release_announcements'), 1);

        await DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

        assert.equal(await countRows(harness, 'release_announcements'), 0);
    });

    it('queues each outdated user once across chunked inserts and repeated runs', async () => {
        await seedUsers(outdatedUserCount, outdatedVersion);
        await seedUsers(10, currentVersion, 5000);
        await seedUsers(3, 'garbage', 6000);

        const firstBatches: ReleaseAnnouncementJob[][] = [];
        const first = await runProducer(firstBatches);
        const secondBatches: ReleaseAnnouncementJob[][] = [];
        const second = await runProducer(secondBatches);
        const expected = outdatedUserCount + 3;

        assert.equal(first?.inserted, expected);
        assert.equal(first?.enqueued, expected);
        assert.deepEqual(
            firstBatches.map(batch => batch.length),
            [100, 100, 33]
        );
        assert.equal(
            await countRows(harness, 'release_announcements'),
            expected
        );
        assert.equal(second?.enqueued, 0);
        assert.deepEqual(secondBatches, []);
        assert.equal(
            await countRows(harness, 'release_announcements'),
            expected
        );
    });

    it('does not broadcast to blocked users', async () => {
        await seedUsers(3, outdatedVersion);
        await harness.env.DB.prepare(
            'UPDATE users SET blocked_at = 1 WHERE telegram_id = 1002'
        ).run();

        const batches: ReleaseAnnouncementJob[][] = [];
        const summary = await runProducer(batches);
        const blockedId = await findUserId(1002);

        assert.equal(summary?.enqueued, 2);
        assert.equal(
            batches.flat().some(job => job.userId === blockedId),
            false
        );
        assert.equal(await readAnnouncement(blockedId), null);
        assert.equal(await countRows(harness, 'release_announcements'), 2);
    });

    it('skips a user blocked after being enqueued when the consumer runs', async () => {
        await seedUsers(2, outdatedVersion);
        await runProducer([]);

        const blockedId = await findUserId(1001);
        const activeId = await findUserId(1002);
        const delivered: number[] = [];

        await harness.env.DB.prepare(
            'UPDATE users SET blocked_at = 1 WHERE id = ?'
        )
            .bind(blockedId)
            .run();

        for (const userId of [blockedId, activeId]) {
            await runConsumer(createMessage(userId), async telegramId => {
                delivered.push(telegramId);
            });
        }

        assert.deepEqual(delivered, [1002]);
        assert.equal((await readAnnouncement(blockedId))?.status, 'skipped');
        assert.equal((await readAnnouncement(activeId))?.status, 'sent');
        assert.equal(
            (await readUser(blockedId))?.releaseVersion,
            currentVersion
        );
    });

    it('never enqueues a user twice when crons overlap', async () => {
        await seedUsers(120, outdatedVersion);

        const batches: ReleaseAnnouncementJob[][] = [];

        await Promise.all([runProducer(batches), runProducer(batches)]);

        const userIds = batches.flat().map(job => job.userId);

        assert.equal(userIds.length, 120);
        assert.equal(new Set(userIds).size, 120);
        assert.equal(await countRows(harness, 'release_announcements'), 120);
    });

    it('rolls queued rows back when the queue rejects so the next run retries', async () => {
        await seedUsers(5, outdatedVersion);

        const env = createWorkerEnv(harness, {
            ENABLE_RELEASE_BROADCAST: 'true'
        });

        await assert.rejects(
            runReleaseBroadcast(env, {
                ...createReleaseBroadcastDependencies(env),
                async sendBatch() {
                    throw new Error('queue down');
                },
                log: () => undefined
            }),
            /queue down/
        );
        assert.equal(await countRows(harness, 'release_announcements'), 0);

        const batches: ReleaseAnnouncementJob[][] = [];

        assert.equal((await runProducer(batches))?.enqueued, 5);
    });

    it('moves rows through sent, blocked, retry and ambiguous states', async () => {
        await seedUsers(4, outdatedVersion);
        await runProducer([]);

        const sentId = await findUserId(1001);
        const blockedId = await findUserId(1002);
        const limitedId = await findUserId(1003);
        const brokenId = await findUserId(1004);

        await runConsumer(createMessage(sentId), async () => undefined);
        await runConsumer(createMessage(blockedId), async () => {
            throw telegramError(403);
        });
        const requeued: [ReleaseAnnouncementJob, number][] = [];

        await runConsumer(
            createMessage(limitedId),
            async () => {
                throw telegramError(429, { retry_after: 7 });
            },
            async (job, delaySeconds) => {
                requeued.push([job, delaySeconds]);
            }
        );
        await runConsumer(createMessage(brokenId, 6), async () => {
            throw telegramError(500);
        });

        assert.deepEqual(await readAnnouncement(sentId), {
            status: 'sent',
            attempts: 1,
            lastErrorCode: null
        });
        assert.equal((await readUser(sentId))?.releaseVersion, currentVersion);
        assert.equal((await readUser(sentId))?.blockedAt, null);

        assert.deepEqual(await readAnnouncement(blockedId), {
            status: 'skipped',
            attempts: 1,
            lastErrorCode: 403
        });
        assert.equal(
            (await readUser(blockedId))?.releaseVersion,
            currentVersion
        );
        assert.notEqual((await readUser(blockedId))?.blockedAt, null);

        assert.deepEqual(requeued, [
            [{ releaseVersion: currentVersion, userId: limitedId }, 8]
        ]);
        assert.deepEqual(await readAnnouncement(limitedId), {
            status: 'queued',
            attempts: 0,
            lastErrorCode: 429
        });
        assert.equal(
            (await readUser(limitedId))?.releaseVersion,
            outdatedVersion
        );

        assert.deepEqual(await readAnnouncement(brokenId), {
            status: 'skipped',
            attempts: 1,
            lastErrorCode: 500
        });
        assert.equal(
            (await readUser(brokenId))?.releaseVersion,
            currentVersion
        );
        assert.equal(await countRows(harness, 'users'), 4);
    });

    it('renders the announcement in the stored or Telegram-derived locale and ignores duplicates', async () => {
        await seedUsers(2, outdatedVersion);
        await runProducer([]);

        const autoUkrainianId = await findUserId(1001);
        const englishId = await findUserId(1002);
        const delivered = new Map<number, string[]>();
        const send = async (telegramId: number, html: string) => {
            delivered.set(telegramId, [
                ...(delivered.get(telegramId) ?? []),
                html
            ]);
        };

        await runConsumer(createMessage(autoUkrainianId), send);
        await runConsumer(createMessage(englishId), send);
        await runConsumer(createMessage(englishId), send);

        assert.equal(delivered.get(1002)?.length, 1);
        assert.equal(delivered.get(1001)?.length, 1);
        assert.notEqual(delivered.get(1001)?.[0], delivered.get(1002)?.[0]);
        assert.match(
            delivered.get(1002)?.[0] ?? '',
            new RegExp(currentVersion)
        );
        assert.deepEqual(await readAnnouncement(englishId), {
            status: 'sent',
            attempts: 1,
            lastErrorCode: null
        });
    });

    it('uses the Telegram language code for Auto users and the stored language otherwise', async () => {
        await harness.env.DB.prepare(
            `INSERT INTO users (telegram_id, language, telegram_language_code, release_version, created_at, updated_at)
            VALUES (2001, NULL, 'pl', ?1, 0, 0),
                   (2002, NULL, 'de', ?1, 0, 0),
                   (2003, 'uk', 'pl', ?1, 0, 0),
                   (2004, NULL, NULL, ?1, 0, 0)`
        )
            .bind(outdatedVersion)
            .run();
        await runProducer([]);

        const delivered = new Map<number, string>();

        for (const telegramId of [2001, 2002, 2003, 2004]) {
            await runConsumer(
                createMessage(await findUserId(telegramId)),
                async (target, html) => {
                    delivered.set(target, html);
                }
            );
        }

        assert.notEqual(delivered.get(2001), delivered.get(2002));
        assert.notEqual(delivered.get(2001), delivered.get(2003));
        assert.notEqual(delivered.get(2002), delivered.get(2003));
        assert.equal(delivered.get(2003), delivered.get(2004));
    });

    it('does not enqueue again after every user reached the version', async () => {
        await seedUsers(3, outdatedVersion);
        await runProducer([]);

        for (const telegramId of [1001, 1002, 1003]) {
            await runConsumer(
                createMessage(await findUserId(telegramId)),
                async () => undefined
            );
        }

        const batches: ReleaseAnnouncementJob[][] = [];

        assert.equal((await runProducer(batches))?.candidates, 0);
        assert.deepEqual(batches, []);
    });

    it('claims a queued row exactly once and refuses a second sender', async () => {
        await seedUsers(1, outdatedVersion);
        await runProducer([]);

        const userId = await findUserId(1001);
        const delivered: string[] = [];
        const env = createWorkerEnv(harness, {
            BOT_TOKEN: '123456:test',
            ENABLE_RELEASE_BROADCAST: 'true'
        });
        const dependencies = createReleaseAnnouncementDependencies(env);
        const announcement = await dependencies.findAnnouncement(
            currentVersion,
            userId
        );
        const first = await dependencies.claimForSending(
            announcement?.id as number,
            new Date()
        );
        const second = await dependencies.claimForSending(
            announcement?.id as number,
            new Date()
        );

        assert.equal(first, true);
        assert.equal(second, false);
        assert.equal((await readAnnouncement(userId))?.status, 'sending');

        await runConsumer(createMessage(userId), async (_telegramId, html) => {
            delivered.push(html);
        });

        assert.deepEqual(delivered, []);
        assert.deepEqual(await readAnnouncement(userId), {
            status: 'skipped',
            attempts: 1,
            lastErrorCode: null
        });
        assert.equal((await readUser(userId))?.releaseVersion, currentVersion);
    });

    it('treats a network failure as ambiguous and never resends', async () => {
        await seedUsers(1, outdatedVersion);
        await runProducer([]);

        const userId = await findUserId(1001);
        let sends = 0;
        const send = async () => {
            sends += 1;
            throw new TypeError('fetch failed');
        };

        await runConsumer(createMessage(userId), send);
        await runConsumer(createMessage(userId), send);

        assert.equal(sends, 1);
        assert.deepEqual(await readAnnouncement(userId), {
            status: 'skipped',
            attempts: 1,
            lastErrorCode: null
        });
    });

    it('fails an unclassified 400 without bumping the user version', async () => {
        await seedUsers(1, outdatedVersion);
        await runProducer([]);

        const userId = await findUserId(1001);

        await runConsumer(createMessage(userId), async () => {
            throw telegramError(400);
        });

        assert.equal((await readAnnouncement(userId))?.status, 'failed');
        assert.equal((await readUser(userId))?.releaseVersion, outdatedVersion);
        assert.equal((await readUser(userId))?.blockedAt, null);
    });

    it('re-enqueues stale queued rows and skips stuck sending rows', async () => {
        await seedUsers(3, outdatedVersion);
        await runProducer([]);

        const staleId = await findUserId(1001);
        const freshId = await findUserId(1002);
        const stuckId = await findUserId(1003);
        const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;

        await forceStatus(staleId, 'queued', fourHoursAgo);
        await forceStatus(stuckId, 'sending', fourHoursAgo);

        const batches: ReleaseAnnouncementJob[][] = [];

        await runProducer(batches);

        assert.deepEqual(batches, [
            [{ releaseVersion: currentVersion, userId: staleId }]
        ]);
        assert.equal((await readAnnouncement(staleId))?.status, 'queued');
        assert.equal((await readAnnouncement(freshId))?.status, 'queued');
        assert.deepEqual(await readAnnouncement(stuckId), {
            status: 'skipped',
            attempts: 1,
            lastErrorCode: null
        });
        assert.equal((await readUser(stuckId))?.releaseVersion, currentVersion);

        const secondBatches: ReleaseAnnouncementJob[][] = [];

        await runProducer(secondBatches);

        assert.deepEqual(secondBatches, []);
    });
});
