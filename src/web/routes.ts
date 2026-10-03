import { Effect } from 'effect';
import type { Context } from 'hono';

import { getSupportLinks } from '../bot/content/support-links';
import { resolveAppLocale } from '../bot/i18n';
import { createDb } from '../db/client';
import { createRepositories } from '../db/repositories';
import type { PublicShareFingerprint, Repositories } from '../db/repositories';
import type { WorkerApp } from '../worker/app';
import type { WorkerBindings } from '../worker/env';
import {
    emitSharePageServedTelemetry,
    type ShareCacheOutcome,
    type SharePageResult
} from '../worker/telemetry';
import { getTranslator } from '../bot/i18n';
import type { SharePageErrorKind } from './share/components/error-page';
import { matchAcceptLanguage } from './share/accept-language';
import {
    computeHomeFingerprint,
    computeShareFingerprint,
    etagMatches,
    getDeployId,
    resolvePublicUsername
} from './share/fingerprint';
import {
    buildHomePath,
    buildSharePath,
    CANONICAL_SHARE_HOST,
    CANONICAL_SHARE_ORIGIN,
    LANGUAGE_URL_SEGMENTS,
    LEGACY_UKRAINIAN_SEGMENT,
    normalizeSharePublicId,
    parseLanguageSegment,
    type SharePageLanguage
} from './share/public-id';
import {
    renderErrorPage,
    renderHomePage,
    renderSharePage
} from './share/render';
import { buildSitemap } from './share/sitemap';
import type { SharePageModel } from './share/view-model';

export interface CacheLike {
    match(key: string): Promise<Response | undefined>;
    put(key: string, response: Response): Promise<void>;
}

export interface ShareRouteDependencies {
    cache?: CacheLike;
    now?: () => Date;
}

type ShareContext = Context<{ Bindings: WorkerBindings }>;

export const SHARE_CACHE_MAX_AGE_SECONDS = 86_400;
export const SHARE_CACHE_PATH_PREFIX = '/__share-cache';

const DEFAULT_LANGUAGE: SharePageLanguage = 'uk';
const PERMANENT_REDIRECT_MAX_AGE_SECONDS = 86_400;
const HOME_CACHE_SEGMENT = 'home';
const SITEMAP_PATH = '/sitemap.xml';
const LANGUAGE_SEGMENT_PATTERN = `(?:${Object.values(LANGUAGE_URL_SEGMENTS).join('|')})`;
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const NO_STORE = 'private, no-store';
const NOINDEX = 'noindex';
const SECURITY_HEADERS = {
    'Content-Security-Policy':
        "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
} as const;

const getCache = (dependencies: ShareRouteDependencies) => {
    if (dependencies.cache) {
        return dependencies.cache;
    }

    const runtimeCaches = (globalThis as { caches?: { default?: CacheLike } })
        .caches;

    return runtimeCaches?.default ?? null;
};

const getExecutionContext = (c: ShareContext) => {
    try {
        return c.executionCtx;
    } catch {
        return undefined;
    }
};

const buildCacheKey = (
    origin: string,
    language: SharePageLanguage,
    publicId: string,
    fingerprint: string
) => {
    return `${origin}${SHARE_CACHE_PATH_PREFIX}/${language}/${publicId}/${fingerprint}`;
};

const withSecurityHeaders = (headers: Headers) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        headers.set(name, value);
    }

    return headers;
};

const permanentRedirect = (location: string) => {
    return new Response(null, {
        status: 301,
        headers: withSecurityHeaders(
            new Headers({
                Location: location,
                'Cache-Control': `public, max-age=${PERMANENT_REDIRECT_MAX_AGE_SECONDS}`,
                'X-Robots-Tag': NOINDEX
            })
        )
    });
};

const isProductionCanonicalHost = (env: WorkerBindings, requestUrl: string) => {
    return (
        env.BOT_ENVIRONMENT === 'production' &&
        new URL(requestUrl).host === CANONICAL_SHARE_HOST
    );
};

type CacheLookup =
    | { outcome: 'hit'; response: Response }
    | { outcome: 'miss'; response: undefined }
    | { outcome: 'bypass'; response: undefined };

