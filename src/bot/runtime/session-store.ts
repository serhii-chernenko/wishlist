import { Effect } from 'effect';

import type { AppLocale } from '../i18n';
import type {
    FindState,
    PendingInput,
    Repositories,
    SessionState,
    WishField,
    WishFilter
} from './types';

const SESSION_VERSION = 1;

const WISH_FIELDS: readonly WishField[] = [
    'title',
    'description',
    'images',
    'link',
    'price'
];

const SESSION_LANGUAGES: readonly AppLocale[] = ['uk', 'en', 'pl'];

export const createDefaultSessionState = (): SessionState => {
    return { v: SESSION_VERSION, pendingInput: null, find: null };
};

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isPositiveInteger = (value: unknown): value is number => {
    return Number.isSafeInteger(value) && (value as number) > 0;
};

const isWishFilter = (value: unknown): value is WishFilter => {
    return (
        Number.isInteger(value) &&
        (value as number) >= 0 &&
        (value as number) <= 4
    );
};

const isWishField = (value: unknown): value is WishField => {
    return WISH_FIELDS.some(field => {
        return field === value;
    });
};

type Decoded<T> = { ok: true; value: T } | { ok: false };

const decoded = <T>(value: T): Decoded<T> => {
    return { ok: true, value };
};

const INVALID = { ok: false } as const;

const decodePendingInput = (value: unknown): Decoded<PendingInput | null> => {
    if (value === null || value === undefined) {
        return decoded(null);
    }

    if (!isObject(value)) {
        return INVALID;
    }

    switch (value.kind) {
        case 'wishTitleNew':
        case 'findQuery':
        case 'feedback':
        case 'payments':
            return decoded({ kind: value.kind });
        case 'wishField':
            return isPositiveInteger(value.wishId) && isWishField(value.field)
                ? decoded({
                      kind: 'wishField',
                      wishId: value.wishId,
                      field: value.field
                  })
                : INVALID;
        case 'contact':
            return value.authType === 'phone' || value.authType === 'both'
                ? decoded({ kind: 'contact', authType: value.authType })
                : INVALID;
        default:
            return INVALID;
    }
};

const decodeFindState = (value: unknown): Decoded<FindState | null> => {
    if (value === null || value === undefined) {
        return decoded(null);
    }

    if (
        !isObject(value) ||
        !isPositiveInteger(value.targetUserId) ||
        typeof value.query !== 'string'
    ) {
        return INVALID;
    }

    const filter = value.filter ?? null;

    if (filter !== null && !isWishFilter(filter)) {
        return INVALID;
    }

    return decoded({
        targetUserId: value.targetUserId,
        query: value.query,
        filter
    });
};

const parseJson = (raw: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

/**
 * Decodes `sessions.state`; anything that is not a valid v1 state (bad JSON,
 * unknown version, malformed branch) resets to the default state.
 */
export const decodeSessionState = (
    raw: string | null | undefined
): SessionState => {
    if (!raw) {
        return createDefaultSessionState();
    }

    const value = parseJson(raw);

    if (!isObject(value) || value.v !== SESSION_VERSION) {
        return createDefaultSessionState();
    }

    const pendingInput = decodePendingInput(value.pendingInput);
    const find = decodeFindState(value.find);

    if (!pendingInput.ok || !find.ok) {
        return createDefaultSessionState();
    }

    return {
        v: SESSION_VERSION,
        pendingInput: pendingInput.value,
        find: find.value
    };
};

export const encodeSessionState = (state: SessionState) => {
    return JSON.stringify({
        v: state.v,
        pendingInput: state.pendingInput,
        find: state.find
    });
};

export const isSameSessionState = (left: SessionState, right: SessionState) => {
    return encodeSessionState(left) === encodeSessionState(right);
};

export const decodeSessionLanguage = (
    raw: string | null | undefined
): AppLocale | null => {
    return (
        SESSION_LANGUAGES.find(language => {
            return language === raw;
        }) ?? null
    );
};

export interface LoadedSession {
    exists: boolean;
    state: SessionState;
    language: AppLocale | null;
}

export const loadSession = async (
    repos: Pick<Repositories, 'sessions'>,
    telegramUserId: number
): Promise<LoadedSession> => {
    const record = await Effect.runPromise(repos.sessions.get(telegramUserId));

    return {
        exists: record !== null,
        state: decodeSessionState(record?.state),
        language: decodeSessionLanguage(record?.language)
    };
};

export const saveSessionIfChanged = async (
    repos: Pick<Repositories, 'sessions'>,
    telegramUserId: number,
    initial: SessionState,
    next: SessionState,
    now: Date
) => {
    if (isSameSessionState(initial, next)) {
        return false;
    }

    await Effect.runPromise(
        repos.sessions.saveState(telegramUserId, encodeSessionState(next), now)
    );

    return true;
};
