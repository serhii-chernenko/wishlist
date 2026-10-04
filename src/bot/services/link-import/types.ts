import type { TelegramApi } from '../../../api/telegram-api';
import type {
    AppUploadContentType,
    LinkImportDraftDto,
    LinkImportOutcome,
    LinkImportShop,
    LinkImportSource,
    LinkImportSourcePriceDto
} from '../../../shared/app-api';
import type { WorkerBindings } from '../../../worker/env';

export type { LinkImportOutcome, LinkImportShop, LinkImportSource };

export const LINK_IMPORT_R2_PREFIX = 'import/';

export type LinkImportChannel = 'app' | 'bot';

export interface ItemPropSignal {
    prop: string;
    content: string | null;
    text: string | null;
    inOffer: boolean;
}

/**
 * What the HTMLRewriter collector reads from a page. `meta` is keyed by the
 * lowercased `property` or `name` attribute and keeps every value in document
 * order (`og:image` repeats). `content` of an item property is its `content`,
 * `src` or `href` attribute; `text` is its concatenated text.
 */
export interface PageSignals {
    jsonLd: string[];
    meta: Record<string, string[]>;
    itemprops: ItemPropSignal[];
    canonical: string | null;
    titleTag: string | null;
    baseHref: string | null;
    truncated: boolean;
}

/**
 * The only place shop URLs travel besides the request itself. `currency` is the
 * raw upper-case ISO code from the page; whether it is one of ours is decided
 * by `ImportedWishDraft`. A product without a title is never produced.
 */
export interface ExtractedProduct {
    title: string;
    description: string | null;
    price: number | null;
    currency: string | null;
    images: string[];
    source: LinkImportSource;
    canonicalUrl: string | null;
    finalUrl: string;
}

export type CollectPageSignals = (response: Response) => Promise<PageSignals>;

export type ExtractProduct = (
    signals: PageSignals,
    finalUrl: string
) => ExtractedProduct | null;

export interface NormalizedImportUrl {
    url: string;
    host: string;
    registrableDomain: string;
}

export type NormalizeImportUrl = (raw: string) => NormalizedImportUrl | null;

export type HashImportUrl = (normalizedUrl: string) => Promise<string>;

export type ResolveShop = (host: string) => LinkImportShop;

/**
 * `invalidUrl` and `blockedHost` map to the `invalidUrl` outcome, `timeout` and
 * `network` to `timeout`, `blockedStatus` (401, 403, 429, 451 or a bot-wall
 * header) to `blocked`, and everything else to `notProduct`.
 */
export const SAFE_FETCH_FAILURES = [
    'invalidUrl',
    'blockedHost',
    'tooManyRedirects',
    'timeout',
    'tooLarge',
    'badContentType',
    'blockedStatus',
    'badStatus',
    'network'
] as const;

export type SafeFetchFailure = (typeof SAFE_FETCH_FAILURES)[number];

export type SafeFetchResult<Value> =
    | { ok: true; value: Value }
    | { ok: false; failure: SafeFetchFailure; status: number | null };

export interface FetchedPage {
    finalUrl: string;
    response: Response;
}

export interface FetchedImage {
    finalUrl: string;
    bytes: ArrayBuffer;
    contentType: string;
}

export interface SafeFetchOptions {
    timeoutMs?: number;
    maxBytes?: number;
}

export interface SafeFetcher {
    fetchPage(
        url: string,
        options?: SafeFetchOptions
    ): Promise<SafeFetchResult<FetchedPage>>;
    fetchImage(
        url: string,
        options?: SafeFetchOptions
    ): Promise<SafeFetchResult<FetchedImage>>;
}

export type CreateSafeFetcher = (fetchImpl?: typeof fetch) => SafeFetcher;

export interface LinkImportDeps {
    env: WorkerBindings;
    fetch?: typeof fetch;
    now?: () => number;
    waitUntil?: (promise: Promise<unknown>) => void;
}

export type LinkImportCacheableOutcome = Extract<
    LinkImportOutcome,
    'ok' | 'partial' | 'blocked' | 'notProduct'
