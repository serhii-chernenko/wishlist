import {
    APP_RETRY_AFTER_SECONDS,
    type RateLimitBucket
} from '../shared/app-api';
import type { WorkerBindings } from '../worker/env';

export interface RateLimiterLike {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitOutcome = 'allowed' | 'limited' | 'missing' | 'error';

export const RATE_LIMIT_BINDINGS = {
    api: 'APP_API_LIMITER',
    sensitive: 'APP_SENSITIVE_LIMITER',
    upload: 'APP_UPLOAD_LIMITER',
    image: 'IMAGE_PROXY_LIMITER',
    import: 'APP_IMPORT_LIMITER'
} as const satisfies Record<RateLimitBucket, keyof WorkerBindings>;

export const RATE_LIMIT_RETRY_AFTER_SECONDS = APP_RETRY_AFTER_SECONDS;

export const isRateLimiter = (value: unknown): value is RateLimiterLike => {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { limit?: unknown }).limit === 'function'
    );
};

export const selectBoundLimiter = (
    env: WorkerBindings,
    bucket: RateLimitBucket
): RateLimiterLike | null => {
    const binding: unknown = env[RATE_LIMIT_BINDINGS[bucket]];

    return isRateLimiter(binding) ? binding : null;
};

export const selectLinkHostLimiter = (
    env: WorkerBindings
): RateLimiterLike | null => {
    const binding: unknown = env.LINK_HOST_LIMITER;

    return isRateLimiter(binding) ? binding : null;
};

export const linkHostRateLimitKey = (registrableDomain: string) => {
    return `host:${registrableDomain}`;
};

export const telegramRateLimitKey = (telegramId: number) => {
    return `tg:${telegramId}`;
};

/**
 * A missing or failing limiter allows the request: rate-limit bindings may be
 * absent under getPlatformProxy and in Worker previews, and the caller emits
 * `app_rate_limiter_missing` so the gap stays visible.
 */
export const checkRateLimit = async (
    limiter: RateLimiterLike | null,
    key: string
): Promise<RateLimitOutcome> => {
    if (limiter === null) {
        return 'missing';
    }

    try {
        const { success } = await limiter.limit({ key });

        return success ? 'allowed' : 'limited';
    } catch {
        return 'error';
    }
};
