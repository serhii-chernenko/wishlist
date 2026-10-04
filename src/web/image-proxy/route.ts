import type { Context } from 'hono';

import { sha256Hex } from '../../api/auth/crypto';
import {
    createSigner,
    VIEWER_IMAGE_AUDIENCE_PARAM,
    type ImageAudience
} from '../../api/auth/signing';
import {
    getTelemetryContext,
    resolveApiDeps,
    type ApiDeps,
    type AppApiDependencies
} from '../../api/context';
import {
    getImageIdentity,
    IMAGE_HASH_PATTERN
} from '../../api/photos/image-key';
import {
    createImageStore,
    DEFAULT_IMAGE_CONTENT_TYPE,
    normalizeImageContentType,
    type StoredImage
} from '../../api/photos/image-store';
import {
    checkRateLimit,
    RATE_LIMIT_RETRY_AFTER_SECONDS,
    selectBoundLimiter
} from '../../api/rate-limit';
import type { TelegramApi } from '../../api/telegram-api';
import { createImportSigner } from '../../api/auth/import-signing';
import {
    isStagedImageIndex,
    readStagedImage
} from '../../bot/services/link-import/stage-images';
import {
    isSkippedStagedImage,
    type LinkImportDeps,
    type LoadStagedImage
} from '../../bot/services/link-import/types';
import { createWishService } from '../../bot/services/wish-service';
import {
    APP_IMAGE_PATH_PREFIX,
    LINK_IMAGE_PATH_PREFIX,
    LINK_IMPORT_URL_HASH_LENGTH,
    SHARE_IMAGE_PATH_PREFIX
} from '../../shared/app-api';
import { IMAGE_THEME_PARAM, parseImageTheme } from '../../shared/image-theme';
import { buildPhotoPlaceholderSvg } from '../../shared/photo-placeholder';
import type { WorkerApp } from '../../worker/app';
import { isLinkImportEnabled, type WorkerBindings } from '../../worker/env';
import {
    appRateLimitedEvent,
    appRateLimiterMissingEvent,
    imageProxyServedEvent,
    type ImageProxyResult,
    type ImageProxyScope
} from '../../worker/telemetry';
import { normalizeSharePublicId } from '../share/public-id';
import type { CacheLike } from '../routes';
import { buildCachedImage, buildImageCacheKey, getImageCache } from './cache';

export interface ImageProxyRouteDependencies extends AppApiDependencies {
    cache?: CacheLike;
    loadStagedImage?: LoadStagedImage;
}

type ProxyContext = Context<{ Bindings: WorkerBindings }>;

type Rejection = {
    result: Extract<ImageProxyResult, 'notFound' | 'forbidden' | 'expired'>;
    status: 403 | 404 | 410;
};

type ProxyDeps = ApiDeps & {
    cache?: CacheLike;
    loadStagedImage: LoadStagedImage;
};

type Authorization = { fileId: string; hash: string } | Rejection;

const WISH_ID_PATTERN = /^[1-9]\d{0,15}$/;
const INDEX_PATTERN = /^(?:0|[1-9]\d{0,3})$/;
const EXPIRY_PATTERN = /^\d{1,12}$/;
const URL_HASH_PATTERN = new RegExp(
    `^[0-9a-f]{${LINK_IMPORT_URL_HASH_LENGTH}}$`
);
const INTERNAL_ERROR_STATUS = 500;
const TOO_MANY_REQUESTS_STATUS = 429;

const NOT_FOUND: Rejection = { result: 'notFound', status: 404 };
const FORBIDDEN: Rejection = { result: 'forbidden', status: 403 };
const EXPIRED: Rejection = { result: 'expired', status: 410 };

const BASE_HEADERS = {
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff'
} as const;

const SUCCESS_CACHE_CONTROL: Record<ImageProxyScope, string> = {
    app: 'private, max-age=3600, immutable',
    share: 'public, max-age=3600',
    import: 'private, max-age=3600'
};

const PLACEHOLDER_CACHE_CONTROL: Record<ImageProxyScope, string> = {
    app: 'private, max-age=300',
    share: 'public, max-age=300',
    import: 'private, max-age=300'
};

const PLACEHOLDER_CONTENT_TYPE = 'image/svg+xml';
const PLACEHOLDER_SVG = {
    adaptive: buildPhotoPlaceholderSvg(),
    light: buildPhotoPlaceholderSvg('light'),
    dark: buildPhotoPlaceholderSvg('dark')
} as const;

const readParam = (c: ProxyContext, name: string) => {
    return c.req.param(name) ?? '';
};

const isRejection = (value: Authorization): value is Rejection => {
    return 'status' in value;
};

