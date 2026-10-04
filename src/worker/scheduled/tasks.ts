import { Effect } from 'effect';

import { createDb } from '../../db/client';
import { createRepositories } from '../../db/repositories';
import {
    telegramAbandonedUpdateRetentionMilliseconds,
    telegramUpdateRetentionMilliseconds
} from '../../db/repositories/telegram-update-repository';
import { createLinkImportCache } from '../../bot/services/link-import/result-cache';
import type {
    RatesRefreshFailureReason,
    RatesRefreshResult
} from '../../bot/services/exchange-rate-service';
import type {
    ListImportDeps,
    ListImportService
} from '../../bot/services/list-import/types';
import { isListImportEnabled, type WorkerBindings } from '../env';
import {
    emitRatesRefreshTelemetry,
    refreshStoredExchangeRates
} from '../exchange-rates';
import { runListImportDrain } from '../list-import';
import { emitTelemetryEvent } from '../telemetry';
import {
    readBotStateSnapshot,
    snapshotLocales,
    type BotStateSnapshot
} from './bot-state-snapshot';
import { runReleaseBroadcast } from './release-broadcast';

const TASKS = {
    prune: 'maintenance:prune',
    exchangeRates: 'rates:refresh',
    releaseBroadcast: 'release:broadcast',
    stateSnapshot: 'bot:state-snapshot',
    listImportDrain: 'import:drain',
    listImportPrune: 'import:prune'
} as const;

export const RELEASE_BROADCAST_CRON = '*/10 * * * *';
export const SESSION_RETENTION_MILLISECONDS = 90 * 24 * 60 * 60 * 1000;

const getScheduledTaskNames = (
    cron: string,
    listImportActive: boolean
): string[] => {
    if (cron === RELEASE_BROADCAST_CRON) {
        return [
            TASKS.releaseBroadcast,
            TASKS.stateSnapshot,
            ...(listImportActive ? [TASKS.listImportDrain] : [])
        ];
    }

    return [
        TASKS.exchangeRates,
        TASKS.prune,
        ...(listImportActive ? [TASKS.listImportPrune] : [])
    ];
};

interface ScheduledTaskDependencies {
    broadcastRelease?: (env: WorkerBindings) => Promise<unknown>;
    pruneProcessedTelegramUpdates?: (
        env: WorkerBindings,
        processedBefore: Date
    ) => Promise<number>;
    pruneAbandonedTelegramUpdates?: (
        env: WorkerBindings,
        startedBefore: Date
    ) => Promise<number>;
    pruneSessions?: (
        env: WorkerBindings,
        updatedBefore: Date
    ) => Promise<number>;
    readBotStateSnapshot?: (
        env: WorkerBindings,
        asOf: Date
    ) => Promise<BotStateSnapshot>;
    refreshExchangeRates?: (env: WorkerBindings) => Promise<RatesRefreshResult>;
    purgeLinkImportCache?: (
        env: WorkerBindings,
        now: number
    ) => Promise<number>;
    listImport?: ListImportService;
}

export interface ScheduledTasksSummary {
    taskNames: string[];
    prunedProcessedTelegramUpdates: number;
    prunedAbandonedTelegramUpdates: number;
    prunedSessions: number;
}

const isReleaseBroadcastSummary = (
    value: unknown
): value is {
    releaseVersion: string;
    candidates: number;
    inserted: number;
    enqueued: number;
} => {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>).releaseVersion === 'string' &&
        typeof (value as Record<string, unknown>).candidates === 'number' &&
        typeof (value as Record<string, unknown>).inserted === 'number' &&
        typeof (value as Record<string, unknown>).enqueued === 'number'
    );
};

const pruneProcessedTelegramUpdates = (
    env: WorkerBindings,
    processedBefore: Date
) => {
    const repository = createRepositories(createDb(env)).telegramUpdates;

    return Effect.runPromise(repository.deleteProcessedBefore(processedBefore));
};

const pruneAbandonedTelegramUpdates = (
    env: WorkerBindings,
    startedBefore: Date
) => {
    const repository = createRepositories(createDb(env)).telegramUpdates;

    return Effect.runPromise(
        repository.deleteAbandonedProcessingBefore(startedBefore)
    );
};

const pruneSessions = (env: WorkerBindings, updatedBefore: Date) => {
    const repository = createRepositories(createDb(env)).sessions;

    return Effect.runPromise(repository.pruneUpdatedBefore(updatedBefore));
};

