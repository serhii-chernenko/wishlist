import { extractLink } from '../../bot/input/link';
import {
    LIST_IMPORT_POLL_COMMITTING_MS,
    LIST_IMPORT_POLL_PHOTOS_MS,
    LIST_IMPORT_POLL_TIMEOUT_MS,
    type ListImportCountsDto,
    type ListImportFailure,
    type ListImportKind,
    type ListImportPreviewDto,
    type ListImportSource,
    type ListImportStatusDto,
    type ListImportVisibility
} from '../../shared/app-api';
import {
    parseListImportUrl,
    suggestListImportVisibility,
    hasSavedWishesNote
} from '../../shared/list-import-url';
import { getFieldErrors, type AppFailure } from './errors';

export const LIST_IMPORT_DEFAULT_SOURCE: ListImportSource = 'rewish';

export const LIST_IMPORT_MAX_POLL_FAILURES = 3;

export interface ListImportTarget {
    url: string;
    kind: ListImportKind;
    suggestedVisibility: ListImportVisibility;
    savedWishesNote: boolean;
}

export type PreviewNotice = 'nothing' | 'limitReached';

/** A preview the card can show. Without a `jobId` there is nothing to import: the counts explain why and `notice` names the message. */
export interface ListImportReadyPreview {
    jobId: number | null;
    kind: ListImportKind | null;
    counts: ListImportCountsDto;
    savedWishesNote: boolean;
    notice: PreviewNotice | null;
}

export type ListImportFlow =
    | { step: 'source'; source: ListImportSource }
    | { step: 'url'; source: ListImportSource }
    | {
          step: 'preview';
          source: ListImportSource;
          preview: ListImportReadyPreview;
          visibility: ListImportVisibility;
      }
    | { step: 'progress'; status: ListImportStatusDto }
    | { step: 'done'; status: ListImportStatusDto }
    | { step: 'failed'; status: ListImportStatusDto };

export type ListImportEvent =
    | { type: 'sourcePicked'; source: ListImportSource }
    | { type: 'sourceConfirmed' }
    | { type: 'previewLoaded'; preview: ListImportPreviewDto }
    | { type: 'visibilityChanged'; visibility: ListImportVisibility }
    | { type: 'commitStarted'; status: ListImportStatusDto }
    | { type: 'commitRefused'; failure: ListImportFailure }
    | { type: 'statusUpdated'; status: ListImportStatusDto }
    | { type: 'restarted' };

export type PreviewCountKey =
    | 'active'
    | 'gifted'
    | 'duplicates'
    | 'withoutPrice'
    | 'overLimit';

export interface PreviewCountLine {
    key: PreviewCountKey;
    count: number;
}

export type PollDecision =
    | { action: 'wait'; delayMs: number }
    | { action: 'stop'; reason: 'settled' | 'timeout' };

export type PreviewFailureKind = 'invalidUrl' | 'other';

const PREVIEW_COUNT_KEYS: readonly PreviewCountKey[] = [
    'active',
    'gifted',
    'duplicates',
    'withoutPrice',
    'overLimit'
];

const FAILED_STATES: ReadonlySet<ListImportStatusDto['state']> = new Set([
    'failed',
    'expired',
    'cancelled'
]);

/** Reads a pasted list link, tolerating surrounding text and a missing scheme; null until it is a recognized share link. */
export const parseListImportTarget = (
    text: string
): ListImportTarget | null => {
    const trimmed = text.trim();
    const embedded = extractLink(trimmed);
    const parsed =
        parseListImportUrl(trimmed) ??
        (embedded === null ? null : parseListImportUrl(embedded));

    if (parsed === null) {
        return null;
    }

    return {
        url: parsed.url,
        kind: parsed.kind,
        suggestedVisibility: suggestListImportVisibility(parsed),
        savedWishesNote: hasSavedWishesNote(parsed)
    };
};

export const createListImportFlow = (): ListImportFlow => {
    return { step: 'source', source: LIST_IMPORT_DEFAULT_SOURCE };
};

export const plannedCount = (counts: ListImportCountsDto) => {
    return counts.active + counts.gifted;
};

const toNothingToImport = (
    preview: ListImportPreviewDto,
    counts: ListImportCountsDto
): ListImportReadyPreview | null => {
    if (
        (preview.outcome !== 'empty' && preview.outcome !== 'limitReached') ||
        plannedCount(counts) > 0
    ) {
        return null;
    }

    return {
        jobId: null,
        kind: preview.kind,
        counts,
        savedWishesNote: preview.savedWishesNote,
        notice: preview.outcome === 'limitReached' ? 'limitReached' : 'nothing'
    };
};