const errorResponse = (status: number, extra: HeadersInit = {}) => {
    return new Response(null, {
        status,
        headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store', ...extra }
    });
};

const buildImageResponse = (
    scope: ImageProxyScope,
    body: BodyInit,
    contentType: string,
    cacheControl: string
) => {
    const headers = new Headers({
        ...BASE_HEADERS,
        'Content-Type': contentType,
        'Cache-Control': cacheControl
    });

    if (scope !== 'share') {
        headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    }

    return new Response(body, { status: 200, headers });
};

const imageResponse = (scope: ImageProxyScope, image: StoredImage) => {
    return buildImageResponse(
        scope,
        image.body,
        image.contentType,
        SUCCESS_CACHE_CONTROL[scope]
    );
};

const placeholderResponse = (c: ProxyContext, scope: ImageProxyScope) => {
    const theme = parseImageTheme(c.req.query(IMAGE_THEME_PARAM));

    return buildImageResponse(
        scope,
        PLACEHOLDER_SVG[theme ?? 'adaptive'],
        PLACEHOLDER_CONTENT_TYPE,
        PLACEHOLDER_CACHE_CONTROL[scope]
    );
};

const settle = async (c: ProxyContext, task: Promise<unknown>) => {
    const settled = task.catch(() => undefined);
    const context = getTelemetryContext(c);

    if (context) {
        context.waitUntil(settled);
    } else {
        await settled;
    }
};

const authorizeImage = async (
    deps: ProxyDeps,
    reference: { fileId: string | null; hash: string }
): Promise<Authorization> => {
    if (reference.fileId === null) {
        return NOT_FOUND;
    }

    const identity = await getImageIdentity(deps.crypto, reference.fileId);

    return identity.hash === reference.hash
        ? { fileId: reference.fileId, hash: reference.hash }
        : NOT_FOUND;
};

const readImageAudience = (raw: string | undefined): ImageAudience | null => {
    if (raw === undefined) {
        return 'owner';
    }

    return raw === VIEWER_IMAGE_AUDIENCE_PARAM ? 'viewer' : null;
};

const authorizeAppImage = async (
    c: ProxyContext,
    deps: ProxyDeps
): Promise<Authorization> => {
    const wishId = readParam(c, 'wishId');
    const index = readParam(c, 'index');
    const hash = readParam(c, 'hash');
    const expiry = c.req.query('e') ?? '';
    const signature = c.req.query('s') ?? '';
    const audience = readImageAudience(c.req.query('a'));

    if (
        !WISH_ID_PATTERN.test(wishId) ||
        !INDEX_PATTERN.test(index) ||
        !IMAGE_HASH_PATTERN.test(hash)
    ) {
        return NOT_FOUND;
    }

    if (!EXPIRY_PATTERN.test(expiry) || audience === null) {
        return FORBIDDEN;
    }

    const signer = createSigner({
        botToken: c.env.BOT_TOKEN,
        environment: c.env.BOT_ENVIRONMENT,
        crypto: deps.crypto
    });
    const verification = await signer.verifyImage(
        { wishId: Number(wishId), index: Number(index), hash, audience },
        { expiresAt: Number(expiry), signature },
        deps.now()
    );

    if (!verification.ok) {
        return verification.reason === 'expired' ? EXPIRED : FORBIDDEN;
    }

    const wishes = createWishService(deps.createRepositories(c.env), deps.now);
    const fileId =
        audience === 'viewer'
            ? await wishes.findViewerImageFileId(Number(wishId), Number(index))
            : await wishes.findImageFileId(Number(wishId), Number(index));

    return authorizeImage(deps, { hash, fileId });
};

const authorizeShareImage = async (
    c: ProxyContext,
    deps: ProxyDeps
): Promise<Authorization> => {
    const publicId = normalizeSharePublicId(readParam(c, 'publicId'));
    const wishId = readParam(c, 'wishId');
    const index = readParam(c, 'index');
    const hash = readParam(c, 'hash');

    if (
        publicId === null ||
        !WISH_ID_PATTERN.test(wishId) ||
        !INDEX_PATTERN.test(index) ||
        !IMAGE_HASH_PATTERN.test(hash)
    ) {
        return NOT_FOUND;
    }

    const wishes = createWishService(deps.createRepositories(c.env), deps.now);
    const images = await wishes.findSharedWishImages(publicId, Number(wishId));

    return authorizeImage(deps, {
        hash,
        fileId: images?.[Number(index)] ?? null
    });
};

