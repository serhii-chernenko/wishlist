import { Effect } from 'effect';

import { getLatestReleaseVersion } from '../../bot/content/releases';
import { isSemverLower } from '../../bot/utils/semver';
import { createDb } from '../../db/client';
import { createRepositories } from '../../db/repositories';
import type { WorkerBindings } from '../env';
import type { ReleaseAnnouncementJob } from '../queues/release-announcement-job';

export const RELEASE_QUEUE_BATCH_LIMIT = 100;
export const STALE_ANNOUNCEMENT_AGE_MILLISECONDS = 3 * 60 * 60 * 1000;

export interface ReleaseBroadcastCandidate {
    id: number;
    releaseVersion: string;
}

export interface ReleaseBroadcastDependencies {
    getCurrentReleaseVersion: () => string;
    listCandidates: () => Promise<ReleaseBroadcastCandidate[]>;
    insertQueued: (
        releaseVersion: string,
        userIds: number[],
        now: Date
    ) => Promise<number[]>;
    deleteQueued: (releaseVersion: string, userIds: number[]) => Promise<void>;
    requeueStale: (
        releaseVersion: string,
        cutoff: Date,
        now: Date
    ) => Promise<number[]>;
    skipStuckSending: (
        releaseVersion: string,
        cutoff: Date,
        now: Date
    ) => Promise<number>;
    sendBatch: (jobs: ReleaseAnnouncementJob[]) => Promise<void>;
    now: () => Date;
    log: (entry: Record<string, unknown>) => void;
}

export interface ReleaseBroadcastSummary {
    releaseVersion: string;
    candidates: number;
    inserted: number;
    enqueued: number;
}

const chunk = <T>(items: readonly T[], size: number) => {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
};

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

export const createReleaseBroadcastDependencies = (
    env: WorkerBindings
): ReleaseBroadcastDependencies => {
    const repositories = createRepositories(createDb(env));
    const repository = repositories.releaseAnnouncements;
    const users = repositories.users;

    return {
        getCurrentReleaseVersion: getLatestReleaseVersion,
        listCandidates() {
            return Effect.runPromise(users.listBroadcastCandidates());
        },
        insertQueued(releaseVersion, userIds, now) {
            return Effect.runPromise(
                repository.insertQueuedAnnouncements(
                    releaseVersion,
                    userIds,
                    now
                )
            );
        },
        deleteQueued(releaseVersion, userIds) {
            return Effect.runPromise(
                repository.deleteQueuedAnnouncements(releaseVersion, userIds)
            );
        },
        requeueStale(releaseVersion, cutoff, now) {
            return Effect.runPromise(
                repository.requeueStaleQueued(releaseVersion, cutoff, now)
            );
        },
        skipStuckSending(releaseVersion, cutoff, now) {
            return Effect.runPromise(
                repository.skipStuckSending(releaseVersion, cutoff, now)
            );
        },
        async sendBatch(jobs) {
            await env.RELEASE_QUEUE.sendBatch(
                jobs.map(job => {
                    return { body: job };
                })
            );
        },
        now: () => new Date(),
        log: entry => console.log(JSON.stringify(entry))
    };
};

export const runReleaseBroadcast = async (
    env: WorkerBindings,
    dependencies: ReleaseBroadcastDependencies = createReleaseBroadcastDependencies(
        env
    )
): Promise<ReleaseBroadcastSummary | null> => {
    const baseLog = {
        botEnvironment: env.BOT_ENVIRONMENT
    };

    if (env.ENABLE_RELEASE_BROADCAST !== 'true') {
        dependencies.log({
            ...baseLog,
            event: 'release_broadcast_skipped',
            reason: 'disabled'
        });
        return null;
    }

    const releaseVersion = dependencies.getCurrentReleaseVersion();
    const staleCutoff = new Date(
        dependencies.now().getTime() - STALE_ANNOUNCEMENT_AGE_MILLISECONDS
    );
    const skippedStuck = await dependencies.skipStuckSending(
        releaseVersion,
        staleCutoff,
        dependencies.now()
    );
    const staleUserIds = await dependencies.requeueStale(
        releaseVersion,
        staleCutoff,
        dependencies.now()
    );

    for (const jobs of chunk(
        staleUserIds.map(userId => {
            return { releaseVersion, userId };
        }),
        RELEASE_QUEUE_BATCH_LIMIT
    )) {
        await dependencies.sendBatch(jobs);
    }

    if (skippedStuck > 0 || staleUserIds.length > 0) {
        dependencies.log({
            ...baseLog,
            event: 'release_broadcast_stale_recovered',
            releaseVersion,
            requeued: staleUserIds.length,
            skippedAmbiguous: skippedStuck
        });
    }

    const candidates = await dependencies.listCandidates();
    const outdatedUserIds = candidates
        .filter(candidate => {
            return isSemverLower(candidate.releaseVersion, releaseVersion);
        })
        .map(candidate => candidate.id);

    if (outdatedUserIds.length === 0) {
        dependencies.log({
            ...baseLog,
            event: 'release_broadcast_completed',
            releaseVersion,
            candidates: 0,
            inserted: 0,
            enqueued: 0
        });
        return { releaseVersion, candidates: 0, inserted: 0, enqueued: 0 };
    }

    const insertedUserIds = await dependencies.insertQueued(
        releaseVersion,
        outdatedUserIds,
        dependencies.now()
    );
    const jobChunks = chunk(
        insertedUserIds.map(userId => {
            return { releaseVersion, userId };
        }),
        RELEASE_QUEUE_BATCH_LIMIT
    );
    let enqueued = 0;

    for (const [chunkIndex, jobs] of jobChunks.entries()) {
        try {
            await dependencies.sendBatch(jobs);
            enqueued += jobs.length;
        } catch (error) {
            const unsentUserIds = jobChunks
                .slice(chunkIndex)
                .flat()
                .map(job => job.userId);

            await dependencies.deleteQueued(releaseVersion, unsentUserIds);
            dependencies.log({
                ...baseLog,
                event: 'release_broadcast_enqueue_failed',
                releaseVersion,
                inserted: insertedUserIds.length,
                enqueued,
                rolledBack: unsentUserIds.length,
                errorType: getErrorType(error)
            });
            throw error;
        }
    }

    const summary = {
        releaseVersion,
        candidates: outdatedUserIds.length,
        inserted: insertedUserIds.length,
        enqueued
    };

    dependencies.log({
        ...baseLog,
        event: 'release_broadcast_completed',
        ...summary
    });

    return summary;
};
