import type { CacheLike } from '../routes';

export const IMAGE_CACHE_PATH_PREFIX = '/__image-cache';
export const IMAGE_CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const getImageCache = (override: CacheLike | undefined) => {
    if (override) {
        return override;
    }

    const runtimeCaches = (globalThis as { caches?: { default?: CacheLike } })
        .caches;

    return runtimeCaches?.default ?? null;
};

export const buildImageCacheKey = (origin: string, imageKey: string) => {
    return `${origin}${IMAGE_CACHE_PATH_PREFIX}/${imageKey}`;
};

export const buildCachedImage = (body: ArrayBuffer, contentType: string) => {
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': `public, max-age=${IMAGE_CACHE_MAX_AGE_SECONDS}`
        }
    });
};
