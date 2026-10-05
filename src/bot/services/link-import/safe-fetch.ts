import {
    LINK_IMPORT_HTML_MAX_BYTES,
    LINK_IMPORT_IMAGE_MAX_BYTES,
    LINK_IMPORT_IMAGE_TIMEOUT_MS,
    LINK_IMPORT_PAGE_TIMEOUT_MS,
    LINK_IMPORT_USER_AGENT,
    LIST_IMPORT_CALL_TIMEOUT_MS,
    LIST_IMPORT_JSON_MAX_BYTES
} from '../../../shared/app-api';
import { isFetchableImportUrl } from './normalize-url';
import type {
    CreateSafeFetcher,
    FetchJsonOptions,
    FetchedImage,
    FetchedPage,
    SafeFetchFailure,
    SafeFetchOptions,
    SafeFetchResult,
    SafeFetcher
} from './types';

export const LINK_IMPORT_MAX_REDIRECTS = 5;

const PAGE_ACCEPT = 'text/html,application/xhtml+xml';
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1';
const JSON_ACCEPT = 'application/json';
const JSON_MEDIA_TYPE = 'application/json';
const JSON_SUFFIX = '+json';
const PROTECTED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
    'user-agent',
    'cookie',
    'authorization',
    'host'
]);
const ACCEPT_LANGUAGE = 'en-US';
const PAGE_CONTENT_TYPES: ReadonlySet<string> = new Set([
    'text/html',
    'application/xhtml+xml'
]);
const IMAGE_CONTENT_TYPE_PREFIX = 'image/';
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
    301, 302, 303, 307, 308
]);
const BLOCKED_STATUSES: ReadonlySet<number> = new Set([401, 403, 429, 451]);
const BOT_WALL_HEADER = 'cf-mitigated';
const ABORT_ERROR_NAMES: ReadonlySet<string> = new Set([
    'AbortError',
    'TimeoutError'
]);

type FetchImpl = typeof fetch;

interface RequestRestrictions {
    allowedHosts?: readonly string[] | undefined;
    extraHeaders?: Readonly<Record<string, string>> | undefined;
}

interface RequestPlan extends RequestRestrictions {
    fetchImpl: FetchImpl;
    accept: string;
    signal: AbortSignal;
}

interface FollowedResponse {
    finalUrl: string;
    response: Response;
}

const fail = <Value>(
    failure: SafeFetchFailure,
    status: number | null = null
): SafeFetchResult<Value> => {
    return { ok: false, failure, status };
};

const succeed = <Value>(value: Value): SafeFetchResult<Value> => {
    return { ok: true, value };
};

const defaultFetch: FetchImpl = (input, init) => {
    return fetch(input, init);
};

const discardBody = (response: Response) => {
    response.body?.cancel().catch(() => {
        return undefined;
    });
};

const parseFetchableUrl = (raw: string, base?: string) => {
    try {
        const url = base === undefined ? new URL(raw) : new URL(raw, base);

        return isFetchableImportUrl(url) ? url : null;
    } catch {
        return null;
    }
};

const isUnparseable = (raw: string, base?: string) => {
    try {
        void (base === undefined ? new URL(raw) : new URL(raw, base));

        return false;
    } catch {
        return true;
    }
};

const rejectUrl = <Value>(
    raw: string,
    status: number | null,
    base?: string
): SafeFetchResult<Value> => {
    return fail(
        isUnparseable(raw, base) ? 'invalidUrl' : 'blockedHost',
        status
    );
};

const isAllowedHost = (
    url: URL,
    allowedHosts: readonly string[] | undefined
) => {
    return allowedHosts === undefined || allowedHosts.includes(url.hostname);
};

const buildHeaders = (
    accept: string,
    extraHeaders: Readonly<Record<string, string>> = {}
) => {
    const headers = new Headers({
        'User-Agent': LINK_IMPORT_USER_AGENT,
        Accept: accept,
        'Accept-Language': ACCEPT_LANGUAGE
    });

    for (const [name, value] of Object.entries(extraHeaders)) {
        if (!PROTECTED_REQUEST_HEADERS.has(name.toLowerCase())) {
            headers.set(name, value);
        }
    }

    return headers;
};

const toFailure = (error: unknown, signal: AbortSignal): SafeFetchFailure => {
    if (signal.aborted) {
        return 'timeout';
    }

    return error instanceof Error && ABORT_ERROR_NAMES.has(error.name)
        ? 'timeout'
        : 'network';
};

