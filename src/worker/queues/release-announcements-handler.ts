import { Effect } from 'effect';
import { Telegram } from 'telegraf';

import { getLatestReleaseVersion } from '../../bot/content/releases';
import { getReleaseMedia } from '../../bot/content/release-media';
import { createDb } from '../../db/client';
import { createRepositories } from '../../db/repositories';
import type { WorkerBindings } from '../env';
import {
    createReleaseAnnouncementSender,
    renderReleaseAnnouncementText
} from './release-announcement-delivery';
import type { ReleaseAnnouncementJob } from './release-announcement-job';
import {
    processReleaseAnnouncementBatch,
    type ReleaseAnnouncementConsumerDependencies
} from './release-announcements';
import { emitTelemetryEvent } from '../telemetry';

const releaseAnnouncementTelemetryFields = (entry: Record<string, unknown>) => {
    return {
        event:
            typeof entry.event === 'string'
                ? entry.event
                : 'release_announcement_event',
        ...(typeof entry.releaseVersion === 'string'
            ? { releaseVersion: entry.releaseVersion }
            : {}),
        ...(typeof entry.errorCode === 'number'
            ? { errorCode: entry.errorCode }
            : {}),
        ...(typeof entry.delaySeconds === 'number'
            ? { delaySeconds: entry.delaySeconds }
            : {}),
        ...(typeof entry.attempts === 'number'
            ? { attempts: entry.attempts }
            : {}),
        ...(typeof entry.errorType === 'string'
            ? { errorType: entry.errorType }
            : {}),
        ...(typeof entry.reason === 'string' ? { reason: entry.reason } : {}),
        ...(typeof entry.outcome === 'string' ? { outcome: entry.outcome } : {})
    };
};

export const createReleaseAnnouncementDependencies = (
    env: WorkerBindings,
    context?: ExecutionContext
): ReleaseAnnouncementConsumerDependencies => {
    const repositories = createRepositories(createDb(env));
    const sender = createReleaseAnnouncementSender(new Telegram(env.BOT_TOKEN));

    return {
        isBroadcastEnabled: () => env.ENABLE_RELEASE_BROADCAST === 'true',
        getCurrentReleaseVersion: getLatestReleaseVersion,
        findAnnouncement(releaseVersion, userId) {
            return Effect.runPromise(
                repositories.releaseAnnouncements.findAnnouncement(
                    releaseVersion,
                    userId
                )
            );
        },
        findUser(userId) {
            return Effect.runPromise(repositories.users.findById(userId));
        },
        renderAnnouncement: renderReleaseAnnouncementText,
        getReleaseMedia,
        async claimForSending(announcementId, now) {
            return Effect.runPromise(
                repositories.releaseAnnouncements.claimForSending(
                    announcementId,
                    now
                )
            );
        },
        sendMediaGroup: sender.sendMediaGroup,
        sendMessage: sender.sendMessage,
        async markMediaSent(announcementId, now) {
            await Effect.runPromise(
                repositories.releaseAnnouncements.markMediaSent(
                    announcementId,
                    now
                )
            );
        },
        async markBlocked(telegramId, now) {
            await Effect.runPromise(
                repositories.users.markBlockedByTelegramId(telegramId, now)
            );
        },
        async markSent(announcementId, userId, releaseVersion, now) {
            await Effect.runPromise(
                repositories.releaseAnnouncements.markSent(
                    announcementId,
                    userId,
                    releaseVersion,
                    now
                )
            );
        },
        async markSkipped(
            announcementId,
            userId,
            releaseVersion,
            errorCode,
            now
        ) {
            await Effect.runPromise(
                repositories.releaseAnnouncements.markSkipped(
                    announcementId,
                    userId,
                    releaseVersion,
                    errorCode,
                    now
                )
            );
        },
        async releaseToQueue(announcementId, errorCode, countAttempt, now) {
            await Effect.runPromise(
                repositories.releaseAnnouncements.releaseToQueue(
                    announcementId,
                    errorCode,
                    countAttempt,
                    now
                )
            );
        },
        async markFailed(announcementId, errorCode, now) {
            await Effect.runPromise(
                repositories.releaseAnnouncements.markFailed(
                    announcementId,
                    errorCode,
                    now
                )
            );
        },
        async requeueJob(job, delaySeconds) {
            await env.RELEASE_QUEUE.send(job, { delaySeconds });
        },
        sleep(milliseconds) {
            return new Promise(resolve => {
                setTimeout(resolve, milliseconds);
            });
        },
        now: () => Date.now(),
        log: entry => {
            emitTelemetryEvent(
                env,
                context,
                releaseAnnouncementTelemetryFields(entry)
            );
        }
    };
};

export const handleReleaseAnnouncementQueue = (
    batch: MessageBatch<ReleaseAnnouncementJob>,
    env: WorkerBindings,
    context?: ExecutionContext
) => {
    return processReleaseAnnouncementBatch(
        batch.messages,
        createReleaseAnnouncementDependencies(env, context)
    );
};
