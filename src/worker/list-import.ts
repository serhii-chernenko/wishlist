import {
    createListImportService,
    type ListImportServiceOptions
} from '../bot/services/list-import/list-import-service';
import type {
    ListImportDeps,
    ListImportService
} from '../bot/services/list-import/types';
import {
    LIST_IMPORT_CRON_BUDGET_MS,
    LIST_IMPORT_LOAD_KICK_INTERVAL_MS
} from '../shared/app-api';
import { isListImportEnabled, type WorkerBindings } from './env';

/**
 * Builds the list import service from the production adapters, safe fetcher
 * and repositories. It holds no per-request state, so one instance serves the
 * Worker; the bot, the API and the scheduled tasks share it.
 */
export const createWorkerListImport = (
    options: ListImportServiceOptions = {}
): ListImportService => {
    return createListImportService(options);
};

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

const logFailure = (env: WorkerBindings, event: string, error: unknown) => {
    console.error(
        JSON.stringify({
            event,
            botEnvironment: env.BOT_ENVIRONMENT,
            errorType: getErrorType(error)
        })
    );
};

/**
 * Resumes stale commits and drains photos for one user (or everyone) within
 * the short kick budget, in the background. Callers kick after a commit, on
 * each app status poll and on the bot's Refresh button. With `throttled` the
 * drain keeps the user's lease for `LIST_IMPORT_LOAD_KICK_INTERVAL_MS`, which
 * is how list loads avoid draining more than once a minute per user. Nothing
 * runs while `WISHLIST_IMPORT_ENABLED` is off.
 */
export const kickListImport = (
    service: ListImportService | undefined,
    deps: ListImportDeps,
    userId?: number,
    options: { throttled?: boolean } = {}
) => {
    if (service === undefined || !isListImportEnabled(deps.env)) {
        return;
    }

    const task = service
        .kick(deps, {
            ...(userId === undefined ? {} : { userId }),
            ...(options.throttled === true
                ? { holdLeaseMs: LIST_IMPORT_LOAD_KICK_INTERVAL_MS }
                : {})
        })
        .catch(error => {
            logFailure(deps.env, 'list_import_kick_failed', error);
        });

    if (deps.waitUntil === undefined) {
        void task;
    } else {
        deps.waitUntil(task);
    }
};

/** The ten-minute cron step: resume every stale commit, then drain photos for up to five minutes. */
export const runListImportDrain = async (
    service: ListImportService,
    deps: ListImportDeps
) => {
    await service.resumeStale(deps, {});

    return service.drainPhotos(deps, {
        budgetMs: LIST_IMPORT_CRON_BUDGET_MS,
        trigger: 'cron'
    });
};
