import {
    APP_UPLOAD_CONTENT_TYPES,
    LINK_IMPORT_IMAGE_MAX_BYTES,
    LINK_IMPORT_IMAGE_TIMEOUT_MS,
    LINK_IMPORT_MAX_IMAGE_CANDIDATES,
    type AppUploadContentType
} from '../../../shared/app-api';
import {
    sniffImageType,
    type SniffedImageType
} from '../../../api/photos/image-signature';
import { normalizeImageContentType } from '../../../api/photos/image-store';
import {
    checkRateLimit,
    linkHostRateLimitKey,
    selectLinkHostLimiter
} from '../../../api/rate-limit';
import { registrableDomain } from './normalize-url';
import { readCacheEntry } from './result-cache';
import { EXPIRES_AT_METADATA_KEY, importImageKey } from './storage-keys';
import type {
    CreateSafeFetcher,
    LinkImportDeps,
    LoadStagedImage,
    SafeFetcher,
    StageImages,
    StageImagesInput,
    StageImagesOutcome,
    StagedImage,
    StagedImageBody,
    StagingSkipReason
} from './types';

export const LINK_IMPORT_STAGING_CONCURRENCY = 3;

const MILLISECONDS_PER_SECOND = 1000;
const STAGED_IMAGE_TTL_SECONDS = 24 * 60 * 60;

interface StagingContext {
    bucket: R2Bucket | undefined;
    fetcher: SafeFetcher;
    now: () => number;
    deadline: number;
    isHostAllowed: (imageUrl: string) => Promise<boolean>;
}

type ImageAttempt =
    | { kind: 'staged'; image: StagedImage; body: StagedImageBody | null }
    | { kind: 'skipped'; reason: StagingSkipReason };

const FAILED: ImageAttempt = { kind: 'skipped', reason: 'failed' };
const FAILED_LOAD = { skipped: 'failed' } as const;

const isTelegramPhotoType = (
    type: SniffedImageType | null
): type is AppUploadContentType => {
    return APP_UPLOAD_CONTENT_TYPES.some(contentType => {
        return contentType === type;
    });
};

export const isStagedImageIndex = (index: number) => {
    return (
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index < LINK_IMPORT_MAX_IMAGE_CANDIDATES
    );
};

/** Telegram photos are JPEG, PNG or WebP up to its multipart limit; anything else is never staged. */
const toTelegramPhotoType = (bytes: ArrayBuffer) => {
    const type = sniffImageType(bytes);

    return isTelegramPhotoType(type) &&
        bytes.byteLength > 0 &&
        bytes.byteLength <= LINK_IMPORT_IMAGE_MAX_BYTES
        ? type
        : null;
};

const readStagedHead = async (
    bucket: R2Bucket,
    urlHash: string,
    index: number
): Promise<StagedImage | null> => {
    const head = await bucket.head(importImageKey(urlHash, index));
    const contentType = normalizeImageContentType(
        head?.httpMetadata?.contentType
    );

    if (head === null || contentType === null) {
        return null;
    }

    return { index, contentType, bytes: head.size };
};

const storeImage = async (
    context: StagingContext & { bucket: R2Bucket },
    urlHash: string,
    index: number,
    image: StagedImageBody
) => {
    await context.bucket.put(importImageKey(urlHash, index), image.body, {
        httpMetadata: { contentType: image.contentType },
        customMetadata: {
            [EXPIRES_AT_METADATA_KEY]: String(
                context.now() +
                    STAGED_IMAGE_TTL_SECONDS * MILLISECONDS_PER_SECOND
            )
        }
    });
};

export type DownloadedPhoto =
    | { ok: true; image: StagedImageBody }
    | { ok: false; reason: StagingSkipReason };

/**
 * Downloads one image through the safe fetcher and keeps it only when it is a
 * photo Telegram accepts: JPEG, PNG or WebP by its magic bytes and at most
 * 10 MiB. A too-large or unrecognized image is `unsupportedFormat`; a failed
 * download is `failed`.
 */
export const downloadTelegramPhoto = async (
    fetcher: SafeFetcher,
    imageUrl: string,
    timeoutMs: number = LINK_IMPORT_IMAGE_TIMEOUT_MS
): Promise<DownloadedPhoto> => {
    try {
        const fetched = await fetcher.fetchImage(imageUrl, {
            timeoutMs,
            maxBytes: LINK_IMPORT_IMAGE_MAX_BYTES
        });

        if (!fetched.ok) {
            return {
                ok: false,
                reason:
                    fetched.failure === 'tooLarge'
                        ? 'unsupportedFormat'
                        : 'failed'
            };
        }

        const { bytes } = fetched.value;
        const contentType = toTelegramPhotoType(bytes);

        return contentType === null
            ? { ok: false, reason: 'unsupportedFormat' }
            : { ok: true, image: { body: bytes, contentType } };
    } catch {
        return { ok: false, reason: 'failed' };
    }
};

const stageOne = async (
    context: StagingContext,
    urlHash: string,
    index: number,
    imageUrl: string | undefined
): Promise<ImageAttempt> => {
    const { bucket } = context;

    if (bucket === undefined || imageUrl === undefined) {
        return FAILED;
    }

    try {
        const existing = await readStagedHead(bucket, urlHash, index);

        if (existing !== null) {
            return { kind: 'staged', image: existing, body: null };
        }

        const remainingMs = context.deadline - context.now();

        if (remainingMs <= 0 || !(await context.isHostAllowed(imageUrl))) {
            return FAILED;
        }

        const downloaded = await downloadTelegramPhoto(
            context.fetcher,
            imageUrl,
            Math.min(LINK_IMPORT_IMAGE_TIMEOUT_MS, remainingMs)
        );

        if (!downloaded.ok) {
            return { kind: 'skipped', reason: downloaded.reason };
        }

        const body = downloaded.image;

        await storeImage({ ...context, bucket }, urlHash, index, body);

        return {
            kind: 'staged',
            image: {
                index,
                contentType: body.contentType,
                bytes: body.body.byteLength
            },
            body
        };
    } catch {
        return FAILED;
    }
};

