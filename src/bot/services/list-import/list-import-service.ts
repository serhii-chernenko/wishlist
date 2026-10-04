import { createTelegramApi, type TelegramApi } from '../../../api/telegram-api';
import {
    checkRateLimit,
    linkHostRateLimitKey,
    selectLinkHostLimiter
} from '../../../api/rate-limit';
import { createDb } from '../../../db/client';
import {
    createRepositories,
    type ListImportRecord
} from '../../../db/repositories';
import {
    LIST_IMPORT_FETCH_BUDGET_MS,
    LIST_IMPORT_KICK_BUDGET_MS,
    LIST_IMPORT_LEASE_MS,
    LIST_IMPORT_MAX_ATTEMPTS,
    LIST_IMPORT_PREVIEW_TTL_MS,
    LIST_IMPORT_PRUNE_AFTER_MS,
    type ListImportFailure,
    type ListImportPreviewDto,
    type ListImportStatusDto
} from '../../../shared/app-api';
import {
    hasSavedWishesNote,
    suggestListImportVisibility,
    type ParsedListUrl
} from '../../../shared/list-import-url';
import {
    emitTelemetryEvent,
    listImportCompletedEvent,
    listImportPhotosDrainedEvent,
    type ListImportCommitTrigger,
    type TelemetryContext,
    type TelemetryFields
} from '../../../worker/telemetry';
import type { WorkerBindings } from '../../../worker/env';
import { registrableDomain } from '../link-import/normalize-url';
import { createSafeFetcher as createDefaultSafeFetcher } from '../link-import/safe-fetch';
import type { CreateSafeFetcher } from '../link-import/types';
import {
    runCommitPass,
    toStatusDto,
    type CommitPorts,
    type CommitRunResult
} from './commit';
import { drainPendingPhotos } from './photos';
import { buildPlan } from './plan';
import { ADAPTERS } from './registry';
import { editResumedProgressMessage } from './resume-message';
import {
    createListImportStore,
    toPhotoDrainStore,
    type ListImportStore
} from './store';
import type {
    ListImportAdapters,
    ListImportDeps,
    ListImportJobGate,
    ListImportService,
    SourceFetchContext
} from './types';

export type ListImportTelemetryEmitter = (
    env: WorkerBindings,
    context: TelemetryContext,
    fields: TelemetryFields
) => void;

export interface ListImportServiceOptions {
    adapters?: ListImportAdapters;
    createSafeFetcher?: CreateSafeFetcher;
    createStore?: (env: WorkerBindings) => ListImportStore;
    emitTelemetry?: ListImportTelemetryEmitter;
    createFlowId?: () => string;
    createTelegram?: (env: WorkerBindings) => TelegramApi | undefined;
}

const RESUME_FAILURE: ListImportFailure = 'timeout';

const defaultStore = (env: WorkerBindings) => {
    return createListImportStore(createRepositories(createDb(env)));
};

const defaultTelegram = (env: WorkerBindings) => {
    return env.BOT_TOKEN
        ? createTelegramApi({ botToken: env.BOT_TOKEN })
        : undefined;
};