/** The preview answer in a shape the card can render: a job to commit, or the counts of a list with nothing new in it. Null for anything the server refused or left incomplete. */
export const toReadyPreview = (
    preview: ListImportPreviewDto
): ListImportReadyPreview | null => {
    const { counts } = preview;

    if (counts === null) {
        return null;
    }

    if (preview.outcome !== 'ok') {
        return toNothingToImport(preview, counts);
    }

    if (preview.jobId === null || preview.kind === null) {
        return null;
    }

    return {
        jobId: preview.jobId,
        kind: preview.kind,
        counts,
        savedWishesNote: preview.savedWishesNote,
        notice: plannedCount(counts) > 0 ? null : 'nothing'
    };
};

export const statusStep = (
    status: ListImportStatusDto
): 'progress' | 'done' | 'failed' => {
    if (status.state === 'done') {
        return 'done';
    }

    return FAILED_STATES.has(status.state) ? 'failed' : 'progress';
};

const REFUSED_STATES: ReadonlySet<ListImportStatusDto['state']> = new Set([
    'previewed',
    'expired',
    'cancelled'
]);

/** A commit answer for a job that did not start: another import is running, or the preview is no longer valid. */
export const commitRefusal = (
    status: ListImportStatusDto
): ListImportFailure | null => {
    if (!REFUSED_STATES.has(status.state)) {
        return null;
    }

    return status.failure ?? 'expired';
};

export const reduceListImportFlow = (
    flow: ListImportFlow,
    event: ListImportEvent
): ListImportFlow => {
    switch (event.type) {
        case 'sourcePicked':
            return flow.step === 'source'
                ? { step: 'source', source: event.source }
                : flow;
        case 'sourceConfirmed':
            return flow.step === 'source'
                ? { step: 'url', source: flow.source }
                : flow;
        case 'previewLoaded': {
            const preview = toReadyPreview(event.preview);

            return flow.step === 'url' && preview !== null
                ? {
                      step: 'preview',
                      source: flow.source,
                      preview,
                      visibility: event.preview.suggestedVisibility
                  }
                : flow;
        }
        case 'visibilityChanged':
            return flow.step === 'preview'
                ? { ...flow, visibility: event.visibility }
                : flow;
        case 'commitStarted':
            return flow.step === 'preview'
                ? { step: statusStep(event.status), status: event.status }
                : flow;
        case 'commitRefused':
            return flow.step === 'preview' && event.failure === 'expired'
                ? { step: 'url', source: flow.source }
                : flow;
        case 'statusUpdated':
            return flow.step === 'progress' || flow.step === 'done'
                ? { step: statusStep(event.status), status: event.status }
                : flow;
        case 'restarted':
            return flow.step === 'failed'
                ? { step: 'url', source: LIST_IMPORT_DEFAULT_SOURCE }
                : flow;
    }
};

/** The count lines worth showing: zero counts are left out, the rest keep a fixed order. */
export const previewCountLines = (
    counts: ListImportCountsDto
): PreviewCountLine[] => {
    return PREVIEW_COUNT_KEYS.map(key => {
        return { key, count: counts[key] };
    }).filter(line => {
        return line.count > 0;
    });
};

export const hasPhotosToLoad = (counts: ListImportCountsDto) => {
    return plannedCount(counts) > counts.withoutPhoto;
};

export const canStartImport = (
    preview: ListImportReadyPreview
): preview is ListImportReadyPreview & { jobId: number } => {
    return preview.jobId !== null && plannedCount(preview.counts) > 0;
};

/** Done with every photo already in place: nothing left to wait for, so the screen can hand over to the list at once. */
export const isImportFinishedForGood = (status: ListImportStatusDto) => {
    return status.state === 'done' && status.photosPending === 0;
};

/** How long to wait before asking again: quick while wishes are being created, slower while photos load; `elapsedMs` counts from the start of the current phase. */
export const decidePoll = (
    status: ListImportStatusDto,
    elapsedMs: number
): PollDecision => {
    const waitingForWishes = status.state === 'committing';
    const waitingForPhotos =
        status.state === 'done' && status.photosPending > 0;

    if (!waitingForWishes && !waitingForPhotos) {
        return { action: 'stop', reason: 'settled' };
    }

    if (elapsedMs >= LIST_IMPORT_POLL_TIMEOUT_MS) {
        return { action: 'stop', reason: 'timeout' };
    }

    return {
        action: 'wait',
        delayMs: waitingForWishes
            ? LIST_IMPORT_POLL_COMMITTING_MS
            : LIST_IMPORT_POLL_PHOTOS_MS
    };
};

export const classifyPreviewFailure = (
    failure: AppFailure
): PreviewFailureKind => {
    return getFieldErrors(failure).url === undefined ? 'other' : 'invalidUrl';
};

export const shouldGiveUpPolling = (consecutiveFailures: number) => {
    return consecutiveFailures >= LIST_IMPORT_MAX_POLL_FAILURES;
};