const followRedirects = async (
    plan: RequestPlan,
    start: URL
): Promise<SafeFetchResult<FollowedResponse>> => {
    let current = start;

    for (let redirects = 0; ; redirects += 1) {
        const response = await plan.fetchImpl(current.href, {
            method: 'GET',
            redirect: 'manual',
            headers: buildHeaders(plan.accept, plan.extraHeaders),
            signal: plan.signal
        });

        if (!REDIRECT_STATUSES.has(response.status)) {
            return succeed({ finalUrl: current.href, response });
        }

        discardBody(response);

        const location = response.headers.get('location');

        if (location === null) {
            return fail('badStatus', response.status);
        }

        if (redirects >= LINK_IMPORT_MAX_REDIRECTS) {
            return fail('tooManyRedirects', response.status);
        }

        const next = parseFetchableUrl(location, current.href);

        if (next === null) {
            return rejectUrl(location, response.status, current.href);
        }

        if (!isAllowedHost(next, plan.allowedHosts)) {
            return fail('blockedHost', response.status);
        }

        current = next;
    }
};

const statusFailure = (response: Response): SafeFetchFailure | null => {
    if (
        BLOCKED_STATUSES.has(response.status) ||
        response.headers.has(BOT_WALL_HEADER)
    ) {
        return 'blockedStatus';
    }

    return response.ok ? null : 'badStatus';
};

const mediaType = (response: Response) => {
    const header = response.headers.get('content-type') ?? '';

    return (header.split(';')[0] ?? '').trim().toLowerCase();
};

const declaredLength = (response: Response) => {
    const header = response.headers.get('content-length');
    const length = header === null ? Number.NaN : Number(header);

    return Number.isFinite(length) ? length : null;
};

const exceedsDeclaredLength = (response: Response, maxBytes: number) => {
    const length = declaredLength(response);

    return length !== null && length > maxBytes;
};

const cancelReader = async (
    reader: ReadableStreamDefaultReader<Uint8Array>
) => {
    await reader.cancel().catch(() => {
        return undefined;
    });
};

const readIntoDeclaredLength = async (
    body: ReadableStream<Uint8Array>,
    declared: number
): Promise<ArrayBuffer | null> => {
    const reader = body.getReader();
    const target = new Uint8Array(declared);
    let offset = 0;

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        if (offset + value.byteLength > declared) {
            await cancelReader(reader);

            return null;
        }

        target.set(value, offset);
        offset += value.byteLength;
    }

    return offset === declared ? target.buffer : target.slice(0, offset).buffer;
};

const readCapped = async (
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
    declared: number | null
): Promise<ArrayBuffer | null> => {
    if (declared !== null && declared <= maxBytes) {
        return readIntoDeclaredLength(body, declared);
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        total += value.byteLength;

        if (total > maxBytes) {
            await cancelReader(reader);

            return null;
        }

        chunks.push(value);
    }

    const joined = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return joined.buffer;
};

const fetchChecked = async (
    fetchImpl: FetchImpl,
    rawUrl: string,
    accept: string,
    signal: AbortSignal,
    acceptsMediaType: (type: string) => boolean,
    restrictions: RequestRestrictions = {}
): Promise<SafeFetchResult<FollowedResponse>> => {
    const start = parseFetchableUrl(rawUrl);

    if (start === null) {
        return rejectUrl(rawUrl, null);
    }

    if (!isAllowedHost(start, restrictions.allowedHosts)) {
        return fail('blockedHost');
    }

    const followed = await followRedirects(
        { fetchImpl, accept, signal, ...restrictions },
        start
    );

    if (!followed.ok) {
        return followed;
    }

    const { response } = followed.value;
    const failure =
        statusFailure(response) ??
        (acceptsMediaType(mediaType(response)) ? null : 'badContentType');

    if (failure !== null) {
        discardBody(response);

        return fail(failure, response.status);
    }

    return followed;
};

const isPageMediaType = (type: string) => {
    return PAGE_CONTENT_TYPES.has(type);
};

const isImageMediaType = (type: string) => {
    return type.startsWith(IMAGE_CONTENT_TYPE_PREFIX);
};

const isJsonMediaType = (type: string) => {
    return type === JSON_MEDIA_TYPE || type.endsWith(JSON_SUFFIX);
};

