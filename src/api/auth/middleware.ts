import { Effect } from 'effect';
import type { MiddlewareHandler } from 'hono';
import type { User } from 'telegraf/types';

import {
    APP_AUTH_SCHEME,
    APP_INIT_DATA_MAX_BYTES,
    APP_RETRY_AFTER_SECONDS
} from '../../shared/app-api';
import type { WorkerBindings } from '../../worker/env';
import {
    appApiCompletedEvent,
    appAuthRejectedEvent,
    appRateLimitedEvent,
    appRateLimiterMissingEvent,
    APP_API_UNMATCHED_ROUTE
} from '../../worker/telemetry';
import {
    emitApiTelemetry,
    runInBackground,
    type ApiContext,
    type ApiDeps,
    type ApiRoute,
    type AppApiEnv
} from '../context';
import { apiErrorResponse, readErrorCode, toApiErrorResponse } from '../errors';
import {
    checkRateLimit,
    selectBoundLimiter,
    telegramRateLimitKey
} from '../rate-limit';
import { encodeText } from './crypto';
import { validateInitData, type InitDataUser } from './init-data';

const UNRESTRICTED_ENVIRONMENT = 'production';

const API_SECURITY_HEADERS = {
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
} as const;

const AUTHORIZATION_PREFIX = `${APP_AUTH_SCHEME} `;
const MILLISECONDS_PER_SECOND = 1000;

export const isMiniAppEnabled = (
    env: Pick<WorkerBindings, 'MINI_APP_ENABLED'>
) => {
    return env.MINI_APP_ENABLED === 'true';
};

export const isPreviewAccessDenied = (
    env: Pick<WorkerBindings, 'BOT_ENVIRONMENT' | 'ADMIN_ID'>,
    telegramUserId: number
) => {
    if (env.BOT_ENVIRONMENT === UNRESTRICTED_ENVIRONMENT) {
        return false;
    }

    const adminId = env.ADMIN_ID?.trim();

    return !adminId || String(telegramUserId) !== adminId;
};

export const isForeignOrigin = (
    originHeader: string | undefined,
    requestUrl: string
) => {
    return (
        originHeader !== undefined &&
        originHeader !== new URL(requestUrl).origin
    );
};

export const readInitDataHeader = (authorization: string | undefined) => {
    if (authorization === undefined) {
        return null;
    }

    return authorization.startsWith(AUTHORIZATION_PREFIX)
        ? authorization.slice(AUTHORIZATION_PREFIX.length)
        : null;
};

export const toActor = (user: InitDataUser): User => {
    return {
        id: user.id,
        is_bot: false,
        first_name: user.first_name,
        ...(user.last_name === undefined ? {} : { last_name: user.last_name }),
        ...(user.username === undefined ? {} : { username: user.username }),
        ...(user.language_code === undefined
            ? {}
            : { language_code: user.language_code }),
        ...(user.is_premium === true ? { is_premium: true } : {})
    };
};

const applySecurityHeaders = (response: Response) => {
    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
        response.headers.set(name, value);
    }

    return response;
};

/**
 * Outermost `/api/app/*` middleware: injects deps, applies the kill switch,
 * sets the API security headers on every response and emits
 * `app_api_completed` with the matched route template.
 */
export const createApiEnvelopeMiddleware = (
    deps: ApiDeps
): MiddlewareHandler<AppApiEnv> => {
    return async (c, next) => {
        const startedAt = Date.now();

        c.set('deps', deps);

        if (isMiniAppEnabled(c.env)) {
            await next();
        } else {
            c.res = apiErrorResponse('disabled');
        }

        const response = applySecurityHeaders(c.res);
        const route = c.get('route') as ApiRoute | undefined;

        emitApiTelemetry(
            c,
            appApiCompletedEvent({
                route: route?.template ?? APP_API_UNMATCHED_ROUTE,
                method: c.req.method,
                status: response.status,
                errorCode: await readErrorCode(response),
                elapsedMs: Math.max(0, Date.now() - startedAt)
            })
        );
    };
};

const reject = (
    c: ApiContext,
    reason: Parameters<typeof appAuthRejectedEvent>[0],
    response: Response
) => {
    emitApiTelemetry(c, appAuthRejectedEvent(reason));

    return response;
};

