import { parseDescription } from '../../bot/input/description';
import { parseLink } from '../../bot/input/link';
import { parsePrice } from '../../bot/input/price';
import { parseTitle } from '../../bot/input/title';
import type {
    ApiErrorCode,
    FieldErrorCode,
    FieldErrors,
    LinkImportDraftDto,
    OwnWishDto,
    WishDraftInput,
    WishPatchInput,
    WishPriority
} from '../../shared/app-api';
import { DEFAULT_CURRENCY } from '../../bot/content/intl';
import type { Currency } from '../../shared/money';

export const DRAFT_TEXT_FIELDS = [
    'title',
    'description',
    'price',
    'link'
] as const;

export type DraftTextField = (typeof DRAFT_TEXT_FIELDS)[number];

export type DraftFlag = 'priority' | 'hidden';

export interface WishDraft {
    title: string;
    description: string;
    price: string;
    link: string;
    currency: Currency;
    priority: WishPriority;
    hidden: boolean;
}

export type DraftErrors = Partial<Record<DraftTextField, FieldErrorCode>>;

export const createEmptyDraft = (currency: Currency): WishDraft => {
    return Object.freeze({
        title: '',
        description: '',
        price: '',
        link: '',
        currency,
        priority: 'none',
        hidden: false
    });
};

export const EMPTY_DRAFT: WishDraft = createEmptyDraft(DEFAULT_CURRENCY);

export const isHighPriority = (priority: WishPriority) => {
    return priority === 'high';
};

export const toToggledPriority = (pressed: boolean): WishPriority => {
    return pressed ? 'high' : 'none';
};

const IMMEDIATE_ERROR_CODES: ReadonlySet<FieldErrorCode> = new Set([
    'tooLong',
    'containsLink'
]);

const isBlank = (value: string) => {
    return value.trim() === '';
};

export const draftFromWish = (wish: OwnWishDto): WishDraft => {
    return {
        title: wish.title,
        description: wish.description ?? '',
        price: wish.price > 0 ? String(wish.price) : '',
        link: wish.link ?? '',
        currency: wish.currency,
        priority: wish.priority,
        hidden: wish.hidden
    };
};

export const draftFromImport = (
    imported: LinkImportDraftDto,
    fallbackCurrency: Currency
): WishDraft => {
    const { price } = imported;

    return {
        ...createEmptyDraft(fallbackCurrency),
        title: imported.title ?? '',
        description: imported.description ?? '',
        price: price !== null && price > 0 ? String(price) : '',
        link: imported.link,
        currency: imported.currency ?? fallbackCurrency
    };
};

export const draftWithLinkOnly = (
    link: string,
    fallbackCurrency: Currency
): WishDraft => {
    return { ...createEmptyDraft(fallbackCurrency), link };
};

export const withFlags = (
    draft: WishDraft,
    flags: Pick<WishDraft, DraftFlag>
): WishDraft => {
    return { ...draft, priority: flags.priority, hidden: flags.hidden };
};

/** Mirrors the server validators, so Save is enabled only for drafts the API will accept. */
export const validateDraft = (draft: WishDraft): DraftErrors => {
    const errors: DraftErrors = {};
    const title = parseTitle(draft.title);

    if (!title.ok) {
        errors.title = title.reason;
    }

    if (!isBlank(draft.description)) {
        const description = parseDescription(draft.description, []);

        if (!description.ok) {
            errors.description = description.reason;
        }
    }

    if (!isBlank(draft.price) && !parsePrice(draft.price, []).ok) {
        errors.price = 'invalid';
    }

    if (!isBlank(draft.link) && !parseLink(draft.link, []).ok) {
        errors.link = 'invalid';
    }

    return errors;
};

export const isDraftValid = (draft: WishDraft) => {
    return Object.keys(validateDraft(draft)).length === 0;
};

export const isDraftDirty = (baseline: WishDraft, draft: WishDraft) => {
    return (
        DRAFT_TEXT_FIELDS.some(field => {
            return baseline[field].trim() !== draft[field].trim();
        }) ||
        baseline.currency !== draft.currency ||
        baseline.priority !== draft.priority ||
        baseline.hidden !== draft.hidden
    );
};

/** Errors for untouched fields stay quiet until blur, except the ones a user can only fix by deleting what they just typed. */
export const visibleDraftErrors = (
    errors: DraftErrors,
    touched: ReadonlySet<DraftTextField>
): DraftErrors => {
    const visible: DraftErrors = {};

    for (const field of DRAFT_TEXT_FIELDS) {
        const code = errors[field];

        if (
            code !== undefined &&
            (touched.has(field) || IMMEDIATE_ERROR_CODES.has(code))
        ) {
            visible[field] = code;
        }
    }

    return visible;
};

export type SubmitCheck =
    | { ok: true }
    | {
          ok: false;
          errors: DraftErrors;
          firstInvalid: DraftTextField;
          onlyTitleMissing: boolean;
      };

const MISSING_CODES: ReadonlySet<FieldErrorCode> = new Set([
    'empty',
    'required'
]);

/** Validates every field for a Save press; the first invalid field in form order gets focus and a lone missing title gets its own message. */
export const checkDraftForSubmit = (
    draft: WishDraft,
    serverErrors: DraftErrors = {}
): SubmitCheck => {
    const errors: DraftErrors = { ...validateDraft(draft), ...serverErrors };
    const invalid = DRAFT_TEXT_FIELDS.filter(field => {
        return errors[field] !== undefined;
    });
    const [firstInvalid] = invalid;

    if (firstInvalid === undefined) {
        return { ok: true };
    }

    return {
        ok: false,
        errors,
        firstInvalid,
        onlyTitleMissing:
            invalid.length === 1 &&
            firstInvalid === 'title' &&
            MISSING_CODES.has(errors.title as FieldErrorCode)
    };
};