>;

export interface LinkImportCacheEntry {
    version: 1;
    outcome: LinkImportCacheableOutcome;
    normalizedUrl: string;
    product: ExtractedProduct | null;
    storedAt: number;
    expiresAt: number;
}

export interface LinkImportCache {
    get(urlHash: string): Promise<LinkImportCacheEntry | null>;
    put(urlHash: string, entry: LinkImportCacheEntry): Promise<void>;
    purgeExpired(now: number): Promise<number>;
}

export interface StagedImage {
    index: number;
    contentType: AppUploadContentType;
    bytes: number;
}

export interface StagedImageBody {
    body: ArrayBuffer;
    contentType: AppUploadContentType;
}

export interface StageImagesInput {
    urlHash: string;
    imageUrls: readonly string[];
    indexes: readonly number[];
    budgetMs: number;
}

/**
 * `unsupportedFormat`: the image is not JPEG, PNG or WebP by its magic bytes,
 * is larger than Telegram accepts, or Telegram refused it. `failed`: it could
 * not be downloaded or stored.
 */
export type StagingSkipReason = 'unsupportedFormat' | 'failed';

export interface SkippedImage {
    index: number;
    reason: StagingSkipReason;
}

export interface StageImagesOutcome {
    staged: StagedImage[];
    skipped: SkippedImage[];
}

export interface SkippedStagedImage {
    skipped: StagingSkipReason;
}

export type LoadedStagedImage = StagedImageBody | SkippedStagedImage;

export const isSkippedStagedImage = (
    image: LoadedStagedImage
): image is SkippedStagedImage => {
    return 'skipped' in image;
};

export type StageImages = (
    deps: LinkImportDeps,
    input: StageImagesInput
) => Promise<StageImagesOutcome>;

/** Serves a staged image from R2 and re-stages it from the cached entry on a miss. */
export type LoadStagedImage = (
    deps: LinkImportDeps,
    input: { urlHash: string; index: number }
) => Promise<LoadedStagedImage>;

export type ImportedWishDraft = LinkImportDraftDto & {
    sourcePrice: LinkImportSourcePriceDto | null;
};

/** Keeps `price` and `currency` only for currencies in `CURRENCIES`; any other price becomes `sourcePrice`. */
export type ToImportedDraft = (
    product: ExtractedProduct | null,
    link: string
) => ImportedWishDraft;

export interface LinkImportRequest {
    url: string;
    channel: LinkImportChannel;
}

/**
 * `ok`: a title and a positive price with a currency. `partial`: a title
 * without a usable price. `notProduct`: nothing usable on the page. `blocked`:
 * the shop refused or walled the request. `timeout`: the page budget ran out
 * or the network failed. `invalidUrl`: the link failed validation. `rateLimited`:
 * the per-host limiter refused. The per-user limiter is the caller's job.
 */
export interface LinkImportResult {
    outcome: LinkImportOutcome;
    product: ExtractedProduct | null;
    normalizedUrl: string | null;
    host: string | null;
    urlHash: string | null;
    shop: LinkImportShop;
    cache: 'hit' | 'miss';
    elapsedMs: number;
}

export type RunLinkImport = (
    deps: LinkImportDeps,
    request: LinkImportRequest
) => Promise<LinkImportResult>;

export interface ImportPreviewInput {
    chatId: number;
    html: string;
    replyMarkup?: unknown;
    images: readonly StagedImageBody[];
}

/** `fileIds` follow the order of `images`, minus the `rejected` ones Telegram refused with a 400. */
export interface ImportPreviewResult {
    fileIds: string[];
    rejected: number;
    textDelivered: boolean;
}

export type SendImportPreview = (
    api: TelegramApi,
    input: ImportPreviewInput
) => Promise<ImportPreviewResult>;

export interface ImportTokenClaims {
    userId: number;
    urlHash: string;
    expiresAt: number;
}

export interface ImportImageClaims extends ImportTokenClaims {
    index: number;
}