const lookupCachedPage = async (
    cache: CacheLike | null,
    cacheKey: string
): Promise<CacheLookup> => {
    if (cache === null) {
        return { outcome: 'bypass', response: undefined };
    }

    try {
        const response = await cache.match(cacheKey);

        return response
            ? { outcome: 'hit', response }
            : { outcome: 'miss', response: undefined };
    } catch (error) {
        console.warn(
            JSON.stringify({
                event: 'share_cache_match_failed',
                errorType: error instanceof Error ? error.name : typeof error
            })
        );

        return { outcome: 'bypass', response: undefined };
    }
};

const getErrorStatus = (kind: SharePageErrorKind) => {
    return kind === 'gone' ? 410 : 404;
};

type FinishShareResponse = (
    response: Response,
    result: SharePageResult,
    cacheOutcome: ShareCacheOutcome
) => Response;

type CachedHtmlResult = 'notModified' | 'cached' | 'rendered';

const serveCachedHtml = async ({
    c,
    language,
    fingerprint,
    cacheKey,
    indexable,
    cache,
    render
}: {
    c: ShareContext;
    language: SharePageLanguage;
    fingerprint: string;
    cacheKey: string;
    indexable: boolean;
    cache: CacheLike | null;
    render: () => Promise<string> | string;
}): Promise<{
    response: Response;
    result: CachedHtmlResult;
    cacheOutcome: ShareCacheOutcome;
}> => {
    const baseHeaders = () => {
        const headers = withSecurityHeaders(
            new Headers({
                'Cache-Control': 'no-cache',
                ETag: `"${fingerprint}"`,
                'Content-Language': language
            })
        );

        if (!indexable) {
            headers.set('X-Robots-Tag', NOINDEX);
        }

        return headers;
    };

    if (etagMatches(c.req.header('If-None-Match'), fingerprint)) {
        return {
            response: new Response(null, {
                status: 304,
                headers: baseHeaders()
            }),
            result: 'notModified',
            cacheOutcome: 'hit'
        };
    }

    const lookup = await lookupCachedPage(cache, cacheKey);
    const cached = lookup.response;

    if (cached) {
        const headers = baseHeaders();

        headers.set('Content-Type', HTML_CONTENT_TYPE);
        headers.set('Server-Timing', 'share-cache;desc=hit');

        return {
            response: new Response(await cached.text(), {
                status: 200,
                headers
            }),
            result: 'cached',
            cacheOutcome: 'hit'
        };
    }

    const html = await render();

    if (cache) {
        const cachedCopy = new Response(html, {
            status: 200,
            headers: {
                'Content-Type': HTML_CONTENT_TYPE,
                'Cache-Control': `public, max-age=${SHARE_CACHE_MAX_AGE_SECONDS}`,
                'Content-Language': language
            }
        });
        const stored = cache.put(cacheKey, cachedCopy).catch(error => {
            console.warn(
                JSON.stringify({
                    event: 'share_cache_put_failed',
                    errorType:
                        error instanceof Error ? error.name : typeof error
                })
            );
        });
        const executionContext = getExecutionContext(c);

        if (executionContext) {
            executionContext.waitUntil(stored);
        } else {
            await stored;
        }
    }

    const headers = baseHeaders();

    headers.set('Content-Type', HTML_CONTENT_TYPE);
    headers.set('Server-Timing', `share-cache;desc=${lookup.outcome}`);

    return {
        response: new Response(html, { status: 200, headers }),
        result: 'rendered',
        cacheOutcome: lookup.outcome
    };
};

const servePage = async ({
    c,
    language,
    share,
    repositories,
    cache,
    finish
}: {
    c: ShareContext;
    language: SharePageLanguage;
    share: PublicShareFingerprint;
    repositories: Repositories;
    cache: CacheLike | null;
    finish: FinishShareResponse;
}) => {
    const deployId = getDeployId(c.env);
    const fingerprint = await computeShareFingerprint(
        deployId,
        language,
        share
    );
    const origin = new URL(c.req.url).origin;
    const indexable =
        isProductionCanonicalHost(c.env, c.req.url) && share.visibleCount > 0;
    const { response, result, cacheOutcome } = await serveCachedHtml({
        c,
        language,
        fingerprint,
        cacheKey: buildCacheKey(origin, language, share.publicId, fingerprint),
        indexable,
        cache,
        render: async () => {
            const wishes = await Effect.runPromise(
                repositories.wishes.listShareable(share.userId)
            );
            const model: SharePageModel = {
                language,
                publicId: share.publicId,
                origin,
                assetVersion: deployId,
                displayName: share.displayName,
                username: resolvePublicUsername(share),
                payments: share.payments,
                currency: share.currency,
                visibleCount: share.visibleCount,
                lastUpdatedAt: share.lastUpdatedAt,
                wishes,
                indexable,
                botUrl: c.env.WISHLIST_TG_URL,
                githubUrl: c.env.GITHUB_REPO_URL,
                supportLinks: getSupportLinks(c.env, getTranslator(language))
            };

            return renderSharePage(model);
        }
    });

    return finish(response, result, cacheOutcome);
};

