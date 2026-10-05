import type { TelegramApi } from '../../../api/telegram-api';
import type {
    ListImportChannel,
    ListImportFailure,
    ListImportKind,
    ListImportPreviewDto,
    ListImportSource,
    ListImportStatusDto,
    ListImportVisibility
} from '../../../shared/app-api';
import type { ParsedListUrl } from '../../../shared/list-import-url';
import type { Currency } from '../../../shared/money';
import type { WorkerBindings } from '../../../worker/env';
import type {
    ListImportCommitTrigger,
    ListImportDrainOutcome,
    ListImportDrainTrigger
} from '../../../worker/telemetry';
import type { SafeFetcher } from '../link-import/types';

export type {
    ListImportChannel,
    ListImportFailure,
    ListImportKind,
    ListImportSource,
    ListImportVisibility
};

/**
 * One wish as a source describes it, already cleaned by the adapter: the title
 * and description are cut to our limits, `link` is renderable or null, and a
 * price in a currency we do not support is dropped with `foreignPrice` set.
 * `order` is the position in the source: lists in API order, active wishes by
 * their source position first and gifted ones after.
 */
export interface SourceItem {
    sourceRef: string;
    title: string;
    description: string | null;
    link: string | null;
    price: number | null;
    currency: Currency | null;
    foreignPrice: boolean;
    gifted: boolean;
    imageUrl: string | null;
    order: number;
}

export type SourceFetchResult =
    | { ok: true; kind: ListImportKind; items: SourceItem[] }
    | { ok: false; outcome: ListImportFailure };

/**
 * What an adapter may use during one preview or commit run. `acquireHostToken`
 * takes the shared per-host limiter token once per run and answers false when
 * the limiter refuses; `deadlineAt` is the epoch millisecond the whole fetch
 * has to finish by.
 */
export interface SourceFetchContext {
    fetcher: SafeFetcher;
    acquireHostToken(host: string): Promise<boolean>;
    createFlowId(): string;
    now(): number;
    deadlineAt: number;
}

export interface ListImportSourceAdapter {
    source: ListImportSource;
    apiHosts: readonly string[];
    imageHosts: readonly string[];
    fetchItems(
        context: SourceFetchContext,
        url: ParsedListUrl
    ): Promise<SourceFetchResult>;
    photoCandidates(rawImageUrl: string): string[];
}

export type ListImportAdapters = Record<
    ListImportSource,
    ListImportSourceAdapter
>;

export interface ListImportDeps {
    env: WorkerBindings;
    fetch?: typeof fetch;
    now?: () => number;
    waitUntil?: (promise: Promise<unknown>) => void;
    sleep?: (milliseconds: number) => Promise<void>;
    telegram?: TelegramApi;
}

export interface ListImportPreviewRequest {
    userId: number;
    url: ParsedListUrl;
    channel: ListImportChannel;
}

export interface ListImportJobRequest {
    userId: number;
    jobId: number;
}

/**
 * `notFound` covers a missing job and another user's job; `expired` is a
 * preview past its 30 minutes, cancelled, or no longer waiting for a decision.
 */
export type ListImportJobGate = 'ok' | 'notFound' | 'expired';

export interface ListImportVisibilityRequest extends ListImportJobRequest {
    visibility: ListImportVisibility;
}

/** Without `visibility` the commit keeps the one stored on the job: the suggested value or the last toggle. */
export interface ListImportStartRequest extends ListImportJobRequest {
    visibility?: ListImportVisibility;
    chatMessageId: number | null;
}

/** `busy` carries the id of the user's running import, or null when it finished in the meantime. */
export type ListImportStartResult =
    | { ok: true; status: ListImportStatusDto }
    | { ok: false; outcome: 'busy'; jobId: number | null }
    | { ok: false; outcome: 'expired' | 'notFound' };

export type ListImportProgressHandler = (
    status: ListImportStatusDto
) => Promise<void>;

export interface ListImportRunRequest {
    jobId: number;
    trigger: ListImportCommitTrigger;
    onProgress?: ListImportProgressHandler;
}

export interface ListImportResumeRequest {
    userId?: number;
}

/** `holdLeaseMs` keeps the user's drain lease for that long after the run starts, so a repeated trigger inside the window finds the user locked. */
export interface ListImportDrainRequest {
    budgetMs: number;
    trigger: ListImportDrainTrigger;
    userId?: number;
    holdLeaseMs?: number;
}

export interface ListImportKickRequest extends ListImportResumeRequest {
    holdLeaseMs?: number;
}

export interface ListImportDrainSummary {
    result: ListImportDrainOutcome;
    ingested: number;
    failed: number;
}

/**
 * The one entry point for the bot, the API and the scheduled tasks. Counts in
 * `ListImportStatusDto` and `ListImportPreviewDto` follow the DTO docs:
 * `planned` and `created` include the gifted wishes. `startCommit` only moves
 * a previewed job to `committing`; the caller then runs `runCommit` in the
 * background. `runCommit` re-fetches and re-plans, inserts in idempotent
 * chunks, and returns null when the job is not committing. `kick` resumes
 * stale commits and drains photos within the short budget.
 */
export interface ListImportService {
    preview(
        deps: ListImportDeps,
        request: ListImportPreviewRequest
    ): Promise<ListImportPreviewDto>;
    setVisibility(
        deps: ListImportDeps,
        request: ListImportVisibilityRequest
    ): Promise<ListImportJobGate>;
    startCommit(
        deps: ListImportDeps,
        request: ListImportStartRequest
    ): Promise<ListImportStartResult>;
    runCommit(
        deps: ListImportDeps,
        request: ListImportRunRequest
    ): Promise<ListImportStatusDto | null>;
    status(
        deps: ListImportDeps,
        request: ListImportJobRequest
    ): Promise<ListImportStatusDto | null>;
    cancel(
        deps: ListImportDeps,
        request: ListImportJobRequest
    ): Promise<ListImportJobGate>;
    resumeStale(
        deps: ListImportDeps,
        request: ListImportResumeRequest
    ): Promise<number>;
    drainPhotos(
        deps: ListImportDeps,
        request: ListImportDrainRequest
    ): Promise<ListImportDrainSummary>;
    prune(deps: ListImportDeps): Promise<number>;
    kick(deps: ListImportDeps, request: ListImportKickRequest): Promise<void>;
}
