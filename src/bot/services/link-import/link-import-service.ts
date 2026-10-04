import {
    checkRateLimit,
    linkHostRateLimitKey,
    selectLinkHostLimiter
} from '../../../api/rate-limit';
import {
    LINK_IMPORT_BOT_IMAGES,
    LINK_IMPORT_HTML_MAX_BYTES,
    LINK_IMPORT_IMAGE_BUDGET_MS,
    LINK_IMPORT_PAGE_TIMEOUT_MS
} from '../../../shared/app-api';
import { isCurrency } from '../../../shared/money';
import {
    appRateLimiterMissingEvent,
    emitTelemetryEvent,
    linkImportCompletedEvent,
    type TelemetryContext,
    type TelemetryFields
} from '../../../worker/telemetry';
import {
    buildCacheEntry,
    createLinkImportCache,
    isCacheableOutcome
} from './result-cache';
import { resolveShop } from './shop';
import {
    countUnsupportedSkips,
    createImageStaging,
    type StageImagesDetailed,
    type StageImagesOutcome
} from './stage-images';
import type {
    CollectPageSignals,
    CreateSafeFetcher,
    ExtractProduct,
    ExtractedProduct,
    HashImportUrl,
    LinkImportChannel,
    LinkImportDeps,
    LinkImportOutcome,
    LinkImportResult,
    LinkImportTransform,
    LoadStagedImage,
    NormalizeImportUrl,
    NormalizedImportUrl,
    RunLinkImport,
    SafeFetchFailure,
    StageImages,
    StagedImage,
    StagedImageBody,
    ToImportedDraft
} from './types';

export interface LinkImportImplementations {
    createSafeFetcher: CreateSafeFetcher;
    collectPageSignals: CollectPageSignals;
    extractProduct: ExtractProduct;
    normalizeImportUrl: NormalizeImportUrl;
    hashImportUrl: HashImportUrl;
    emitTelemetry?: LinkImportTelemetryEmitter;
}

export type LinkImportTelemetryEmitter = (
    env: LinkImportDeps['env'],
    context: TelemetryContext,
    fields: TelemetryFields
) => void;

export interface PreviewImages {
    images: StagedImageBody[];
    staged: StagedImage[];
    skippedUnsupported: number;
}

const SAFE_FETCH_FAILURE_OUTCOMES = {
    invalidUrl: 'invalidUrl',
    blockedHost: 'invalidUrl',
    tooManyRedirects: 'notProduct',
    timeout: 'timeout',
    tooLarge: 'notProduct',
    badContentType: 'notProduct',
    blockedStatus: 'blocked',
    badStatus: 'notProduct',
    network: 'timeout'
} as const satisfies Record<SafeFetchFailure, LinkImportOutcome>;

const TELEMETRY_TRANSFORM_PRIORITY = [
    'binding',
    'passthrough',
    'missing'
] as const satisfies readonly LinkImportTransform[];

const CAPPED_TRANSFORM_LABEL: LinkImportTransform = 'missing';

type ResultFields = Omit<LinkImportResult, 'elapsedMs'>;

const toTelemetryContext = (deps: LinkImportDeps): TelemetryContext => {
    const { waitUntil } = deps;

    return waitUntil === undefined ? undefined : { waitUntil };
};

const emit = (
    deps: LinkImportDeps,
    fields: TelemetryFields,
    emitter: LinkImportTelemetryEmitter = emitTelemetryEvent
) => {
    emitter(deps.env, toTelemetryContext(deps), fields);
};

const runInBackground = async (
    deps: LinkImportDeps,
    task: Promise<unknown>
) => {
    const settled = task.catch(() => undefined);

    if (deps.waitUntil === undefined) {
        await settled;
    } else {
        deps.waitUntil(settled);
    }
};

const classifyProduct = (
    product: ExtractedProduct | null
): LinkImportOutcome => {
    if (product === null) {
        return 'notProduct';
    }

    return product.price !== null &&
        product.price > 0 &&
        product.currency !== null
        ? 'ok'
        : 'partial';
};

const toPositivePrice = (price: number | null) => {
    return price !== null && Number.isFinite(price) && price > 0 ? price : null;
};

/** Keeps `price` and `currency` only for currencies in `CURRENCIES`; any other priced currency becomes `sourcePrice`. */
export const toImportedDraft: ToImportedDraft = (product, link) => {
    const price = toPositivePrice(product?.price ?? null);
    const currency = product?.currency?.trim().toUpperCase() ?? null;
    const isOwnCurrency = price !== null && isCurrency(currency);

    return {
        title: product?.title ?? null,
        description: product?.description ?? null,
        link,
        price: isOwnCurrency ? price : null,
        currency: isOwnCurrency ? currency : null,
        sourcePrice:
            price !== null && !isOwnCurrency && currency
                ? { amount: price, currency }
                : null
    };
};

/** Picks one transform label for telemetry; a capped or missing binding reports `missing` until a `capped` label exists. */
export const pickTelemetryTransform = (
    staged: readonly StagedImage[]
): LinkImportTransform => {
    return (
        TELEMETRY_TRANSFORM_PRIORITY.find(transform => {
            return staged.some(image => {
                return image.transform === transform;
            });
        }) ?? CAPPED_TRANSFORM_LABEL
    );
};

/** Emits `link_import_completed` with closed labels only; channels call it once, after staging or ingestion finishes. */
export const reportLinkImportCompleted = (
    deps: LinkImportDeps,
    input: {
        channel: LinkImportChannel;
        result: LinkImportResult;
        staged: readonly StagedImage[];
        imagesIngested: number;
    },
    emitter?: LinkImportTelemetryEmitter
) => {
    emit(
        deps,
        linkImportCompletedEvent({
            channel: input.channel,
            result: input.result.outcome,
            source: input.result.product?.source ?? null,
            shop: input.result.shop,
            cacheOutcome: input.result.cache,
            imagesStaged: input.staged.length,
            imagesIngested: input.imagesIngested,
            elapsedMs: input.result.elapsedMs,
            transform: pickTelemetryTransform(input.staged)
        }),
        emitter
    );
};