const purgeLinkImportCache = (env: WorkerBindings, now: number) => {
    return createLinkImportCache(env.IMAGES).purgeExpired(now);
};

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

const runLinkImportPurge = async (
    controller: ScheduledController,
    env: WorkerBindings,
    purge: (env: WorkerBindings, now: number) => Promise<number>
) => {
    try {
        const purgedLinkImportObjects = await purge(env, Date.now());

        console.log(
            JSON.stringify({
                event: 'link_import_cache_purged',
                botEnvironment: env.BOT_ENVIRONMENT,
                cron: controller.cron,
                purgedLinkImportObjects
            })
        );
    } catch (error) {
        console.error(
            JSON.stringify({
                event: 'link_import_cache_purge_failed',
                botEnvironment: env.BOT_ENVIRONMENT,
                cron: controller.cron,
                errorType: getErrorType(error)
            })
        );
    }
};

const toListImportDeps = (
    env: WorkerBindings,
    ctx: ExecutionContext
): ListImportDeps => {
    return typeof ctx.waitUntil === 'function'
        ? {
              env,
              waitUntil: (promise: Promise<unknown>) => {
                  ctx.waitUntil(promise);
              }
          }
        : { env };
};

const runListImportTask = async (
    controller: ScheduledController,
    env: WorkerBindings,
    failureEvent: string,
    task: () => Promise<unknown>
) => {
    try {
        await task();
    } catch (error) {
        console.error(
            JSON.stringify({
                event: failureEvent,
                botEnvironment: env.BOT_ENVIRONMENT,
                cron: controller.cron,
                errorType: getErrorType(error)
            })
        );
    }
};

const runListImportTasks = async (
    controller: ScheduledController,
    env: WorkerBindings,
    ctx: ExecutionContext,
    service: ListImportService,
    taskNames: readonly string[]
) => {
    const deps = toListImportDeps(env, ctx);

    if (taskNames.includes(TASKS.listImportDrain)) {
        await runListImportTask(
            controller,
            env,
            'list_import_drain_failed',
            () => {
                return runListImportDrain(service, deps);
            }
        );
    }

    if (taskNames.includes(TASKS.listImportPrune)) {
        await runListImportTask(
            controller,
            env,
            'list_import_prune_failed',
            async () => {
                const prunedListImports = await service.prune(deps);

                console.log(
                    JSON.stringify({
                        event: 'list_imports_pruned',
                        botEnvironment: env.BOT_ENVIRONMENT,
                        cron: controller.cron,
                        prunedListImports
                    })
                );
            }
        );
    }
};

