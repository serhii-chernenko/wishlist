import type {
    ImportedWishRow,
    ListImportRecord
} from '../../../db/repositories';
import {
    LIST_IMPORT_INSERT_ROWS_PER_STATEMENT,
    LIST_IMPORT_INSERT_STATEMENTS_PER_BATCH,
    LIST_IMPORT_LEASE_MS,
    LIST_IMPORT_MAX_ATTEMPTS,
    type ListImportFailure,
    type ListImportStatusDto,
    type ListImportVisibility
} from '../../../shared/app-api';
import { parseListImportUrl } from '../../../shared/list-import-url';
import { isCurrency, type Currency } from '../../../shared/money';
import { chunk } from '../../../db/repositories/chunk';
import { buildPlan } from './plan';
import type { ListImportStore } from './store';
import type {
    ListImportProgressHandler,
    ListImportSourceAdapter,
    SourceFetchContext,
    SourceItem
} from './types';

export const LIST_IMPORT_ROWS_PER_STEP =
    LIST_IMPORT_INSERT_ROWS_PER_STATEMENT *
    LIST_IMPORT_INSERT_STATEMENTS_PER_BATCH;

const FALLBACK_CURRENCY: Currency = 'UAH';

const TRANSIENT_FAILURES: ReadonlySet<ListImportFailure> = new Set([
    'timeout',
    'upstream',
    'rateLimited'
]);

export interface CommitPorts {
    store: ListImportStore;
    adapter: ListImportSourceAdapter;
    createFetchContext(): SourceFetchContext;
    now(): number;
}

export type CommitRunResult =
    | { kind: 'finished'; job: ListImportRecord }
    | { kind: 'paused'; job: ListImportRecord }
    | { kind: 'lost' };

interface RowContext {
    userId: number;
    visibility: ListImportVisibility;
    fallbackCurrency: Currency;
    orderBase: number;
}

export const toStatusDto = (
    job: ListImportRecord,
    photosPending: number
): ListImportStatusDto => {
    return {
        jobId: job.id,
        state: job.state,
        planned: job.planned,
        created: job.created,
        createdGifted: job.createdGifted,
        photosPending,
        failure: job.failure
    };
};

export const isTransientFailure = (failure: ListImportFailure) => {
    return TRANSIENT_FAILURES.has(failure);
};

/**
 * Turns planned items into wish rows. Gifted items become gifted wishes
 * (`removed` and `done`), and the hidden choice applies to them too. `updatedAt`
 * steps back one millisecond per source position from the job's creation, so
 * the owner's list shows the wishes in the source order; `createdAt` is the
 * step's own timestamp, which the step's counter query relies on.
 */
export const toImportedRows = (
    items: readonly SourceItem[],
    context: RowContext,
    stepAt: Date
): ImportedWishRow[] => {
    return items.map(item => {
        return {
            userId: context.userId,
            title: item.title,
            description: item.description,
            link: item.link,
            price: item.price ?? 0,
            currency: item.currency ?? context.fallbackCurrency,
            hidden: context.visibility === 'hidden',
            removed: item.gifted,
            done: item.gifted,
            sourceRef: item.sourceRef,
            sourceImageUrl: item.imageUrl,
            createdAt: stepAt,
            updatedAt: new Date(context.orderBase - item.order)
        };
    });
};

const failJob = async (
    ports: CommitPorts,
    jobId: number,
    failure: ListImportFailure
): Promise<CommitRunResult> => {
    const failed = await ports.store.jobs.markFailed(
        jobId,
        failure,
        new Date(ports.now())
    );

    return failed === null
        ? { kind: 'lost' }
        : { kind: 'finished', job: failed };
};

const pauseJob = async (
    ports: CommitPorts,
    job: ListImportRecord
): Promise<CommitRunResult> => {
    await ports.store.jobs.releaseCommitLease(job.id, new Date(ports.now()));

    const paused = await ports.store.jobs.findById(job.id);

    return paused === null ? { kind: 'lost' } : { kind: 'paused', job: paused };
};