export const registerShareRoutes = (
    app: WorkerApp,
    dependencies: ShareRouteDependencies = {}
) => {
    const now = dependencies.now ?? (() => new Date());

    const serve = async (
        c: ShareContext,
        language: SharePageLanguage | null
    ) => {
        const startedAt = now().getTime();
        const requestedId = c.req.param('publicId') ?? '';
        let telemetryLanguage: SharePageLanguage | undefined =
            language ?? undefined;
        let visibleWishes: number | undefined;

        const finish = (
            response: Response,
            result: SharePageResult,
            cacheOutcome: ShareCacheOutcome
        ) => {
            emitSharePageServedTelemetry(c.env, getExecutionContext(c), {
                method: c.req.method,
                result,
                cacheOutcome,
                status: response.status,
                elapsedMs: Math.max(0, now().getTime() - startedAt),
                ...(telemetryLanguage && {
                    locale: telemetryLanguage
                }),
                ...(visibleWishes !== undefined && { visibleWishes })
            });

            return response;
        };

        const errorResponse = (
            errorLanguage: SharePageLanguage,
            kind: SharePageErrorKind
        ) => {
            telemetryLanguage = errorLanguage;
            const status = getErrorStatus(kind);
            const headers = withSecurityHeaders(
                new Headers({
                    'Content-Type': HTML_CONTENT_TYPE,
                    'Cache-Control': NO_STORE,
                    'Content-Language': errorLanguage,
                    'X-Robots-Tag': NOINDEX
                })
            );

            return finish(
                new Response(
                    renderErrorPage(
                        errorLanguage,
                        kind,
                        c.env.WISHLIST_TG_URL,
                        getDeployId(c.env)
                    ),
                    { status, headers }
                ),
                kind === 'gone' ? 'gone' : 'notFound',
                'bypass'
            );
        };

        const acceptedLanguage = matchAcceptLanguage(
            c.req.header('Accept-Language')
        );
        const normalizedId = normalizeSharePublicId(requestedId);

        if (normalizedId === null) {
            return errorResponse(
                language ?? acceptedLanguage ?? DEFAULT_LANGUAGE,
                'notFound'
            );
        }

        if (normalizedId !== requestedId) {
            return finish(
                permanentRedirect(
                    buildSharePath(normalizedId, language ?? undefined)
                ),
                'redirected',
                'bypass'
            );
        }

        try {
            const repositories = createRepositories(createDb(c.env));
            const share = await Effect.runPromise(
                repositories.shares.findPublicFingerprint(normalizedId)
            );

            if (share === null) {
                return errorResponse(
                    language ?? acceptedLanguage ?? DEFAULT_LANGUAGE,
                    'notFound'
                );
            }

            const ownerLanguage = resolveAppLocale(
                share.language,
                share.telegramLanguageCode
            );

            if (share.revokedAt !== null) {
                return errorResponse(
                    language ?? acceptedLanguage ?? ownerLanguage,
                    'gone'
                );
            }

            if (language === null) {
                telemetryLanguage = acceptedLanguage ?? ownerLanguage;

                return finish(
                    new Response(null, {
                        status: 302,
                        headers: withSecurityHeaders(
                            new Headers({
                                Location: buildSharePath(
                                    normalizedId,
                                    telemetryLanguage
                                ),
                                Vary: 'Accept-Language',
                                'Cache-Control': NO_STORE,
                                'X-Robots-Tag': NOINDEX
                            })
                        )
                    }),
                    'redirected',
                    'bypass'
                );
            }

            visibleWishes = share.visibleCount;

            return await servePage({
                c,
                language,
                share,
                repositories,
                cache: getCache(dependencies),
                finish
            });
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: 'share_page_failed',
                    errorType:
                        error instanceof Error ? error.name : typeof error
                })
            );

            return finish(
                new Response('Internal Server Error', {
                    status: 500,
                    headers: withSecurityHeaders(
                        new Headers({
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': NO_STORE,
                            'X-Robots-Tag': NOINDEX
                        })
                    )
                }),
                'error',
                'bypass'
            );
        }
    };

    app.get('/robots.txt', c => {
        const body = isProductionCanonicalHost(c.env, c.req.url)
            ? `User-agent: *\nAllow: /\nDisallow: ${SHARE_CACHE_PATH_PREFIX}/\n\nSitemap: ${CANONICAL_SHARE_ORIGIN}${SITEMAP_PATH}\n`
            : 'User-agent: *\nDisallow: /\n';

        return c.body(body, 200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        });
    });

    app.get('/w/:publicId', c => {
        return serve(c, null);
    });

    app.get(`/:lang{${LANGUAGE_SEGMENT_PATTERN}}/w/:publicId`, c => {
        return serve(
            c,
            parseLanguageSegment(c.req.param('lang')) ?? DEFAULT_LANGUAGE
        );
    });

    app.get(`/${LEGACY_UKRAINIAN_SEGMENT}/w/:publicId`, c => {
        const startedAt = now().getTime();
        const requestedId = c.req.param('publicId');
        const response = permanentRedirect(
            buildSharePath(
                normalizeSharePublicId(requestedId) ?? requestedId,
                'uk'
            )
        );

        emitSharePageServedTelemetry(c.env, getExecutionContext(c), {
            method: c.req.method,
            result: 'redirected',
            cacheOutcome: 'bypass',
            status: response.status,
            elapsedMs: Math.max(0, now().getTime() - startedAt),
            locale: 'uk'
        });

        return response;
    });
};