const enforceRateLimit = async (
    c: ApiContext,
    route: ApiRoute,
    telegramUserId: number
) => {
    const { deps } = c.var;
    const limiter = (deps.selectLimiter ?? selectBoundLimiter)(
        c.env,
        route.bucket
    );
    const outcome = await checkRateLimit(
        limiter,
        telegramRateLimitKey(telegramUserId)
    );

    if (outcome === 'missing' || outcome === 'error') {
        emitApiTelemetry(c, appRateLimiterMissingEvent(route.bucket, outcome));
        return null;
    }

    if (outcome === 'limited') {
        emitApiTelemetry(c, appRateLimitedEvent(route.bucket));

        return apiErrorResponse('rateLimited', {
            retryAfter: APP_RETRY_AFTER_SECONDS
        });
    }

    return null;
};

const APP_SEEN_WRITE_INTERVAL_MILLISECONDS = 60 * 60 * 1000;

const recordAppSeen = async (c: ApiContext) => {
    const { user, repos, deps } = c.var;

    if (user === null) {
        return;
    }

    const now = deps.now();
    const lastSeen = user.lastAppSeenAt?.getTime();

    if (
        lastSeen !== undefined &&
        lastSeen >= now.getTime() - APP_SEEN_WRITE_INTERVAL_MILLISECONDS
    ) {
        return;
    }

    await runInBackground(
        c,
        Effect.runPromise(repos.users.markAppSeen(user.id, now))
    );
};

const authenticate = async (
    c: ApiContext,
    route: ApiRoute
): Promise<Response | null> => {
    if (isForeignOrigin(c.req.header('Origin'), c.req.url)) {
        return reject(c, 'origin', apiErrorResponse('forbidden'));
    }

    const raw = readInitDataHeader(c.req.header('Authorization'));

    if (raw === null || raw.length === 0) {
        return reject(
            c,
            'missing',
            apiErrorResponse('unauthorized', { reason: 'missing' })
        );
    }

    if (encodeText(raw).byteLength > APP_INIT_DATA_MAX_BYTES) {
        return reject(
            c,
            'malformed',
            apiErrorResponse('unauthorized', { reason: 'malformed' })
        );
    }

    const { deps } = c.var;
    const validation = await validateInitData(raw, {
        botToken: c.env.BOT_TOKEN,
        nowSeconds: Math.floor(deps.now().getTime() / MILLISECONDS_PER_SECOND),
        crypto: deps.crypto
    });

    if (!validation.ok) {
        return reject(
            c,
            validation.reason,
            apiErrorResponse('unauthorized', { reason: validation.reason })
        );
    }

    const telegramUserId = validation.data.user.id;

    if (isPreviewAccessDenied(c.env, telegramUserId)) {
        return reject(
            c,
            'previewAccessDenied',
            apiErrorResponse('previewAccessDenied')
        );
    }

    const limited = await enforceRateLimit(c, route, telegramUserId);

    if (limited) {
        return limited;
    }

    const repos = deps.createRepositories(c.env);
    const user = await Effect.runPromise(
        repos.users.findByTelegramId(telegramUserId)
    );

    c.set('repos', repos);
    c.set('initData', validation.data);
    c.set('actor', toActor(validation.data.user));
    c.set('user', user);

    if (route.access === 'user' && user === null) {
        return apiErrorResponse('registrationRequired');
    }

    return null;
};

/**
 * Per-route chain from B1: Origin → `Authorization: tma` → initData HMAC and
 * window → preview gate → rate limit → user lookup → registered-only check.
 */
export const createAuthMiddleware = (
    route: ApiRoute,
    guard?: MiddlewareHandler<AppApiEnv>
): MiddlewareHandler<AppApiEnv> => {
    return async (c, next) => {
        c.set('route', route);

        let rejection: Response | null;

        try {
            rejection = await authenticate(c, route);
        } catch (error) {
            rejection = toApiErrorResponse(error);
        }

        if (rejection) {
            return rejection;
        }

        await recordAppSeen(c);

        if (guard) {
            return guard(c, next);
        }

        await next();
    };
};
