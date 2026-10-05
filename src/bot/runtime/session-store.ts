import { Effect } from 'effect';

import {
    LIST_IMPORT_SOURCES,
    type ListImportSource
} from '../../shared/app-api';
import type { AppLocale } from '../i18n';
import { isRenderableLink } from '../input/link';
import type {
    AlbumState,
    FindState,
    LinkOffer,
    PendingInput,
    PendingInputKind,
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

export type MarkedPendingKind = Extract<
    PendingInputKind,
    'wishTitleNew' | 'listImportUrl'
>;

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

const isListImportSource = (value: unknown): value is ListImportSource => {
    return LIST_IMPORT_SOURCES.some(source => {
        return source === value;
    });
};

const isLink = (value: unknown): value is string => {
    return typeof value === 'string' && isRenderableLink(value);
};

const decodePendingInput = (value: unknown): Decoded<PendingInput | null> => {
    if (value === null || value === undefined) {
        return decoded(null);
    }

    if (!isObject(value)) {
        return INVALID;
    }

    switch (value.kind) {
        case 'wishTitleNew':
            return decoded({
                kind: 'wishTitleNew',
                ...(isLink(value.link) ? { link: value.link } : {}),
                ...(isPositiveInteger(value.importMarker)
                    ? { importMarker: value.importMarker }
                    : {})
            });
        case 'listImportUrl':
            return isListImportSource(value.source)
                ? decoded({
                      kind: 'listImportUrl',
                      source: value.source,
                      ...(isPositiveInteger(value.importMarker)
                          ? { importMarker: value.importMarker }
                          : {})
                  })
                : INVALID;
        case 'findQuery':
        case 'feedback':
        case 'payments':
        case 'deliveryAddress':
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
                ? decoded({
                      kind: 'contact',
                      authType: value.authType,
                      ...(value.via === 'app' ? { via: 'app' as const } : {}),
                      ...(isPositiveInteger(value.createdAt)
                          ? { createdAt: value.createdAt }
                          : {})
                  })
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

const decodeAlbumState = (value: unknown): Decoded<AlbumState | null> => {
    if (value === null || value === undefined) {
        return decoded(null);
    }

    if (
        !isObject(value) ||
        typeof value.mediaGroupId !== 'string' ||
        value.mediaGroupId === '' ||
        !isPositiveInteger(value.wishId)
    ) {
        return INVALID;
    }

    return decoded({
        mediaGroupId: value.mediaGroupId,
        wishId: value.wishId
    });
};

const decodeLinkOffer = (value: unknown): LinkOffer | null => {
    if (
        !isObject(value) ||
        !isLink(value.url) ||
        !isPositiveInteger(value.createdAt)
    ) {
        return null;
    }

    return { url: value.url, createdAt: value.createdAt };
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
    const album = decodeAlbumState(value.album);
    const linkOffer = decodeLinkOffer(value.linkOffer);

    if (!pendingInput.ok || !find.ok || !album.ok) {
        return createDefaultSessionState();
    }

    return {
        v: SESSION_VERSION,
        pendingInput: pendingInput.value,
        find: find.value,
        ...(album.value === null ? {} : { album: album.value }),
        ...(linkOffer === null ? {} : { linkOffer })
    };
};

export const encodeSessionState = (state: SessionState) => {
    return JSON.stringify({
        v: state.v,
        pendingInput: state.pendingInput,
        find: state.find,
        ...(state.album === undefined ? {} : { album: state.album }),
        ...(state.linkOffer === undefined ? {} : { linkOffer: state.linkOffer })
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

export const claimPendingMarker = async (
    repos: Pick<Repositories, 'sessions'>,
    telegramUserId: number,
    kind: MarkedPendingKind,
    marker: number,
    nextPendingInput: PendingInput | null,
    now: Date
) => {
    const { state } = await loadSession(repos, telegramUserId);
    const pending = state.pendingInput;

    if (
        pending?.kind !== kind ||
        !('importMarker' in pending) ||
        pending.importMarker !== marker
    ) {
        return false;
    }

    await Effect.runPromise(
        repos.sessions.saveState(
            telegramUserId,
            encodeSessionState({ ...state, pendingInput: nextPendingInput }),
            now
        )
    );

    return true;
};

export const isSessionWrittenBefore = async (
    repos: Pick<Repositories, 'sessions'>,
    telegramUserId: number,
    moment: Date
) => {
    const record = await Effect.runPromise(repos.sessions.get(telegramUserId));

    return record === null || record.updatedAt.getTime() < moment.getTime();
};

export const savePendingInput = async (
    repos: Pick<Repositories, 'sessions'>,
    telegramUserId: number,
    pendingInput: PendingInput | null,
    now: Date
) => {
    const { state } = await loadSession(repos, telegramUserId);

    await Effect.runPromise(
        repos.sessions.saveState(
            telegramUserId,
            encodeSessionState({ ...state, pendingInput }),
            now
        )
    );
};
