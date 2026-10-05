import {
    LIST_IMPORT_CALL_TIMEOUT_MS,
    LIST_IMPORT_JSON_MAX_BYTES,
    LIST_IMPORT_MAX_LISTS
} from '../../../../shared/app-api';
import type { ParsedListUrl } from '../../../../shared/list-import-url';
import type { SafeFetchFailure } from '../../link-import/types';
import type { ListImportFailure, SourceFetchContext } from '../types';
import {
    parseCollection,
    parseLists,
    parseUser,
    parseWishes,
    readEnvelope,
    type RewishCollection,
    type RewishParsed,
    type RewishWish
} from './schema';

export const REWISH_API_HOST = 'rewish.io';
export const REWISH_API_HOSTS: readonly string[] = [REWISH_API_HOST];

const REWISH_API_BASE = `https://${REWISH_API_HOST}/public/api`;
const SYSTEM_CODE = 'ReWish-Web';
const ACCESS_CODE_PARAMETER = 'access_code';

const SAFE_FETCH_OUTCOMES = {
    invalidUrl: 'upstream',
    blockedHost: 'upstream',
    tooManyRedirects: 'upstream',
    timeout: 'timeout',
    tooLarge: 'upstream',
    badContentType: 'upstream',
    blockedStatus: 'upstream',
    badStatus: 'upstream',
    network: 'timeout'
} as const satisfies Record<SafeFetchFailure, ListImportFailure>;

const TIMEOUT = { ok: false, outcome: 'timeout' } as const;
const RATE_LIMITED = { ok: false, outcome: 'rateLimited' } as const;

export interface RewishProfile {
    lists: { id: number; wishes: RewishWish[] }[];
}

const buildUrl = (
    path: string,
    query: Readonly<Record<string, string | number | undefined>>
) => {
    const url = new URL(`${REWISH_API_BASE}${path}`);

    for (const [name, value] of Object.entries(query)) {
        if (value !== undefined) {
            url.searchParams.set(name, String(value));
        }
    }

    return url.href;
};

const getJson = async <Value>(
    context: SourceFetchContext,
    url: string,
    parse: (value: unknown) => RewishParsed<Value>
): Promise<RewishParsed<Value>> => {
    const remainingMs = context.deadlineAt - context.now();

    if (remainingMs <= 0) {
        return TIMEOUT;
    }

    const fetched = await context.fetcher.fetchJson(url, {
        allowedHosts: REWISH_API_HOSTS,
        timeoutMs: Math.min(LIST_IMPORT_CALL_TIMEOUT_MS, remainingMs),
        maxBytes: LIST_IMPORT_JSON_MAX_BYTES,
        headers: {
            'X-Systemcode': SYSTEM_CODE,
            'X-Flow-Id': context.createFlowId()
        }
    });

    if (!fetched.ok) {
        return { ok: false, outcome: SAFE_FETCH_OUTCOMES[fetched.failure] };
    }

    const envelope = readEnvelope(fetched.value);

    return envelope.ok ? parse(envelope.value) : envelope;
};

const takeHostToken = async (context: SourceFetchContext) => {
    return context.acquireHostToken(REWISH_API_HOST);
};

/**
 * A profile link: the user by slug, their wish lists (at most
 * `LIST_IMPORT_MAX_LISTS`, in API order), then every list's wishes. The access
 * code rides along on every call when the link has one.
 */
export const fetchRewishProfile = async (
    context: SourceFetchContext,
    url: ParsedListUrl
): Promise<RewishParsed<RewishProfile>> => {
    if (!(await takeHostToken(context))) {
        return RATE_LIMITED;
    }

    const access = { [ACCESS_CODE_PARAMETER]: url.accessCode };
    const user = await getJson(
        context,
        buildUrl(`/user/by-code/${encodeURIComponent(url.slug)}`, access),
        parseUser
    );

    if (!user.ok) {
        return user;
    }

    const lists = await getJson(
        context,
        buildUrl(`/re-wish/${encodeURIComponent(user.value.id)}`, access),
        parseLists
    );

    if (!lists.ok) {
        return lists;
    }

    const profile: RewishProfile = { lists: [] };

    for (const list of lists.value.slice(0, LIST_IMPORT_MAX_LISTS)) {
        const wishes = await getJson(
            context,
            buildUrl('/wish/by-rewish-id', { rewish_id: list.id, ...access }),
            parseWishes
        );

        if (!wishes.ok) {
            return wishes;
        }

        profile.lists.push({ id: list.id, wishes: wishes.value });
    }

    return { ok: true, value: profile };
};

export const fetchRewishCollection = async (
    context: SourceFetchContext,
    url: ParsedListUrl
): Promise<RewishParsed<RewishCollection>> => {
    if (url.collectionId === undefined) {
        return { ok: false, outcome: 'invalidUrl' };
    }

    if (!(await takeHostToken(context))) {
        return RATE_LIMITED;
    }

    return getJson(
        context,
        buildUrl('/collection/get-by-id', {
            id: url.collectionId,
            user_code: url.slug,
            [ACCESS_CODE_PARAMETER]: url.accessCode
        }),
        parseCollection
    );
};