const fetchPage = async (
    fetchImpl: FetchImpl,
    url: string,
    options: SafeFetchOptions = {}
): Promise<SafeFetchResult<FetchedPage>> => {
    const maxBytes = options.maxBytes ?? LINK_IMPORT_HTML_MAX_BYTES;
    const signal = AbortSignal.timeout(
        options.timeoutMs ?? LINK_IMPORT_PAGE_TIMEOUT_MS
    );

    try {
        const checked = await fetchChecked(
            fetchImpl,
            url,
            PAGE_ACCEPT,
            signal,
            isPageMediaType
        );

        if (!checked.ok) {
            return checked;
        }

        const { response, finalUrl } = checked.value;

        if (exceedsDeclaredLength(response, maxBytes)) {
            discardBody(response);

            return fail('tooLarge', response.status);
        }

        return succeed({ finalUrl, response });
    } catch (error) {
        return fail(toFailure(error, signal));
    }
};

const fetchImage = async (
    fetchImpl: FetchImpl,
    url: string,
    options: SafeFetchOptions = {}
): Promise<SafeFetchResult<FetchedImage>> => {
    const maxBytes = options.maxBytes ?? LINK_IMPORT_IMAGE_MAX_BYTES;
    const signal = AbortSignal.timeout(
        options.timeoutMs ?? LINK_IMPORT_IMAGE_TIMEOUT_MS
    );

    try {
        const checked = await fetchChecked(
            fetchImpl,
            url,
            IMAGE_ACCEPT,
            signal,
            isImageMediaType
        );

        if (!checked.ok) {
            return checked;
        }

        const { response, finalUrl } = checked.value;

        if (
            response.body === null ||
            exceedsDeclaredLength(response, maxBytes)
        ) {
            discardBody(response);

            return fail(
                response.body === null ? 'badStatus' : 'tooLarge',
                response.status
            );
        }

        const bytes = await readCapped(
            response.body,
            maxBytes,
            declaredLength(response)
        );

        if (bytes === null) {
            return fail('tooLarge', response.status);
        }

        return succeed({
            finalUrl,
            bytes,
            contentType: mediaType(response)
        });
    } catch (error) {
        return fail(toFailure(error, signal));
    }
};

const parseJsonBody = (bytes: ArrayBuffer, status: number) => {
    try {
        return succeed<unknown>(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
        return fail<unknown>('badContentType', status);
    }
};

const fetchJson = async (
    fetchImpl: FetchImpl,
    url: string,
    options: FetchJsonOptions
): Promise<SafeFetchResult<unknown>> => {
    const maxBytes = options.maxBytes ?? LIST_IMPORT_JSON_MAX_BYTES;
    const signal = AbortSignal.timeout(
        options.timeoutMs ?? LIST_IMPORT_CALL_TIMEOUT_MS
    );

    try {
        const checked = await fetchChecked(
            fetchImpl,
            url,
            JSON_ACCEPT,
            signal,
            isJsonMediaType,
            {
                allowedHosts: options.allowedHosts,
                extraHeaders: options.headers
            }
        );

        if (!checked.ok) {
            return checked;
        }

        const { response } = checked.value;

        if (
            response.body === null ||
            exceedsDeclaredLength(response, maxBytes)
        ) {
            discardBody(response);

            return fail(
                response.body === null ? 'badStatus' : 'tooLarge',
                response.status
            );
        }

        const bytes = await readCapped(
            response.body,
            maxBytes,
            declaredLength(response)
        );

        return bytes === null
            ? fail('tooLarge', response.status)
            : parseJsonBody(bytes, response.status);
    } catch (error) {
        return fail(toFailure(error, signal));
    }
};

/**
 * Fetches shop pages and images with the honest User-Agent only. Every hop is
 * re-validated, redirects are followed by hand up to five times, one deadline
 * covers all hops and the body, and no caller headers or cookies are ever
 * forwarded. `fetchJson` is the one exception: it sends the caller's headers,
 * but only to hosts on its allowlist, and refuses any hop that leaves it.
 * Failures carry only a closed failure label and the status.
 */
export const createSafeFetcher: CreateSafeFetcher = (
    fetchImpl = defaultFetch
): SafeFetcher => {
    return {
        fetchPage: (url, options) => {
            return fetchPage(fetchImpl, url, options);
        },
        fetchImage: (url, options) => {
            return fetchImage(fetchImpl, url, options);
        },
        fetchJson: (url, options) => {
            return fetchJson(fetchImpl, url, options);
        }
    };
};
