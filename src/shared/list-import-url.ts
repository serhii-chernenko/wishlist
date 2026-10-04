import type {
    ListImportKind,
    ListImportSource,
    ListImportVisibility
} from './app-api';

export const REWISH_HOSTS: readonly string[] = ['rewish.io', 'www.rewish.io'];

export const LIST_IMPORT_URL_MAX_LENGTH = 512;

const REWISH_ORIGIN = 'https://rewish.io';
const ACCESS_CODE_PARAMETER = 'access_code';
const HTTP_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const EXPLICIT_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const SLUG_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;
const COLLECTION_ID_PATTERN = /^[1-9]\d{0,11}$/;
const ACCESS_CODE_PATTERN = /^[A-Za-z0-9~._-]{1,64}$/;
const WISHES_SEGMENT = 'wishes';
const COLLECTION_SEGMENT = 'collection';

export interface ParsedListUrl {
    source: ListImportSource;
    kind: ListImportKind;
    slug: string;
    collectionId?: number;
    accessCode?: string;
    url: string;
}

const toUrl = (raw: string): URL | null => {
    const withScheme = EXPLICIT_SCHEME_PATTERN.test(raw)
        ? raw
        : `https://${raw}`;

    try {
        return new URL(withScheme);
    } catch {
        return null;
    }
};

const isPlainRewishUrl = (url: URL) => {
    return (
        HTTP_PROTOCOLS.has(url.protocol) &&
        REWISH_HOSTS.includes(url.hostname) &&
        url.port === '' &&
        url.username === '' &&
        url.password === ''
    );
};

const readSegments = (url: URL): string[] | null => {
    const segments = url.pathname.replace(/\/+$/, '').split('/').slice(1);

    return segments.includes('') ? null : segments;
};

const readAccessCode = (url: URL): string | null | undefined => {
    const accessCode = url.searchParams.get(ACCESS_CODE_PARAMETER);

    if (accessCode === null) {
        return undefined;
    }

    return ACCESS_CODE_PATTERN.test(accessCode) ? accessCode : null;
};

const buildCanonicalUrl = (
    slug: string,
    collectionId: number | undefined,
    accessCode: string | undefined
) => {
    const path =
        collectionId === undefined
            ? `/${slug}/${WISHES_SEGMENT}`
            : `/${slug}/${COLLECTION_SEGMENT}/${collectionId}`;
    const query =
        accessCode === undefined
            ? ''
            : `?${ACCESS_CODE_PARAMETER}=${encodeURIComponent(accessCode)}`;

    return `${REWISH_ORIGIN}${path}${query}`;
};

const toParsedUrl = (
    slug: string,
    collectionId: number | undefined,
    accessCode: string | undefined
): ParsedListUrl => {
    return {
        source: 'rewish',
        kind: collectionId === undefined ? 'wishes' : 'collection',
        slug,
        ...(collectionId === undefined ? {} : { collectionId }),
        ...(accessCode === undefined ? {} : { accessCode }),
        url: buildCanonicalUrl(slug, collectionId, accessCode)
    };
};

/**
 * Recognizes a rewish.io share link: `/<slug>`, `/<slug>/wishes` or
 * `/<slug>/collection/<id>`, with an optional `access_code`. A missing scheme
 * or `http:` is upgraded to `https:`, every other query parameter and the hash
 * are dropped, and `url` is the canonical form that is safe to store.
 */
export const parseListImportUrl = (raw: string): ParsedListUrl | null => {
    const trimmed = raw.trim();

    if (trimmed === '' || trimmed.length > LIST_IMPORT_URL_MAX_LENGTH) {
        return null;
    }

    const url = toUrl(trimmed);

    if (url === null || !isPlainRewishUrl(url)) {
        return null;
    }

    const segments = readSegments(url);
    const accessCode = readAccessCode(url);

    if (segments === null || accessCode === null) {
        return null;
    }

    const [slug, section, collectionId, ...rest] = segments;

    if (
        slug === undefined ||
        !SLUG_PATTERN.test(slug) ||
        rest.length > 0 ||
        (section !== undefined &&
            section !== WISHES_SEGMENT &&
            section !== COLLECTION_SEGMENT)
    ) {
        return null;
    }

    if (section === COLLECTION_SEGMENT) {
        return collectionId !== undefined &&
            COLLECTION_ID_PATTERN.test(collectionId)
            ? toParsedUrl(slug, Number(collectionId), accessCode)
            : null;
    }

    return collectionId === undefined
        ? toParsedUrl(slug, undefined, accessCode)
        : null;
};

export const suggestListImportVisibility = (
    parsed: Pick<ParsedListUrl, 'accessCode'>
): ListImportVisibility => {
    return parsed.accessCode === undefined ? 'public' : 'hidden';
};

/** Rewish keeps "saved" wishes hidden even from an access-code link, so a profile link with a code cannot return them. */
export const hasSavedWishesNote = (
    parsed: Pick<ParsedListUrl, 'kind' | 'accessCode'>
): boolean => {
    return parsed.kind === 'wishes' && parsed.accessCode !== undefined;
};