const toNullableText = (value: string) => {
    return isBlank(value) ? null : value.trim();
};

export const toCreateInput = (draft: WishDraft): WishDraftInput => {
    return {
        title: draft.title.trim(),
        description: toNullableText(draft.description),
        link: toNullableText(draft.link),
        price: toNullableText(draft.price),
        currency: draft.currency,
        priority: draft.priority,
        hidden: draft.hidden
    };
};

export const toPatchInput = (
    baseline: WishDraft,
    draft: WishDraft
): WishPatchInput => {
    const patch: WishPatchInput = {};

    if (baseline.title.trim() !== draft.title.trim()) {
        patch.title = draft.title.trim();
    }

    if (baseline.description.trim() !== draft.description.trim()) {
        patch.description = toNullableText(draft.description);
    }

    if (baseline.price.trim() !== draft.price.trim()) {
        patch.price = toNullableText(draft.price);
    }

    if (baseline.link.trim() !== draft.link.trim()) {
        patch.link = toNullableText(draft.link);
    }

    if (baseline.currency !== draft.currency) {
        patch.currency = draft.currency;
    }

    if (baseline.priority !== draft.priority) {
        patch.priority = draft.priority;
    }

    if (baseline.hidden !== draft.hidden) {
        patch.hidden = draft.hidden;
    }

    return patch;
};

export const toDraftErrors = (fields: FieldErrors): DraftErrors => {
    const errors: DraftErrors = {};

    for (const field of DRAFT_TEXT_FIELDS) {
        const code = fields[field];

        if (code !== undefined) {
            errors[field] = code;
        }
    }

    return errors;
};

export type PhotoUploadStatus = 'queued' | 'uploading' | 'failed';

export type PhotoFailureKind =
    | 'full'
    | 'tooLarge'
    | 'unsupported'
    | 'writeAccess'
    | 'failed';

export interface PendingPhoto<Source> {
    key: number;
    source: Source;
    status: PhotoUploadStatus;
    failure: PhotoFailureKind | null;
}

export interface PhotoQueue<Source> {
    items: readonly PendingPhoto<Source>[];
    nextKey: number;
}

export const createPhotoQueue = <Source>(): PhotoQueue<Source> => {
    return { items: [], nextKey: 1 };
};

export const countFreePhotoSlots = (
    uploaded: number,
    queue: PhotoQueue<unknown>,
    max: number
) => {
    return Math.max(0, max - uploaded - queue.items.length);
};

/** Queues as many picked photos as there are free slots and reports how many did not fit. */
export const enqueuePhotos = <Source>(
    queue: PhotoQueue<Source>,
    sources: readonly Source[],
    freeSlots: number
): { queue: PhotoQueue<Source>; rejected: number } => {
    const accepted = sources.slice(0, Math.max(0, freeSlots));
    const items = accepted.map((source, index) => {
        return {
            key: queue.nextKey + index,
            source,
            status: 'queued' as const,
            failure: null
        };
    });

    return {
        queue: {
            items: [...queue.items, ...items],
            nextKey: queue.nextKey + items.length
        },
        rejected: sources.length - accepted.length
    };
};

export const setPhotoStatus = <Source>(
    queue: PhotoQueue<Source>,
    key: number,
    status: PhotoUploadStatus,
    failure: PhotoFailureKind | null = null
): PhotoQueue<Source> => {
    return {
        ...queue,
        items: queue.items.map(item => {
            return item.key === key ? { ...item, status, failure } : item;
        })
    };
};

export const removePendingPhoto = <Source>(
    queue: PhotoQueue<Source>,
    key: number
): PhotoQueue<Source> => {
    return {
        ...queue,
        items: queue.items.filter(item => item.key !== key)
    };
};

export const nextQueuedPhoto = <Source>(queue: PhotoQueue<Source>) => {
    return queue.items.find(item => item.status === 'queued') ?? null;
};

/** After a "full" answer every photo still waiting is pointless to send. */
export const failQueuedPhotos = <Source>(
    queue: PhotoQueue<Source>,
    failure: PhotoFailureKind
): PhotoQueue<Source> => {
    return {
        ...queue,
        items: queue.items.map(item => {
            return item.status === 'queued'
                ? { ...item, status: 'failed', failure }
                : item;
        })
    };
};

export const summarizePhotoQueue = (queue: PhotoQueue<unknown>) => {
    const active = queue.items.filter(item => {
        return item.status !== 'failed';
    }).length;

    return {
        active,
        failed: queue.items.length - active,
        uploading: queue.items.some(item => item.status === 'uploading')
    };
};

const FAILURE_KIND_BY_CODE: Partial<Record<ApiErrorCode, PhotoFailureKind>> = {
    imagesFull: 'full',
    payloadTooLarge: 'tooLarge',
    unsupportedMedia: 'unsupported',
    writeAccessRequired: 'writeAccess'
};

export const toPhotoFailureKind = (
    code: ApiErrorCode | null
): PhotoFailureKind => {
    return code === null ? 'failed' : (FAILURE_KIND_BY_CODE[code] ?? 'failed');
};