const isHostLimited = async (
    deps: LinkImportDeps,
    normalized: NormalizedImportUrl,
    emitter: LinkImportTelemetryEmitter | undefined
) => {
    const outcome = await checkRateLimit(
        selectLinkHostLimiter(deps.env),
        linkHostRateLimitKey(normalized.registrableDomain)
    );

    if (outcome === 'missing' || outcome === 'error') {
        emit(deps, appRateLimiterMissingEvent('import', outcome), emitter);
    }

    return outcome === 'limited';
};

const readProduct = async (
    implementations: LinkImportImplementations,
    response: Response,
    finalUrl: string
) => {
    try {
        const signals = await implementations.collectPageSignals(response);

        return implementations.extractProduct(signals, finalUrl);
    } catch {
        return null;
    }
};

const createRunLinkImport = (
    implementations: LinkImportImplementations
): RunLinkImport => {
    return async (deps, request) => {
        const now = deps.now ?? Date.now;
        const startedAt = now();
        const finish = (fields: ResultFields): LinkImportResult => {
            return { ...fields, elapsedMs: Math.max(0, now() - startedAt) };
        };
        const normalized = implementations.normalizeImportUrl(request.url);

        if (normalized === null) {
            return finish({
                outcome: 'invalidUrl',
                product: null,
                normalizedUrl: null,
                host: null,
                urlHash: null,
                shop: 'other',
                cache: 'miss'
            });
        }

        const urlHash = await implementations.hashImportUrl(normalized.url);
        const located = {
            normalizedUrl: normalized.url,
            host: normalized.host,
            urlHash,
            shop: resolveShop(normalized.host)
        };
        const cache = createLinkImportCache(deps.env.IMAGES, now);
        const cached = await cache.get(urlHash);

        if (cached !== null) {
            return finish({
                ...located,
                outcome: cached.outcome,
                product: cached.product,
                cache: 'hit'
            });
        }

        if (
            await isHostLimited(deps, normalized, implementations.emitTelemetry)
        ) {
            return finish({
                ...located,
                outcome: 'rateLimited',
                product: null,
                cache: 'miss'
            });
        }

        const page = await implementations
            .createSafeFetcher(deps.fetch)
            .fetchPage(normalized.url, {
                timeoutMs: LINK_IMPORT_PAGE_TIMEOUT_MS,
                maxBytes: LINK_IMPORT_HTML_MAX_BYTES
            });
        const product = page.ok
            ? await readProduct(
                  implementations,
                  page.value.response,
                  page.value.finalUrl
              )
            : null;
        const outcome = page.ok
            ? classifyProduct(product)
            : SAFE_FETCH_FAILURE_OUTCOMES[page.failure];

        if (isCacheableOutcome(outcome)) {
            await runInBackground(
                deps,
                cache.put(
                    urlHash,
                    buildCacheEntry({
                        outcome,
                        normalizedUrl: normalized.url,
                        product,
                        storedAt: now()
                    })
                )
            );
        }

        return finish({ ...located, outcome, product, cache: 'miss' });
    };
};

const firstIndexes = (count: number, limit: number) => {
    return Array.from({ length: Math.min(count, limit) }, (_, index) => {
        return index;
    });
};

const createPreparePreviewImages = (
    stageImagesDetailed: StageImagesDetailed,
    loadStagedImage: LoadStagedImage
) => {
    return async (
        deps: LinkImportDeps,
        result: LinkImportResult,
        limit: number = LINK_IMPORT_BOT_IMAGES
    ): Promise<PreviewImages> => {
        const { product, urlHash } = result;

        if (product === null || urlHash === null) {
            return { images: [], staged: [], skippedUnsupported: 0 };
        }

        const outcome: StageImagesOutcome = await stageImagesDetailed(deps, {
            urlHash,
            imageUrls: product.images,
            indexes: firstIndexes(product.images.length, limit),
            budgetMs: LINK_IMPORT_IMAGE_BUDGET_MS
        });
        const bodies = await Promise.all(
            outcome.staged.map(image => {
                return loadStagedImage(deps, { urlHash, index: image.index });
            })
        );

        return {
            images: bodies.filter((body): body is StagedImageBody => {
                return body !== null;
            }),
            staged: outcome.staged,
            skippedUnsupported: countUnsupportedSkips(outcome)
        };
    };
};

/**
 * Wires the link import pipeline from WP2's fetch and extract functions:
 * `run` is the cache, host limiter, fetch and extract orchestrator;
 * `stageImages`/`loadStagedImage` stage and serve images under
 * `import/<urlHash>/`; `preparePreviewImages` stages and loads the bot's
 * preview images. Telemetry is left to the channel through
 * `reportLinkImportCompleted`, so each import is counted once.
 */
export const createLinkImportServices = (
    implementations: LinkImportImplementations
) => {
    const staging = createImageStaging(implementations.createSafeFetcher);
    const stageImages: StageImages = staging.stageImages;

    return {
        run: createRunLinkImport(implementations),
        stageImages,
        stageImagesDetailed: staging.stageImagesDetailed,
        loadStagedImage: staging.loadStagedImage,
        toImportedDraft,
        preparePreviewImages: createPreparePreviewImages(
            staging.stageImagesDetailed,
            staging.loadStagedImage
        )
    };
};

export type LinkImportServiceSet = ReturnType<typeof createLinkImportServices>;
