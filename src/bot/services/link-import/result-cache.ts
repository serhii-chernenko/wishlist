import {
    LINK_IMPORT_CACHE_TTL_SECONDS,
    LINK_IMPORT_NEGATIVE_CACHE_TTL_SECONDS,
    LINK_IMPORT_SOURCES
} from '../../../shared/app-api';
import {
    EXPIRES_AT_METADATA_KEY,
    expiryMetadata,
    importMetaKey
} from './storage-keys';
import {
    LINK_IMPORT_R2_PREFIX,
    type ExtractedProduct,
    type LinkImportCache,
    type LinkImportCacheEntry,
    type LinkImportCacheableOutcome
} from './types';

const MILLISECONDS_PER_SECOND = 1000;
const CACHE_ENTRY_VERSION = 1;
const JSON_CONTENT_TYPE = 'application/json';
const R2_DELETE_BATCH_SIZE = 1000;
const PURGE_MAX_LIST_PAGES = 100;

export const LINK_IMPORT_CACHEABLE_OUTCOMES = [
    'ok',
    'partial',
    'blocked',
    'notProduct'
] as const satisfies readonly LinkImportCacheableOutcome[];

const POSITIVE_OUTCOMES: ReadonlySet<LinkImportCacheableOutcome> = new Set([
    'ok',
    'partial'
]);

export const isCacheableOutcome = (
    outcome: string
): outcome is LinkImportCacheableOutcome => {
    return LINK_IMPORT_CACHEABLE_OUTCOMES.some(cacheable => {
        return cacheable === outcome;
    });
};

export const getCacheTtlMs = (outcome: LinkImportCacheableOutcome) => {
    const seconds = POSITIVE_OUTCOMES.has(outcome)
        ? LINK_IMPORT_CACHE_TTL_SECONDS
        : LINK_IMPORT_NEGATIVE_CACHE_TTL_SECONDS;

    return seconds * MILLISECONDS_PER_SECOND;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const isNullableString = (value: unknown) => {
    return value === null || typeof value === 'string';
};

const isStringArray = (value: unknown): value is string[] => {
    return (
        Array.isArray(value) &&
        value.every(item => {
            return typeof item === 'string';
        })
    );
};

const isProduct = (value: unknown): value is ExtractedProduct => {
    return (
        isRecord(value) &&
        typeof value.title === 'string' &&
        isNullableString(value.description) &&
        (value.price === null || typeof value.price === 'number') &&
        isNullableString(value.currency) &&
        isStringArray(value.images) &&
        LINK_IMPORT_SOURCES.some(source => {
            return source === value.source;
        }) &&
        isNullableString(value.canonicalUrl) &&
        typeof value.finalUrl === 'string'
    );
};

const isCacheEntry = (value: unknown): value is LinkImportCacheEntry => {
    return (
        isRecord(value) &&
        value.version === CACHE_ENTRY_VERSION &&
        typeof value.outcome === 'string' &&
        isCacheableOutcome(value.outcome) &&
        typeof value.normalizedUrl === 'string' &&
        (value.product === null || isProduct(value.product)) &&
        typeof value.storedAt === 'number' &&
        typeof value.expiresAt === 'number'
    );
};

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

const logCacheFailure = (
    operation: 'get' | 'put' | 'purge',
    error: unknown
) => {
    console.warn(
        JSON.stringify({
            event: 'link_import_cache_failed',
            operation,
            errorType: getErrorType(error)
        })
    );
};

/** Reads the stored entry whether or not it has expired; staging uses it to re-stage images for a still-valid import token. */
export const readCacheEntry = async (
    bucket: R2Bucket | undefined,
    urlHash: string
): Promise<LinkImportCacheEntry | null> => {
    if (bucket === undefined) {
        return null;
    }

    try {
        const object = await bucket.get(importMetaKey(urlHash));

        if (object === null) {
            return null;
        }

        const parsed: unknown = JSON.parse(await object.text());

        return isCacheEntry(parsed) ? parsed : null;
    } catch (error) {
        logCacheFailure('get', error);

        return null;
    }
};

export const buildCacheEntry = (input: {
    outcome: LinkImportCacheableOutcome;
    normalizedUrl: string;
    product: ExtractedProduct | null;
    storedAt: number;
}): LinkImportCacheEntry => {
    return {
        version: CACHE_ENTRY_VERSION,
        outcome: input.outcome,
        normalizedUrl: input.normalizedUrl,
        product: input.product,
        storedAt: input.storedAt,
        expiresAt: input.storedAt + getCacheTtlMs(input.outcome)
    };
};

const readExpiresAt = (object: R2Object) => {
    const stored = Number(object.customMetadata?.[EXPIRES_AT_METADATA_KEY]);

    if (Number.isFinite(stored)) {
        return stored;
    }

    return (
        object.uploaded.getTime() +
        LINK_IMPORT_CACHE_TTL_SECONDS * MILLISECONDS_PER_SECOND
    );
};

const deleteKeys = async (bucket: R2Bucket, keys: readonly string[]) => {
    for (let start = 0; start < keys.length; start += R2_DELETE_BATCH_SIZE) {
        await bucket.delete(keys.slice(start, start + R2_DELETE_BATCH_SIZE));
    }
};

const listExpiredKeys = async (bucket: R2Bucket, now: number) => {
    const expired: string[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < PURGE_MAX_LIST_PAGES; page += 1) {
        const listed = await bucket.list({
            prefix: LINK_IMPORT_R2_PREFIX,
            include: ['customMetadata'],
            ...(cursor === undefined ? {} : { cursor })
        });

        for (const object of listed.objects) {
            if (readExpiresAt(object) <= now) {
                expired.push(object.key);
            }
        }

        if (!listed.truncated) {
            break;
        }

        cursor = listed.cursor;
    }

    return expired;
};

/**
 * The link import result cache lives in the `IMAGES` bucket under
 * `import/<urlHash>/meta.json`. Every object under `import/` carries an
 * `expiresAt` custom metadata value, so the daily purge needs only a listing.
 * A missing bucket or any R2 failure degrades to a miss.
 */
export const createLinkImportCache = (
    bucket: R2Bucket | undefined,
    now: () => number = Date.now
): LinkImportCache => {
    return {
        async get(urlHash) {
            const entry = await readCacheEntry(bucket, urlHash);

            return entry !== null && entry.expiresAt > now() ? entry : null;
        },
        async put(urlHash, entry) {
            if (bucket === undefined) {
                return;
            }

            try {
                await bucket.put(
                    importMetaKey(urlHash),
                    JSON.stringify(entry),
                    {
                        httpMetadata: { contentType: JSON_CONTENT_TYPE },
                        customMetadata: expiryMetadata(entry.expiresAt)
                    }
                );
            } catch (error) {
                logCacheFailure('put', error);
            }
        },
        async purgeExpired(purgeAt) {
            if (bucket === undefined) {
                return 0;
            }

            try {
                const expired = await listExpiredKeys(bucket, purgeAt);

                await deleteKeys(bucket, expired);

                return expired.length;
            } catch (error) {
                logCacheFailure('purge', error);

                return 0;
            }
        }
    };
};
