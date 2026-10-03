import type { Context } from 'hono';

import { sha256Hex } from '../../api/auth/crypto';
import { createSigner } from '../../api/auth/signing';
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
import { createWishService } from '../../bot/services/wish-service';
import {
    APP_IMAGE_PATH_PREFIX,
    SHARE_IMAGE_PATH_PREFIX
} from '../../shared/app-api';
import type { WorkerApp } from '../../worker/app';
import type { WorkerBindings } from '../../worker/env';
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
}

type ProxyContext = Context<{ Bindings: WorkerBindings }>;

type Rejection = {
    result: Extract<ImageProxyResult, 'notFound' | 'forbidden' | 'expired'>;
    status: 403 | 404 | 410;
};

type ProxyDeps = ApiDeps & { cache?: CacheLike };

type Authorization = { fileId: string; hash: string } | Rejection;

const WISH_ID_PATTERN = /^[1-9]\d{0,15}$/;
const INDEX_PATTERN = /^(?:0|[1-9]\d{0,3})$/;
const EXPIRY_PATTERN = /^\d{1,12}$/;
const UPSTREAM_ERROR_STATUS = 502;
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
    share: 'public, max-age=3600'
};

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

const imageResponse = (scope: ImageProxyScope, image: StoredImage) => {
    const headers = new Headers({
        ...BASE_HEADERS,
        'Content-Type': image.contentType,
        'Cache-Control': SUCCESS_CACHE_CONTROL[scope]
    });

    if (scope === 'app') {
        headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    }

    return new Response(image.body, { status: 200, headers });
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

const authorizeAppImage = async (
    c: ProxyContext,
    deps: ProxyDeps
): Promise<Authorization> => {
    const wishId = readParam(c, 'wishId');
    const index = readParam(c, 'index');
    const hash = readParam(c, 'hash');
    const expiry = c.req.query('e') ?? '';
    const signature = c.req.query('s') ?? '';

    if (
        !WISH_ID_PATTERN.test(wishId) ||
        !INDEX_PATTERN.test(index) ||
        !IMAGE_HASH_PATTERN.test(hash)
    ) {
        return NOT_FOUND;
    }

    if (!EXPIRY_PATTERN.test(expiry)) {
        return FORBIDDEN;
    }

    const signer = createSigner({
        botToken: c.env.BOT_TOKEN,
        environment: c.env.BOT_ENVIRONMENT,
        crypto: deps.crypto
    });
    const verification = await signer.verifyImage(
        { wishId: Number(wishId), index: Number(index), hash },
        { expiresAt: Number(expiry), signature },
        deps.now()
    );

    if (!verification.ok) {
        return verification.reason === 'expired' ? EXPIRED : FORBIDDEN;
    }

    const wishes = createWishService(deps.createRepositories(c.env), deps.now);

    return authorizeImage(deps, {
        hash,
        fileId: await wishes.findImageFileId(Number(wishId), Number(index))
    });
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
            response: errorResponse(UPSTREAM_ERROR_STATUS),
            result: 'upstreamError'
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

const serve = async (
    c: ProxyContext,
    deps: ProxyDeps,
    scope: ImageProxyScope,
    authorize: (c: ProxyContext, deps: ProxyDeps) => Promise<Authorization>
): Promise<ServedImage> => {
    if (await enforceClientLimit(c, deps)) {
        return {
            response: errorResponse(TOO_MANY_REQUESTS_STATUS, {
                'Retry-After': String(RATE_LIMIT_RETRY_AFTER_SECONDS)
            }),
            result: 'rateLimited'
        };
    }

    const authorization = await authorize(c, deps);

    return isRejection(authorization)
        ? {
              response: errorResponse(authorization.status),
              result: authorization.result
          }
        : resolveImage(c, deps, scope, authorization.fileId);
};

const createImageHandler = (
    scope: ImageProxyScope,
    deps: ProxyDeps,
    authorize: (c: ProxyContext, deps: ProxyDeps) => Promise<Authorization>
) => {
    return async (c: ProxyContext) => {
        const startedAt = deps.now().getTime();
        let served: ServedImage;

        try {
            served = await serve(c, deps, scope, authorize);
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

const notFoundHandler = () => errorResponse(NOT_FOUND.status);

export const registerImageProxyRoutes = (
    app: WorkerApp,
    dependencies: ImageProxyRouteDependencies = {}
) => {
    const deps: ProxyDeps = {
        ...resolveApiDeps(dependencies),
        ...(dependencies.cache === undefined
            ? {}
            : { cache: dependencies.cache })
    };

    app.get(
        `${APP_IMAGE_PATH_PREFIX}/:wishId/:index/:hash`,
        createImageHandler('app', deps, authorizeAppImage)
    );
    app.get(
        `${SHARE_IMAGE_PATH_PREFIX}/:publicId/:wishId/:index/:hash`,
        createImageHandler('share', deps, authorizeShareImage)
    );
    app.get(`${APP_IMAGE_PATH_PREFIX}/*`, notFoundHandler);
    app.get(`${SHARE_IMAGE_PATH_PREFIX}/*`, notFoundHandler);
};