export const registerHomeRoutes = (
    app: WorkerApp,
    dependencies: ShareRouteDependencies = {}
) => {
    app.get('/', c => {
        const language =
            matchAcceptLanguage(c.req.header('Accept-Language')) ??
            DEFAULT_LANGUAGE;

        return new Response(null, {
            status: 302,
            headers: withSecurityHeaders(
                new Headers({
                    Location: buildHomePath(language),
                    Vary: 'Accept-Language',
                    'Cache-Control': NO_STORE
                })
            )
        });
    });

    app.get(`/:lang{${LANGUAGE_SEGMENT_PATTERN}}/`, c => {
        return permanentRedirect(
            buildHomePath(
                parseLanguageSegment(c.req.param('lang')) ?? DEFAULT_LANGUAGE
            )
        );
    });

    app.get(`/:lang{${LANGUAGE_SEGMENT_PATTERN}}`, async c => {
        const language =
            parseLanguageSegment(c.req.param('lang')) ?? DEFAULT_LANGUAGE;
        const deployId = getDeployId(c.env);
        const origin = new URL(c.req.url).origin;
        const fingerprint = await computeHomeFingerprint(deployId, language);
        const indexable = isProductionCanonicalHost(c.env, c.req.url);
        const { response } = await serveCachedHtml({
            c,
            language,
            fingerprint,
            cacheKey: `${origin}${SHARE_CACHE_PATH_PREFIX}/${HOME_CACHE_SEGMENT}/${language}/${fingerprint}`,
            indexable,
            cache: getCache(dependencies),
            render: () => {
                return renderHomePage({
                    language,
                    origin,
                    assetVersion: deployId,
                    indexable,
                    botUrl: c.env.WISHLIST_TG_URL,
                    githubUrl: c.env.GITHUB_REPO_URL,
                    authorUrl: c.env.AUTHOR_TWITTER_LINK,
                    princessUrl: c.env.PRINCESS_TG_URL,
                    supportLinks: getSupportLinks(
                        c.env,
                        getTranslator(language)
                    )
                });
            }
        });

        return response;
    });

    app.on(
        'GET',
        [`/${LEGACY_UKRAINIAN_SEGMENT}`, `/${LEGACY_UKRAINIAN_SEGMENT}/`],
        () => {
            return permanentRedirect(buildHomePath('uk'));
        }
    );

    app.get(SITEMAP_PATH, c => {
        if (!isProductionCanonicalHost(c.env, c.req.url)) {
            return c.notFound();
        }

        return c.body(buildSitemap(new URL(c.req.url).origin), 200, {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        });
    });
};