export const runScheduledTasks = async (
    controller: ScheduledController,
    env: WorkerBindings,
    ctx: ExecutionContext,
    dependencies: ScheduledTaskDependencies = {}
) => {
    const listImport = isListImportEnabled(env)
        ? dependencies.listImport
        : undefined;
    const taskNames = getScheduledTaskNames(
        controller.cron,
        listImport !== undefined
    );
    let prunedProcessedTelegramUpdates = 0;
    let prunedAbandonedTelegramUpdates = 0;
    let prunedSessions = 0;

    if (
        env.BOT_ENVIRONMENT === 'production' &&
        taskNames.includes(TASKS.stateSnapshot)
    ) {
        const asOf = new Date(controller.scheduledTime);

        try {
            const { languageCounts, ...counters } = await (
                dependencies.readBotStateSnapshot ?? readBotStateSnapshot
            )(env, asOf);

            emitTelemetryEvent(env, ctx, {
                event: 'bot_state_snapshot',
                cron: controller.cron,
                outcome: 'success',
                ...counters
            });
            for (const locale of snapshotLocales) {
                emitTelemetryEvent(env, ctx, {
                    event: 'user_language_count',
                    locale,
                    languageCount: languageCounts[locale],
                    outcome: 'success'
                });
            }
        } catch (error) {
            emitTelemetryEvent(env, ctx, {
                event: 'bot_state_snapshot_failed',
                cron: controller.cron,
                outcome: 'error',
                errorType: getErrorType(error)
            });
        }
    }

    if (taskNames.includes(TASKS.releaseBroadcast)) {
        const broadcastRelease =
            dependencies.broadcastRelease ?? runReleaseBroadcast;

        try {
            const summary = await broadcastRelease(env);

            if (isReleaseBroadcastSummary(summary)) {
                emitTelemetryEvent(env, ctx, {
                    event: 'release_broadcast_completed',
                    cron: controller.cron,
                    outcome: 'success',
                    releaseVersion: summary.releaseVersion,
                    candidates: summary.candidates,
                    inserted: summary.inserted,
                    enqueued: summary.enqueued
                });
            }
        } catch (error) {
            emitTelemetryEvent(env, ctx, {
                event: 'release_broadcast_failed',
                cron: controller.cron,
                outcome: 'error',
                errorType: getErrorType(error)
            });
            console.error(
                JSON.stringify({
                    event: 'release_broadcast_failed',
                    botEnvironment: env.BOT_ENVIRONMENT,
                    cron: controller.cron,
                    errorType: getErrorType(error)
                })
            );
            throw error;
        }
    }

    if (
        env.BOT_ENVIRONMENT === 'production' &&
        taskNames.includes(TASKS.exchangeRates)
    ) {
        const refreshRates =
            dependencies.refreshExchangeRates ?? refreshStoredExchangeRates;

        try {
            emitRatesRefreshTelemetry(
                env,
                ctx,
                'cron',
                await refreshRates(env)
            );
        } catch (error) {
            emitTelemetryEvent(env, ctx, {
                event: 'exchange_rates_refresh',
                trigger: 'cron',
                outcome: 'failed',
                reason: 'unexpected' satisfies RatesRefreshFailureReason,
                errorType: getErrorType(error)
            });
        }
    }

    if (taskNames.includes(TASKS.prune)) {
        await runLinkImportPurge(
            controller,
            env,
            dependencies.purgeLinkImportCache ?? purgeLinkImportCache
        );
    }

    if (
        env.BOT_ENVIRONMENT === 'production' &&
        taskNames.includes(TASKS.prune)
    ) {
        const pruneExpiredSessions =
            dependencies.pruneSessions ?? pruneSessions;
        const pruneProcessed =
            dependencies.pruneProcessedTelegramUpdates ??
            pruneProcessedTelegramUpdates;
        const pruneAbandoned =
            dependencies.pruneAbandonedTelegramUpdates ??
            pruneAbandonedTelegramUpdates;

        try {
            prunedSessions = await pruneExpiredSessions(
                env,
                new Date(Date.now() - SESSION_RETENTION_MILLISECONDS)
            );

            console.log(
                JSON.stringify({
                    event: 'sessions_pruned',
                    botEnvironment: env.BOT_ENVIRONMENT,
                    cron: controller.cron,
                    prunedSessions
                })
            );
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: 'sessions_prune_failed',
                    botEnvironment: env.BOT_ENVIRONMENT,
                    cron: controller.cron,
                    errorType: getErrorType(error)
                })
            );
        }

        try {
            prunedProcessedTelegramUpdates = await pruneProcessed(
                env,
                new Date(Date.now() - telegramUpdateRetentionMilliseconds)
            );
            prunedAbandonedTelegramUpdates = await pruneAbandoned(
                env,
                new Date(
                    Date.now() - telegramAbandonedUpdateRetentionMilliseconds
                )
            );

            console.log(
                JSON.stringify({
                    event: 'telegram_update_ledger_pruned',
                    botEnvironment: env.BOT_ENVIRONMENT,
                    cron: controller.cron,
                    prunedAbandonedTelegramUpdates,
                    prunedProcessedTelegramUpdates
                })
            );
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: 'telegram_update_ledger_prune_failed',
                    botEnvironment: env.BOT_ENVIRONMENT,
                    cron: controller.cron,
                    errorType: getErrorType(error)
                })
            );
            throw error;
        }
    }

    if (listImport !== undefined) {
        await runListImportTasks(controller, env, ctx, listImport, taskNames);
    }

    console.log(
        JSON.stringify({
            event: 'scheduled_worker_invoked',
            botEnvironment: env.BOT_ENVIRONMENT,
            cron: controller.cron,
            scheduledTime: controller.scheduledTime,
            taskNames
        })
    );

    return {
        taskNames,
        prunedProcessedTelegramUpdates,
        prunedAbandonedTelegramUpdates,
        prunedSessions
    } satisfies ScheduledTasksSummary;
};