const nextStepAt = (ports: CommitPorts, previous: number | null) => {
    const now = ports.now();

    return previous === null || now > previous ? now : previous + 1;
};

const insertPlanned = async (
    ports: CommitPorts,
    job: ListImportRecord,
    items: readonly SourceItem[],
    context: RowContext,
    onProgress: ListImportProgressHandler | undefined
): Promise<ListImportRecord | null> => {
    let current = job;
    let previousStepAt: number | null = null;

    for (const stepItems of chunk(items, LIST_IMPORT_ROWS_PER_STEP)) {
        const stepAt = nextStepAt(ports, previousStepAt);
        const now = ports.now();

        previousStepAt = stepAt;

        const progress = await ports.store.jobs.recordCommitStep({
            jobId: job.id,
            userId: job.userId,
            rows: toImportedRows(stepItems, context, new Date(stepAt)),
            stepAt: new Date(stepAt),
            leaseUntil: new Date(now + LIST_IMPORT_LEASE_MS),
            now: new Date(now)
        });

        if (progress === null) {
            return null;
        }

        current = { ...current, ...progress };

        if (onProgress !== undefined) {
            await onProgress(
                toStatusDto(
                    current,
                    await ports.store.wishes.countPendingPhotos(job.userId)
                )
            ).catch(() => {
                return undefined;
            });
        }
    }

    return current;
};

/**
 * One pass of a commit for a job already in `committing` under the caller's
 * lease: fetch the source again, re-plan against the owner's current wishes
 * (rows an earlier pass inserted now count as duplicates by source ref), and
 * insert the rest in steps of at most 49 rows. A transient source failure with
 * attempts left pauses the job for the resumer; any other failure fails it.
 */
export const runCommitPass = async (
    ports: CommitPorts,
    job: ListImportRecord,
    onProgress?: ListImportProgressHandler
): Promise<CommitRunResult> => {
    const parsedUrl = parseListImportUrl(job.sourceUrl ?? '');
    const user = await ports.store.users.findById(job.userId);

    if (user === null) {
        return { kind: 'lost' };
    }

    if (parsedUrl === null) {
        return failJob(ports, job.id, 'invalidUrl');
    }

    const fetched = await ports.adapter.fetchItems(
        ports.createFetchContext(),
        parsedUrl
    );

    if (!fetched.ok) {
        return isTransientFailure(fetched.outcome) &&
            job.attempts < LIST_IMPORT_MAX_ATTEMPTS
            ? pauseJob(ports, job)
            : failJob(ports, job.id, fetched.outcome);
    }

    const [existing, activeCount] = await Promise.all([
        ports.store.wishes.listDedupeKeys(job.userId),
        ports.store.wishes.countActive(job.userId)
    ]);
    const plan = buildPlan(fetched.items, existing, activeCount);

    if (plan.items.length === 0 && job.created === 0) {
        return failJob(
            ports,
            job.id,
            plan.counts.overLimit > 0 ? 'limitReached' : 'empty'
        );
    }

    const planned = await ports.store.jobs.setPlanned(
        job.id,
        job.created + plan.items.length,
        job.createdGifted + plan.counts.gifted,
        new Date(ports.now())
    );

    if (planned === null) {
        return { kind: 'lost' };
    }

    const inserted = await insertPlanned(
        ports,
        planned,
        plan.items,
        {
            userId: job.userId,
            visibility: job.visibility,
            fallbackCurrency: isCurrency(user.currency)
                ? user.currency
                : FALLBACK_CURRENCY,
            orderBase: job.createdAt.getTime()
        },
        onProgress
    );

    if (inserted === null) {
        return { kind: 'lost' };
    }

    const done = await ports.store.jobs.markDone(job.id, new Date(ports.now()));

    return done === null ? { kind: 'lost' } : { kind: 'finished', job: done };
};