const defaultSleep = (milliseconds: number) => {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

const defaultFlowId = () => {
    return crypto.randomUUID();
};

const toTelemetryContext = (deps: ListImportDeps): TelemetryContext => {
    const { waitUntil } = deps;

    return waitUntil === undefined ? undefined : { waitUntil };
};

const failedPreview = (
    outcome: ListImportFailure,
    url: ParsedListUrl,
    counts: ListImportPreviewDto['counts'] = null
): ListImportPreviewDto => {
    return {
        outcome,
        jobId: null,
        kind: null,
        counts,
        suggestedVisibility: suggestListImportVisibility(url),
        savedWishesNote: hasSavedWishesNote(url)
    };
};

const isPreviewExpired = (job: ListImportRecord, now: number) => {
    return job.createdAt.getTime() + LIST_IMPORT_PREVIEW_TTL_MS <= now;
};

/**
 * Builds the list import service. Every call takes the Worker env, clock and
 * `waitUntil` through `ListImportDeps`, so one instance serves the whole
 * Worker. The service emits `list_import_completed` for every finished commit
 * (with the channel stored on the job) and `list_import_photos_drained` for
 * drain runs that did something; callers emit `list_import_previewed`.
 */
export const createListImportService = (
    options: ListImportServiceOptions = {}
): ListImportService => {
    const adapters = options.adapters ?? ADAPTERS;
    const createSafeFetcher =
        options.createSafeFetcher ?? createDefaultSafeFetcher;
    const createStore = options.createStore ?? defaultStore;
    const emitTelemetry = options.emitTelemetry ?? emitTelemetryEvent;
    const createFlowId = options.createFlowId ?? defaultFlowId;
    const createTelegram = options.createTelegram ?? defaultTelegram;

    const clock = (deps: ListImportDeps) => {
        return deps.now ?? Date.now;
    };

    const createHostGate = (deps: ListImportDeps) => {
        const decisions = new Map<string, Promise<boolean>>();
        const limiter = selectLinkHostLimiter(deps.env);

        return (host: string) => {
            const domain = registrableDomain(host);
            const known = decisions.get(domain);

            if (known !== undefined) {
                return known;
            }

            const decision = checkRateLimit(
                limiter,
                linkHostRateLimitKey(domain)
            ).then(outcome => {
                return outcome !== 'limited';
            });

            decisions.set(domain, decision);

            return decision;
        };
    };

    const createFetchContext = (deps: ListImportDeps): SourceFetchContext => {
        const now = clock(deps);

        return {
            fetcher: createSafeFetcher(deps.fetch),
            acquireHostToken: createHostGate(deps),
            createFlowId,
            now,
            deadlineAt: now() + LIST_IMPORT_FETCH_BUDGET_MS
        };
    };

    const toStatus = async (
        store: ListImportStore,
        job: ListImportRecord
    ): Promise<ListImportStatusDto> => {
        return toStatusDto(
            job,
            await store.wishes.countPendingPhotos(job.userId)
        );
    };

    const findLiveOwned = async (
        deps: ListImportDeps,
        store: ListImportStore,
        userId: number,
        jobId: number
    ) => {
        const job = await store.jobs.findOwned(jobId, userId);

        if (
            job === null ||
            job.state !== 'previewed' ||
            !isPreviewExpired(job, clock(deps)())
        ) {
            return job;
        }

        await store.jobs.expirePreview(job.id, new Date(clock(deps)()));

        return store.jobs.findOwned(jobId, userId);
    };

    const reportCompleted = (
        deps: ListImportDeps,
        job: ListImportRecord,
        trigger: ListImportCommitTrigger
    ) => {
        emitTelemetry(
            deps.env,
            toTelemetryContext(deps),
            listImportCompletedEvent({
                channel: job.channel,
                source: job.source,
                kind: job.kind,
                visibility: job.visibility,
                trigger,
                failure: job.state === 'failed' ? job.failure : null,
                created: job.created,
                gifted: job.createdGifted
            })
        );
    };

    const finishCommit = async (
        deps: ListImportDeps,
        store: ListImportStore,
        job: ListImportRecord,
        trigger: ListImportCommitTrigger
    ) => {
        const status = await toStatus(store, job);

        reportCompleted(deps, job, trigger);

        if (trigger === 'resume') {
            const user = await store.users.findById(job.userId);

            if (user !== null) {
                await editResumedProgressMessage(
                    deps.telegram ?? createTelegram(deps.env),
                    job,
                    user,
                    status
                );
            }
        }

        return status;
    };

    const toCommitStatus = async (
        deps: ListImportDeps,
        store: ListImportStore,
        result: CommitRunResult,
        trigger: ListImportCommitTrigger
    ) => {
        if (result.kind === 'lost') {
            return null;
        }

        return result.kind === 'finished'
            ? finishCommit(deps, store, result.job, trigger)
            : toStatus(store, result.job);
    };

    const service: ListImportService = {
        async preview(deps, request) {
            const store = createStore(deps.env);
            const adapter = adapters[request.url.source];

            if ((await store.jobs.findCommitting(request.userId)) !== null) {
                return failedPreview('busy', request.url);
            }

            const fetched = await adapter.fetchItems(
                createFetchContext(deps),
                request.url
            );

            if (!fetched.ok) {
                return failedPreview(fetched.outcome, request.url);
            }

            const [existing, activeCount] = await Promise.all([
                store.wishes.listDedupeKeys(request.userId),
                store.wishes.countActive(request.userId)
            ]);
            const plan = buildPlan(fetched.items, existing, activeCount);

            if (plan.items.length === 0) {
                return failedPreview(
                    plan.counts.overLimit > 0 ? 'limitReached' : 'empty',
                    request.url,
                    plan.counts
                );
            }

            const job = await store.jobs.createPreviewed(
                {
                    userId: request.userId,
                    source: request.url.source,
                    kind: fetched.kind,
                    channel: request.channel,
                    sourceUrl: request.url.url,
                    visibility: suggestListImportVisibility(request.url),
                    found: plan.counts.found,
                    planned: plan.items.length,
                    plannedGifted: plan.counts.gifted,
                    duplicates: plan.counts.duplicates,
                    overLimit: plan.counts.overLimit,
                    withoutPrice: plan.counts.withoutPrice,
                    withoutPhoto: plan.counts.withoutPhoto
                },
                new Date(clock(deps)())
            );

            if (job === null) {
                return failedPreview('upstream', request.url, plan.counts);
            }

            return {
                outcome: 'ok',
                jobId: job.id,
                kind: fetched.kind,
                counts: plan.counts,
                suggestedVisibility: suggestListImportVisibility(request.url),
                savedWishesNote: hasSavedWishesNote(request.url)
            };
        },
        async setVisibility(deps, request): Promise<ListImportJobGate> {
            const store = createStore(deps.env);
            const job = await findLiveOwned(
                deps,
                store,
                request.userId,
                request.jobId
            );

            if (job === null) {
                return 'notFound';
            }

            if (job.state !== 'previewed') {
                return 'expired';
            }

            const updated = await store.jobs.setVisibility(
                job.id,
                request.userId,
                request.visibility,
                new Date(clock(deps)())
            );

            return updated ? 'ok' : 'expired';
        },
        async startCommit(deps, request) {
            const store = createStore(deps.env);
            const job = await findLiveOwned(
                deps,
                store,
                request.userId,
                request.jobId
            );

            if (job === null) {
                return { ok: false, outcome: 'notFound' };
            }

            if (job.state !== 'previewed') {
                return { ok: false, outcome: 'expired' };
            }

            if ((await store.jobs.findCommitting(request.userId)) !== null) {
                return { ok: false, outcome: 'busy' };
            }

            const now = clock(deps)();
            const started = await store.jobs.startCommit({
                jobId: job.id,
                userId: request.userId,
                visibility: request.visibility,
                chatMessageId: request.chatMessageId,
                leaseUntil: new Date(now + LIST_IMPORT_LEASE_MS),
                now: new Date(now)
            });

            if (started.outcome === 'busy') {
                return { ok: false, outcome: 'busy' };
            }

            if (started.outcome === 'notPreviewed') {
                return { ok: false, outcome: 'expired' };
            }

            return { ok: true, status: await toStatus(store, started.job) };
        },
        async runCommit(deps, request) {
            const store = createStore(deps.env);
            const job = await store.jobs.findById(request.jobId);

            if (job === null || job.state !== 'committing') {
                return null;
            }

            const ports: CommitPorts = {
                store,
                adapter: adapters[job.source],
                createFetchContext: () => {
                    return createFetchContext(deps);
                },
                now: clock(deps)
            };
            let result: CommitRunResult;

            try {
                result = await runCommitPass(ports, job, request.onProgress);
            } catch {
                await store.jobs
                    .releaseCommitLease(job.id, new Date(clock(deps)()))
                    .catch(() => {
                        return false;
                    });

                return null;
            }

            return toCommitStatus(deps, store, result, request.trigger);
        },
        async status(deps, request) {
            const store = createStore(deps.env);
            const job = await findLiveOwned(
                deps,
                store,
                request.userId,
                request.jobId
            );

            return job === null ? null : toStatus(store, job);
        },
        async cancel(deps, request): Promise<ListImportJobGate> {
            const store = createStore(deps.env);
            const job = await findLiveOwned(
                deps,
                store,
                request.userId,
                request.jobId
            );

            if (job === null) {
                return 'notFound';
            }

            if (job.state !== 'previewed') {
                return 'expired';
            }

            const cancelled = await store.jobs.cancelPreview(
                job.id,
                request.userId,
                new Date(clock(deps)())
            );

            return cancelled ? 'ok' : 'expired';
        },
        async resumeStale(deps, request) {
            const store = createStore(deps.env);
            const now = clock(deps)();

            await store.jobs.expireStalePreviews(
                new Date(now - LIST_IMPORT_PREVIEW_TTL_MS),
                new Date(now)
            );

            const stale = await store.jobs.listStaleCommitting(
                new Date(now),
                request.userId
            );
            let resumed = 0;

            for (const job of stale) {
                if (job.attempts >= LIST_IMPORT_MAX_ATTEMPTS) {
                    const failed = await store.jobs.markFailed(
                        job.id,
                        RESUME_FAILURE,
                        new Date(clock(deps)())
                    );

                    if (failed !== null) {
                        await finishCommit(deps, store, failed, 'resume');
                    }

                    continue;
                }

                const claimed = await store.jobs.claimStale(
                    job.id,
                    new Date(clock(deps)()),
                    new Date(clock(deps)() + LIST_IMPORT_LEASE_MS)
                );

                if (claimed === null) {
                    continue;
                }

                resumed += 1;
                await service.runCommit(deps, {
                    jobId: claimed.id,
                    trigger: 'resume'
                });
            }

            return resumed;
        },
        async drainPhotos(deps, request) {
            const telegram = deps.telegram ?? createTelegram(deps.env);

            if (telegram === undefined) {
                return { result: 'idle', ingested: 0, failed: 0 };
            }

            const summary = await drainPendingPhotos(
                {
                    store: toPhotoDrainStore(createStore(deps.env)),
                    adapters,
                    fetcher: createSafeFetcher(deps.fetch),
                    telegram,
                    acquireHostToken: host => {
                        return createHostGate(deps)(host);
                    },
                    now: clock(deps),
                    sleep: deps.sleep ?? defaultSleep,
                    ...(deps.waitUntil === undefined
                        ? {}
                        : { waitUntil: deps.waitUntil })
                },
                {
                    budgetMs: request.budgetMs,
                    ...(request.userId === undefined
                        ? {}
                        : { userId: request.userId })
                }
            );

            if (summary.result !== 'idle' || request.trigger === 'cron') {
                emitTelemetry(
                    deps.env,
                    toTelemetryContext(deps),
                    listImportPhotosDrainedEvent({
                        trigger: request.trigger,
                        ...summary
                    })
                );
            }

            return summary;
        },
        async prune(deps) {
            const store = createStore(deps.env);

            return store.jobs.pruneFinishedBefore(
                new Date(clock(deps)() - LIST_IMPORT_PRUNE_AFTER_MS)
            );
        },
        async kick(deps, request) {
            await service.resumeStale(deps, request);
            await service.drainPhotos(deps, {
                budgetMs: LIST_IMPORT_KICK_BUDGET_MS,
                trigger: 'kick',
                ...(request.userId === undefined
                    ? {}
                    : { userId: request.userId })
            });
        }
    };

    return service;
};