const enforceClientLimit = async (c: ProxyContext, deps: ProxyDeps) => {
    const context = getTelemetryContext(c);
    const client = c.req.header('cf-connecting-ip');

    if (client === undefined || client === '') {
        deps.emitTelemetry(c.env, context, appRateLimitedEvent('image'));

        return true;
    }

    const limiter = (deps.selectLimiter ?? selectBoundLimiter)(c.env, 'image');
    const outcome = await checkRateLimit(
        limiter,
        await sha256Hex(deps.crypto, client)
    );

    if (outcome === 'missing' || outcome === 'error') {
        deps.emitTelemetry(
            c.env,
            context,
            appRateLimiterMissingEvent('image', outcome)
        );

        return false;
    }

    if (outcome === 'limited') {
        deps.emitTelemetry(c.env, context, appRateLimitedEvent('image'));
    }

    return outcome === 'limited';
};

const logUpstreamFailure = (error: unknown) => {
    const errorCode = (error as { response?: { error_code?: unknown } })
        ?.response?.error_code;

    console.warn(
        JSON.stringify({
            event: 'image_proxy_upstream_failed',
            errorCode: typeof errorCode === 'number' ? errorCode : null
        })
    );
};

const fetchFromTelegram = async (
    api: TelegramApi,
    fileId: string
): Promise<StoredImage | null> => {
    try {
        const file = await api.getFile(fileId);

        if (!file.file_path) {
            return null;
        }

        const download = await api.downloadFile(file.file_path);
        const body = await download.arrayBuffer();

        return body.byteLength === 0
            ? null
            : {
                  body,
                  contentType:
                      normalizeImageContentType(
                          download.headers.get('Content-Type')
                      ) ?? DEFAULT_IMAGE_CONTENT_TYPE
              };
    } catch (error) {
        logUpstreamFailure(error);

        return null;
    }
};

interface ServedImage {
    response: Response;
    result: ImageProxyResult;
}

const resolveImage = async (
    c: ProxyContext,
    deps: ProxyDeps,
    scope: ImageProxyScope,
    fileId: string
): Promise<ServedImage> => {
    const { key } = await getImageIdentity(deps.crypto, fileId);
    const cache = getImageCache(deps.cache);
    const cacheKey = buildImageCacheKey(new URL(c.req.url).origin, key);
    const cached = await cache?.match(cacheKey).catch(() => undefined);

    if (cached) {
        return {
            response: imageResponse(scope, {
                body: await cached.arrayBuffer(),
                contentType:
                    normalizeImageContentType(
                        cached.headers.get('Content-Type')
                    ) ?? DEFAULT_IMAGE_CONTENT_TYPE
            }),
            result: 'hit'
        };
    }

    const store = createImageStore(c.env.IMAGES);
    const stored = await store.get(key);

    if (stored) {
        if (cache) {
            await settle(
                c,
                cache.put(
                    cacheKey,
                    buildCachedImage(stored.body, stored.contentType)
                )
            );
        }

        return { response: imageResponse(scope, stored), result: 'hit' };
    }

    const fetched = await fetchFromTelegram(
        deps.createTelegramApi(c.env),
        fileId
    );

    if (fetched === null) {
        return {
            response: placeholderResponse(c, scope),
            result: 'placeholder'
        };
    }

    await settle(
        c,
        Promise.all([
            store.put(key, fetched.body, fetched.contentType),
            cache?.put(
                cacheKey,
                buildCachedImage(fetched.body, fetched.contentType)
            )
        ])
    );

    return { response: imageResponse(scope, fetched), result: 'miss' };
};

type ImageResponder = (
    c: ProxyContext,
    deps: ProxyDeps
) => Promise<ServedImage>;

const rateLimitedResponse = (): ServedImage => {
    return {
        response: errorResponse(TOO_MANY_REQUESTS_STATUS, {
            'Retry-After': String(RATE_LIMIT_RETRY_AFTER_SECONDS)
        }),
        result: 'rateLimited'
    };
};

const rejectionResponse = (rejection: Rejection): ServedImage => {
    return {
        response: errorResponse(rejection.status),
        result: rejection.result
    };
};

const serveTelegramImage = (
    scope: ImageProxyScope,
    authorize: (c: ProxyContext, deps: ProxyDeps) => Promise<Authorization>
): ImageResponder => {
    return async (c, deps) => {
        const authorization = await authorize(c, deps);

        return isRejection(authorization)
            ? rejectionResponse(authorization)
            : resolveImage(c, deps, scope, authorization.fileId);
    };
};