const runPool = async <Result>(
    items: readonly number[],
    concurrency: number,
    worker: (item: number) => Promise<Result>
) => {
    const results: Result[] = [];
    let next = 0;

    const drain = async () => {
        while (next < items.length) {
            const position = next;

            next += 1;
            results[position] = await worker(items[position] as number);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, drain)
    );

    return results;
};

const selectIndexes = (input: StageImagesInput) => {
    const available = Math.min(
        input.imageUrls.length,
        LINK_IMPORT_MAX_IMAGE_CANDIDATES
    );

    return [...new Set(input.indexes)].filter(index => {
        return isStagedImageIndex(index) && index < available;
    });
};

/** Serves a staged image straight from R2 without re-staging; null on a miss or any R2 failure. */
export const readStagedImage = async (
    bucket: R2Bucket | undefined,
    urlHash: string,
    index: number
): Promise<StagedImageBody | null> => {
    if (bucket === undefined || !isStagedImageIndex(index)) {
        return null;
    }

    try {
        const object = await bucket.get(importImageKey(urlHash, index));
        const contentType = normalizeImageContentType(
            object?.httpMetadata?.contentType
        );

        if (object === null || contentType === null) {
            return null;
        }

        return { body: await object.arrayBuffer(), contentType };
    } catch {
        return null;
    }
};

export const countUnsupportedSkips = (outcome: StageImagesOutcome) => {
    return outcome.skipped.filter(skipped => {
        return skipped.reason === 'unsupportedFormat';
    }).length;
};

/**
 * Downloads shop images through the injected safe fetcher and stores them at
 * `import/<urlHash>/<n>` unchanged. Nothing is transcoded: only JPEG, PNG and
 * WebP up to Telegram's 10 MiB multipart limit are kept, and every other image
 * is skipped as `unsupportedFormat`.
 */
const imageHostDomain = (imageUrl: string) => {
    try {
        return registrableDomain(new URL(imageUrl).hostname);
    } catch {
        return null;
    }
};

const createHostGate = (deps: LinkImportDeps) => {
    const decisions = new Map<string, Promise<boolean>>();
    const limiter = selectLinkHostLimiter(deps.env);

    return (imageUrl: string) => {
        const domain = imageHostDomain(imageUrl);

        if (domain === null) {
            return Promise.resolve(false);
        }

        const known = decisions.get(domain);

        if (known !== undefined) {
            return known;
        }

        const decision = checkRateLimit(
            limiter,
            linkHostRateLimitKey(domain)
        ).then(outcome => {
            return outcome !== 'limited';
        });

        decisions.set(domain, decision);

        return decision;
    };
};

export const createImageStaging = (createSafeFetcher: CreateSafeFetcher) => {
    const createContext = (
        deps: LinkImportDeps,
        budgetMs: number
    ): StagingContext => {
        const now = deps.now ?? Date.now;

        return {
            bucket: deps.env.IMAGES,
            fetcher: createSafeFetcher(deps.fetch),
            now,
            deadline: now() + budgetMs,
            isHostAllowed: createHostGate(deps)
        };
    };

    const stageImages: StageImages = async (deps, input) => {
        const context = createContext(deps, input.budgetMs);
        const indexes = selectIndexes(input);
        const attempts = await runPool(
            indexes,
            LINK_IMPORT_STAGING_CONCURRENCY,
            index => {
                return stageOne(
                    context,
                    input.urlHash,
                    index,
                    input.imageUrls[index]
                );
            }
        );
        const outcome: StageImagesOutcome = { staged: [], skipped: [] };
        const bodies = new Map<number, StagedImageBody>();

        attempts.forEach((attempt, position) => {
            const index = indexes[position] as number;

            if (attempt.kind === 'skipped') {
                outcome.skipped.push({ index, reason: attempt.reason });

                return;
            }

            outcome.staged.push(attempt.image);

            if (input.keepBodies === true && attempt.body !== null) {
                bodies.set(index, attempt.body);
            }
        });

        return input.keepBodies === true ? { ...outcome, bodies } : outcome;
    };

    const loadStagedImage: LoadStagedImage = async (deps, input) => {
        const stored = await readStagedImage(
            deps.env.IMAGES,
            input.urlHash,
            input.index
        );

        if (stored !== null) {
            return stored;
        }

        const entry = isStagedImageIndex(input.index)
            ? await readCacheEntry(deps.env.IMAGES, input.urlHash)
            : null;
        const imageUrl = entry?.product?.images[input.index];

        if (imageUrl === undefined) {
            return FAILED_LOAD;
        }

        const attempt = await stageOne(
            createContext(deps, LINK_IMPORT_IMAGE_TIMEOUT_MS),
            input.urlHash,
            input.index,
            imageUrl
        );

        if (attempt.kind === 'skipped') {
            return { skipped: attempt.reason };
        }

        return (
            attempt.body ??
            (await readStagedImage(
                deps.env.IMAGES,
                input.urlHash,
                input.index
            )) ??
            FAILED_LOAD
        );
    };

    return { stageImages, loadStagedImage };
};

export type ImageStaging = ReturnType<typeof createImageStaging>;
