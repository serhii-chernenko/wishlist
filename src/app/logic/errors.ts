import {
    AUTH_REJECT_REASONS,
    isApiErrorBody,
    type ApiErrorCode,
    type AuthRejectReason,
    type FieldErrors
} from '../../shared/app-api';

export type ApiFailure = {
    kind: 'api';
    status: number;
    code: ApiErrorCode;
    reason?: AuthRejectReason;
    fields?: FieldErrors;
    retryAfter?: number;
};

export type NetworkFailure = { kind: 'network' };

export type AppFailure = ApiFailure | NetworkFailure;

export type SystemScreenId =
    | 'outsideTelegram'
    | 'sessionExpired'
    | 'previewOnly'
    | 'unavailable';

export type ErrorMessageKey = ApiErrorCode | 'generic' | 'network';

export const MAX_GET_RETRIES = 2;
export const MAX_AUTO_RETRY_AFTER_SECONDS = 3;
export const RETRY_BASE_DELAY_MS = 400;

const STATUS_FALLBACK_CODES: ReadonlyArray<readonly [number, ApiErrorCode]> = [
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [409, 'conflict'],
    [410, 'tokenExpired'],
    [413, 'payloadTooLarge'],
    [415, 'unsupportedMedia'],
    [422, 'validation'],
    [429, 'rateLimited'],
    [501, 'notImplemented'],
    [502, 'upstream'],
    [503, 'disabled']
];

const RETRYABLE_STATUSES = new Set([500, 502, 504]);

const isAuthRejectReason = (value: unknown): value is AuthRejectReason => {
    return AUTH_REJECT_REASONS.some(reason => reason === value);
};

const toPositiveSeconds = (value: unknown) => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.ceil(value)
        : undefined;
};

const fallbackCodeForStatus = (status: number): ApiErrorCode => {
    return (
        STATUS_FALLBACK_CODES.find(([candidate]) => {
            return candidate === status;
        })?.[1] ?? 'internal'
    );
};

export const parseRetryAfterHeader = (value: string | null) => {
    if (value === null) {
        return undefined;
    }

    return toPositiveSeconds(Number(value));
};

export const toApiFailure = (
    status: number,
    body: unknown,
    retryAfterHeader?: number
): ApiFailure => {
    if (!isApiErrorBody(body)) {
        return {
            kind: 'api',
            status,
            code: fallbackCodeForStatus(status),
            ...(retryAfterHeader !== undefined && {
                retryAfter: retryAfterHeader
            })
        };
    }

    const { code, reason, fields, retryAfter } = body.error;
    const seconds = toPositiveSeconds(retryAfter) ?? retryAfterHeader;

    return {
        kind: 'api',
        status,
        code,
        ...(isAuthRejectReason(reason) && { reason }),
        ...(fields !== undefined && { fields }),
        ...(seconds !== undefined && { retryAfter: seconds })
    };
};

export const NETWORK_FAILURE: NetworkFailure = { kind: 'network' };

export const isAppFailure = (value: unknown): value is AppFailure => {
    if (typeof value !== 'object' || value === null || !('kind' in value)) {
        return false;
    }

    const { kind } = value as { kind: unknown };

    return kind === 'api' || kind === 'network';
};

export const hasErrorCode = (
    failure: AppFailure,
    ...codes: ApiErrorCode[]
): failure is ApiFailure => {
    return failure.kind === 'api' && codes.includes(failure.code);
};

export const toSystemScreen = (failure: AppFailure): SystemScreenId | null => {
    if (failure.kind !== 'api') {
        return null;
    }

    if (failure.code === 'unauthorized') {
        return failure.reason === 'missing'
            ? 'outsideTelegram'
            : 'sessionExpired';
    }

    if (failure.code === 'previewAccessDenied') {
        return 'previewOnly';
    }

    return failure.code === 'disabled' ? 'unavailable' : null;
};

export const toErrorMessageKey = (failure: AppFailure): ErrorMessageKey => {
    return failure.kind === 'network' ? 'network' : failure.code;
};

export const getRetryDelayMs = (
    failure: AppFailure,
    attempt: number
): number | null => {
    if (attempt >= MAX_GET_RETRIES) {
        return null;
    }

    if (failure.kind === 'network') {
        return RETRY_BASE_DELAY_MS * 2 ** attempt;
    }

    if (failure.code === 'rateLimited') {
        const seconds = failure.retryAfter;

        return seconds !== undefined && seconds <= MAX_AUTO_RETRY_AFTER_SECONDS
            ? seconds * 1000
            : null;
    }

    return RETRYABLE_STATUSES.has(failure.status)
        ? RETRY_BASE_DELAY_MS * 2 ** attempt
        : null;
};

export const getFieldErrors = (failure: AppFailure): FieldErrors => {
    return failure.kind === 'api' && failure.code === 'validation'
        ? (failure.fields ?? {})
        : {};
};