const authorizeImportImage = async (
    c: ProxyContext,
    deps: ProxyDeps
): Promise<{ urlHash: string; index: number } | Rejection> => {
    const urlHash = readParam(c, 'urlHash');
    const index = readParam(c, 'index');
    const expiry = c.req.query('e') ?? '';
    const signature = c.req.query('s') ?? '';

    if (
        !URL_HASH_PATTERN.test(urlHash) ||
        !INDEX_PATTERN.test(index) ||
        !isStagedImageIndex(Number(index))
    ) {
        return NOT_FOUND;
    }

    if (!EXPIRY_PATTERN.test(expiry)) {
        return FORBIDDEN;
    }

    const reference = { urlHash, index: Number(index) };
    const verification = await createImportSigner({
        botToken: c.env.BOT_TOKEN,
        environment: c.env.BOT_ENVIRONMENT,
        crypto: deps.crypto
    }).verifyImportImage(
        reference,
        { expiresAt: Number(expiry), signature },
        deps.now()
    );

    if (!verification.ok) {
        return verification.reason === 'expired' ? EXPIRED : FORBIDDEN;
    }

    return reference;
};

const toLinkImportDeps = (c: ProxyContext, deps: ProxyDeps): LinkImportDeps => {
    const context = getTelemetryContext(c);

    return {
        env: c.env,
        now: () => deps.now().getTime(),
        ...(context === undefined
            ? {}
            : {
                  waitUntil: (promise: Promise<unknown>) => {
                      context.waitUntil(promise);
                  }
              })
    };
};

const serveImportImage: ImageResponder = async (c, deps) => {
    if (!isLinkImportEnabled(c.env)) {
        return rejectionResponse(NOT_FOUND);
    }

    const authorization = await authorizeImportImage(c, deps);

    if ('status' in authorization) {
        return rejectionResponse(authorization);
    }

    const stored = await readStagedImage(
        c.env.IMAGES,
        authorization.urlHash,
        authorization.index
    );

    if (stored !== null) {
        return {
            response: imageResponse('import', stored),
            result: 'hit'
        };
    }

    const restaged = await deps.loadStagedImage(
        toLinkImportDeps(c, deps),
        authorization
    );

    return isSkippedStagedImage(restaged)
        ? { response: placeholderResponse(c, 'import'), result: 'placeholder' }
        : { response: imageResponse('import', restaged), result: 'miss' };
};

const serve = async (
    c: ProxyContext,
    deps: ProxyDeps,
    respond: ImageResponder
): Promise<ServedImage> => {
    if (await enforceClientLimit(c, deps)) {
        return rateLimitedResponse();
    }

    return respond(c, deps);
};

const createImageHandler = (
    scope: ImageProxyScope,
    deps: ProxyDeps,
    respond: ImageResponder
) => {
    return async (c: ProxyContext) => {
        const startedAt = deps.now().getTime();
        let served: ServedImage;

        try {
            served = await serve(c, deps, respond);
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: 'image_proxy_failed',
                    errorType:
                        error instanceof Error ? error.name : typeof error
                })
            );
            served = {
                response: errorResponse(INTERNAL_ERROR_STATUS),
                result: 'upstreamError'
            };
        }

        deps.emitTelemetry(
            c.env,
            getTelemetryContext(c),
            imageProxyServedEvent({
                scope,
                result: served.result,
                status: served.response.status,
                elapsedMs: Math.max(0, deps.now().getTime() - startedAt)
            })
        );

        return served.response;
    };
};

const readStagedImageOnly: LoadStagedImage = async (deps, input) => {
    return (
        (await readStagedImage(
            deps.env.IMAGES,
            input.urlHash,
            input.index
        )) ?? {
            skipped: 'failed'
        }
    );
};

const notFoundHandler = () => errorResponse(NOT_FOUND.status);

export const registerImageProxyRoutes = (
    app: WorkerApp,
    dependencies: ImageProxyRouteDependencies = {}
) => {
    const deps: ProxyDeps = {
        ...resolveApiDeps(dependencies),
        ...(dependencies.cache === undefined
            ? {}
            : { cache: dependencies.cache }),
        loadStagedImage:
            dependencies.loadStagedImage ??
            dependencies.linkImport?.loadStagedImage ??
            readStagedImageOnly
    };

    app.get(
        `${APP_IMAGE_PATH_PREFIX}/:wishId/:index/:hash`,
        createImageHandler(
            'app',
            deps,
            serveTelegramImage('app', authorizeAppImage)
        )
    );
    app.get(
        `${SHARE_IMAGE_PATH_PREFIX}/:publicId/:wishId/:index/:hash`,
        createImageHandler(
            'share',
            deps,
            serveTelegramImage('share', authorizeShareImage)
        )
    );
    app.get(
        `${LINK_IMAGE_PATH_PREFIX}/:urlHash/:index`,
        createImageHandler('import', deps, serveImportImage)
    );
    app.get(`${APP_IMAGE_PATH_PREFIX}/*`, notFoundHandler);
    app.get(`${SHARE_IMAGE_PATH_PREFIX}/*`, notFoundHandler);
    app.get(`${LINK_IMAGE_PATH_PREFIX}/*`, notFoundHandler);
};
