import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { Effect } from 'effect';

import { releaseOrphanedImages } from '../src/api/photos/image-cleanup';
import {
    createLinkImportServices,
    reportLinkImportCompleted,
    toImportedDraft,
    type LinkImportImplementations
} from '../src/bot/services/link-import/link-import-service';
import {
    buildCacheEntry,
    createLinkImportCache
} from '../src/bot/services/link-import/result-cache';
import {
    importImageKey,
    importMetaKey
} from '../src/bot/services/link-import/storage-keys';
import type {
    ExtractedProduct,
    LinkImportDeps,
    PageSignals,
    SafeFetchFailure
} from '../src/bot/services/link-import/types';
import type { WorkerBindings } from '../src/worker/env';
import { runScheduledTasks } from '../src/worker/scheduled/tasks';
import {
    toWishlistAttributes,
    type TelemetryFields
} from '../src/worker/telemetry';
import { createNodeApiCrypto } from './fixtures/app-auth';
import {
    AVIF_BYTES,
    createFakeSafeFetcher,
    createLinkImportEnv,
    createMemoryBucket,
    JPEG_BYTES,
    WEBP_BYTES,
    type MemoryBucket
} from './fixtures/link-import-fakes';

const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const URL_HASH = 'abcdefabcdefabcdefabcdefabcdef12';
const PRODUCT_URL = 'https://rozetka.com.ua/ua/kettle/p123/';
const SECRET_TITLE = 'Чайник секретний';

const EMPTY_SIGNALS: PageSignals = {
    jsonLd: [],
    meta: {},
    itemprops: [],
    canonical: null,
    titleTag: null,
    baseHref: null,
    truncated: false
};

const product = (overrides: Partial<ExtractedProduct> = {}) => {
    return {
        title: SECRET_TITLE,
        description: 'Опис',
        price: 1299,
        currency: 'UAH',
        images: [
            'https://cdn.rozetka.com.ua/1.jpg',
            'https://cdn.rozetka.com.ua/2.jpg'
        ],
        source: 'jsonld',
        canonicalUrl: PRODUCT_URL,
        finalUrl: PRODUCT_URL,
        ...overrides
    } satisfies ExtractedProduct;
};

interface ServiceHarness {
    memory: MemoryBucket;
    deps: LinkImportDeps;
    events: TelemetryFields[];
    pageCalls: number;
    limiterKeys: string[];
    services: ReturnType<typeof createLinkImportServices>;
    clock: { now: number };
}

const createServiceHarness = (
    input: {
        extracted?: ExtractedProduct | null;
        pageFailure?: SafeFetchFailure;
        limiter?: 'allow' | 'limit' | 'missing';
        images?: Record<string, { bytes: Uint8Array }>;
    } = {}
): ServiceHarness => {
    const memory = createMemoryBucket();
    const events: TelemetryFields[] = [];
    const limiterKeys: string[] = [];
    const clock = { now: NOW };
    const fetcher = createFakeSafeFetcher({
        images: input.images ?? {},
        page: () => {
            return input.pageFailure === undefined
                ? {
                      ok: true,
                      value: {
                          finalUrl: PRODUCT_URL,
                          response: new Response('<html></html>')
                      }
                  }
                : { ok: false, failure: input.pageFailure, status: 403 };
        }
    });
    const limiter =
        input.limiter === 'missing'
            ? undefined
            : {
                  async limit(options: { key: string }) {
                      limiterKeys.push(options.key);

                      return { success: input.limiter !== 'limit' };
                  }
              };
    const implementations: LinkImportImplementations = {
        createSafeFetcher: () => fetcher,
        async collectPageSignals() {
            return EMPTY_SIGNALS;
        },
        extractProduct: () => {
            return input.extracted === undefined ? product() : input.extracted;
        },
        normalizeImportUrl: raw => {
            if (!raw.startsWith('https://')) {
                return null;
            }

            const parsed = new URL(raw);

            return {
                url: `${parsed.origin}${parsed.pathname}`,
                host: parsed.hostname,
                registrableDomain: 'rozetka.com.ua'
            };
        },
        async hashImportUrl() {
            return URL_HASH;
        },
        emitTelemetry: (_env, _context, fields) => {
            events.push(fields);
        }
    };
    const harness: ServiceHarness = {
        memory,
        events,
        limiterKeys,
        clock,
        pageCalls: 0,
        services: createLinkImportServices(implementations),
        deps: {
            env: createLinkImportEnv({
                bucket: memory.bucket,
                hostLimiter: limiter
            }),
            now: () => clock.now
        }
    };
    const original = fetcher.fetchPage;

    fetcher.fetchPage = (url, options) => {
        harness.pageCalls += 1;

        return original(url, options);
    };

    return harness;
};

describe('runLinkImport', () => {
    it('rejects an invalid link without fetching', async () => {
        const harness = createServiceHarness();
        const result = await harness.services.run(harness.deps, {
            url: 'javascript:alert(1)',
            channel: 'app'
        });

        assert.equal(result.outcome, 'invalidUrl');
        assert.equal(result.urlHash, null);
        assert.equal(result.shop, 'other');
        assert.equal(harness.pageCalls, 0);
        assert.deepEqual(harness.memory.keys(), []);
    });

    it('imports a full product, caches it for a day and serves the next call from cache', async () => {
        const harness = createServiceHarness({ limiter: 'allow' });
        const first = await harness.services.run(harness.deps, {
            url: `${PRODUCT_URL}?utm_source=x`,
            channel: 'app'
        });

        assert.equal(first.outcome, 'ok');
        assert.equal(first.cache, 'miss');
        assert.equal(first.shop, 'rozetka');
        assert.equal(first.urlHash, URL_HASH);
        assert.equal(first.normalizedUrl, PRODUCT_URL);
        assert.deepEqual(harness.limiterKeys, ['host:rozetka.com.ua']);

        const meta = harness.memory.objects.get(importMetaKey(URL_HASH));

        assert.equal(
            meta?.customMetadata.expiresAt,
            String(NOW + 24 * HOUR_MS)
        );

        harness.clock.now += 23 * HOUR_MS;

        const second = await harness.services.run(harness.deps, {
            url: PRODUCT_URL,
            channel: 'bot'
        });

        assert.equal(second.outcome, 'ok');
        assert.equal(second.cache, 'hit');
        assert.equal(second.product?.title, SECRET_TITLE);
        assert.equal(harness.pageCalls, 1);
        assert.equal(harness.limiterKeys.length, 1);

        harness.clock.now += 2 * HOUR_MS;

        const third = await harness.services.run(harness.deps, {
            url: PRODUCT_URL,
            channel: 'bot'
        });

        assert.equal(third.cache, 'miss');
        assert.equal(harness.pageCalls, 2);
    });

    it('classifies a product without a price as partial', async () => {
        const harness = createServiceHarness({
            extracted: product({ price: null, currency: null })
        });
        const result = await harness.services.run(harness.deps, {
            url: PRODUCT_URL,
            channel: 'app'
        });

        assert.equal(result.outcome, 'partial');
    });

    it('caches notProduct and blocked results for an hour only', async () => {
        const notProduct = createServiceHarness({ extracted: null });
        const notProductResult = await notProduct.services.run(
            notProduct.deps,
            { url: PRODUCT_URL, channel: 'app' }
        );

        assert.equal(notProductResult.outcome, 'notProduct');
        assert.equal(
            notProduct.memory.objects.get(importMetaKey(URL_HASH))
                ?.customMetadata.expiresAt,
            String(NOW + HOUR_MS)
        );

        const blocked = createServiceHarness({ pageFailure: 'blockedStatus' });
        const blockedResult = await blocked.services.run(blocked.deps, {
            url: PRODUCT_URL,
            channel: 'app'
        });

        assert.equal(blockedResult.outcome, 'blocked');
        assert.equal(blockedResult.product, null);
        assert.ok(blocked.memory.objects.has(importMetaKey(URL_HASH)));
    });

    it('maps fetch failures and never caches timeouts or invalid hosts', async () => {
        const expectations: [SafeFetchFailure, string][] = [
            ['timeout', 'timeout'],
            ['network', 'timeout'],
            ['blockedHost', 'invalidUrl'],
            ['badContentType', 'notProduct'],
            ['tooLarge', 'notProduct']
        ];

        for (const [failure, outcome] of expectations) {
            const harness = createServiceHarness({ pageFailure: failure });
            const result = await harness.services.run(harness.deps, {
                url: PRODUCT_URL,
                channel: 'app'
            });

            assert.equal(result.outcome, outcome, failure);
            assert.equal(
                harness.memory.objects.has(importMetaKey(URL_HASH)),
                outcome === 'notProduct',
                failure
            );
        }
    });

    it('refuses when the host limiter is exhausted and reports a missing limiter', async () => {
        const limited = createServiceHarness({ limiter: 'limit' });
        const result = await limited.services.run(limited.deps, {
            url: PRODUCT_URL,
            channel: 'app'
        });

        assert.equal(result.outcome, 'rateLimited');
        assert.equal(limited.pageCalls, 0);
        assert.equal(limited.memory.keys().length, 0);

        const missing = createServiceHarness({ limiter: 'missing' });

        await missing.services.run(missing.deps, {
            url: PRODUCT_URL,
            channel: 'app'
        });

        assert.deepEqual(
            missing.events.map(event => {
                return [event.event, event.bucket, event.result];
            }),
            [['app_rate_limiter_missing', 'import', 'missing']]
        );
    });

    it('falls back to notProduct when signal collection throws', async () => {
        const harness = createServiceHarness();
        const services = createLinkImportServices({
            createSafeFetcher: () => {
                return createFakeSafeFetcher({
                    page: () => {
                        return {
                            ok: true,
                            value: {
                                finalUrl: PRODUCT_URL,
                                response: new Response('')
                            }
                        };
                    }
                });
            },
            async collectPageSignals() {
                throw new Error('rewriter failed');
            },
            extractProduct: () => product(),
            normalizeImportUrl: () => {
                return {
                    url: PRODUCT_URL,
                    host: 'rozetka.com.ua',
                    registrableDomain: 'rozetka.com.ua'
                };
            },
            async hashImportUrl() {
                return URL_HASH;
            },
            emitTelemetry: () => undefined
        });
        const result = await services.run(harness.deps, {
            url: PRODUCT_URL,
            channel: 'app'
        });

        assert.equal(result.outcome, 'notProduct');
    });

    it('stores the cache entry through waitUntil when the caller provides one', async () => {
        const harness = createServiceHarness();
        const pending: Promise<unknown>[] = [];

        await harness.services.run(
            {
                ...harness.deps,
                waitUntil: promise => {
                    pending.push(promise);
                }
            },
            { url: PRODUCT_URL, channel: 'app' }
        );

        assert.equal(pending.length, 1);
        await Promise.all(pending);
        assert.ok(harness.memory.objects.has(importMetaKey(URL_HASH)));
    });
});

describe('preview images for the bot', () => {
    it('stages the first images and loads their bytes, counting unsupported ones', async () => {
        const harness = createServiceHarness({
            images: {
                'https://cdn.rozetka.com.ua/1.jpg': { bytes: JPEG_BYTES },
                'https://cdn.rozetka.com.ua/2.jpg': { bytes: AVIF_BYTES },
                'https://cdn.rozetka.com.ua/3.jpg': { bytes: WEBP_BYTES }
            },
            extracted: product({
                images: [
                    'https://cdn.rozetka.com.ua/1.jpg',
                    'https://cdn.rozetka.com.ua/2.jpg',
                    'https://cdn.rozetka.com.ua/3.jpg'
                ]
            })
        });
        const result = await harness.services.run(harness.deps, {
            url: PRODUCT_URL,
            channel: 'bot'
        });
        const preview = await harness.services.preparePreviewImages(
            harness.deps,
            result,
            2
        );

        assert.equal(preview.images.length, 1);
        assert.equal(preview.images[0]?.contentType, 'image/jpeg');
        assert.equal(preview.skippedUnsupported, 1);
        assert.deepEqual(
            preview.staged.map(image => {
                return image.index;
            }),
            [0]
        );
    });

    it('returns nothing when the import has no product', async () => {
        const harness = createServiceHarness({ extracted: null });
        const result = await harness.services.run(harness.deps, {
            url: PRODUCT_URL,
            channel: 'bot'
        });

        assert.deepEqual(
            await harness.services.preparePreviewImages(harness.deps, result),
            { images: [], staged: [], skippedUnsupported: 0 }
        );
    });
});

describe('imported drafts', () => {
    it('keeps a price in one of our currencies', () => {
        assert.deepEqual(
            toImportedDraft(product({ currency: 'uah' }), PRODUCT_URL),
            {
                title: SECRET_TITLE,
                description: 'Опис',
                link: PRODUCT_URL,
                price: 1299,
                currency: 'UAH',
                sourcePrice: null
            }
        );
    });

    it('turns a price in another currency into a source price', () => {
        const draft = toImportedDraft(
            product({ price: 49.99, currency: 'GBP' }),
            PRODUCT_URL
        );

        assert.equal(draft.price, null);
        assert.equal(draft.currency, null);
        assert.deepEqual(draft.sourcePrice, { amount: 49.99, currency: 'GBP' });
    });

    it('keeps only the link without a product and drops prices without a currency', () => {
        assert.deepEqual(toImportedDraft(null, PRODUCT_URL), {
            title: null,
            description: null,
            link: PRODUCT_URL,
            price: null,
            currency: null,
            sourcePrice: null
        });

        const noCurrency = toImportedDraft(
            product({ currency: null }),
            PRODUCT_URL
        );

        assert.equal(noCurrency.price, null);
        assert.equal(noCurrency.sourcePrice, null);
    });
});

describe('link import telemetry', () => {
    it('reports completion with closed labels and no URL or title', async () => {
        const harness = createServiceHarness();
        const result = await harness.services.run(harness.deps, {
            url: PRODUCT_URL,
            channel: 'bot'
        });
        const events: TelemetryFields[] = [];

        reportLinkImportCompleted(
            harness.deps,
            {
                channel: 'bot',
                result,
                staged: 1,
                skipped: 2,
                ingested: 1
            },
            (_env, _context, fields) => {
                events.push(fields);
            }
        );

        const [event] = events;

        assert.ok(event);
        assert.equal(event.event, 'link_import_completed');
        assert.equal(event.result, 'ok');
        assert.equal(event.shop, 'rozetka');
        assert.equal(event.imagesStaged, 'oneToFour');
        assert.equal(event.imagesSkipped, 'oneToFour');
        assert.equal(event.imagesIngested, 'oneToFour');

        const serialized = JSON.stringify(toWishlistAttributes(event, 'local'));

        assert.equal(serialized.includes('rozetka.com.ua'), false);
        assert.equal(serialized.includes(SECRET_TITLE), false);
        assert.equal(serialized.includes('1299'), false);
    });
});

describe('import cache purge', () => {
    it('deletes expired entries and images across pages', async () => {
        const memory = createMemoryBucket({ pageSize: 2 });
        const expired = String(NOW - 1);
        const fresh = String(NOW + HOUR_MS);

        memory.seed(importMetaKey('a'.repeat(32)), '{}', {
            customMetadata: { expiresAt: expired }
        });
        memory.seed(importImageKey('a'.repeat(32), 0), JPEG_BYTES, {
            customMetadata: { expiresAt: expired }
        });
        memory.seed(importMetaKey('b'.repeat(32)), '{}', {
            customMetadata: { expiresAt: fresh }
        });
        memory.seed(importImageKey('b'.repeat(32), 0), JPEG_BYTES, {
            uploaded: new Date(NOW - 25 * HOUR_MS)
        });
        memory.seed('f'.repeat(64), JPEG_BYTES, {
            uploaded: new Date(NOW - 30 * 24 * HOUR_MS)
        });

        const purged = await createLinkImportCache(memory.bucket).purgeExpired(
            NOW
        );

        assert.equal(purged, 3);
        assert.deepEqual(
            memory.keys(),
            [importMetaKey('b'.repeat(32)), 'f'.repeat(64)].sort()
        );
    });

    it('treats unreadable entries as misses', async () => {
        const memory = createMemoryBucket();
        const warnings = mock.method(console, 'warn', () => undefined);

        memory.seed(importMetaKey(URL_HASH), 'not json');

        try {
            assert.equal(
                await createLinkImportCache(memory.bucket, () => NOW).get(
                    URL_HASH
                ),
                null
            );
            assert.match(
                String(warnings.mock.calls[0]?.arguments[0]),
                /link_import_cache_failed/
            );
        } finally {
            warnings.mock.restore();
        }

        memory.seed(
            importMetaKey(URL_HASH),
            JSON.stringify({
                ...buildCacheEntry({
                    outcome: 'ok',
                    normalizedUrl: PRODUCT_URL,
                    product: product(),
                    storedAt: NOW
                }),
                version: 2
            })
        );
        assert.equal(
            await createLinkImportCache(memory.bucket, () => NOW).get(URL_HASH),
            null
        );
        assert.equal(
            await createLinkImportCache(undefined).purgeExpired(NOW),
            0
        );
    });

    it('runs from the daily cron and never fails the scheduled run', async () => {
        const purgeCalls: number[] = [];
        const logs = mock.method(console, 'log', () => undefined);
        const errors = mock.method(console, 'error', () => undefined);

        try {
            const env = { BOT_ENVIRONMENT: 'local' } as WorkerBindings;
            const controller = {
                cron: '0 0 * * *',
                scheduledTime: NOW,
                noRetry() {}
            } as ScheduledController;

            await runScheduledTasks(controller, env, {} as ExecutionContext, {
                async purgeLinkImportCache(_env, now) {
                    purgeCalls.push(now);

                    return 2;
                }
            });
            await runScheduledTasks(controller, env, {} as ExecutionContext, {
                async purgeLinkImportCache() {
                    throw new TypeError('r2 unavailable');
                }
            });
            await runScheduledTasks(
                { ...controller, cron: '*/10 * * * *' },
                env,
                {} as ExecutionContext,
                {
                    async broadcastRelease() {
                        return null;
                    },
                    async purgeLinkImportCache(_env, now) {
                        purgeCalls.push(now);

                        return 0;
                    }
                }
            );

            const logged = logs.mock.calls.map(call => {
                return String(call.arguments[0]);
            });
            const failed = errors.mock.calls.map(call => {
                return String(call.arguments[0]);
            });

            assert.equal(purgeCalls.length, 1);
            assert.ok(
                logged.some(line => {
                    return (
                        line.includes('link_import_cache_purged') &&
                        line.includes('"purgedLinkImportObjects":2')
                    );
                })
            );
            assert.ok(
                failed.some(line => {
                    return (
                        line.includes('link_import_cache_purge_failed') &&
                        !line.includes('r2 unavailable')
                    );
                })
            );
        } finally {
            logs.mock.restore();
            errors.mock.restore();
        }
    });
});

describe('wish image cleanup', () => {
    it('never deletes link import objects while releasing orphaned wish images', async () => {
        const memory = createMemoryBucket();
        const crypto = createNodeApiCrypto();
        const importKeys = [
            importMetaKey(URL_HASH),
            importImageKey(URL_HASH, 0),
            importImageKey(URL_HASH, 1)
        ];

        for (const key of importKeys) {
            memory.seed(key, 'x');
        }

        await releaseOrphanedImages(
            {
                repositories: {
                    wishes: {
                        listReferencedFileIds: () => {
                            return Effect.succeed(new Set<string>());
                        }
                    }
                } as never,
                bucket: memory.bucket,
                crypto
            },
            ['orphan-file-id', ...importKeys]
        );

        assert.deepEqual(
            memory.keys().filter(key => {
                return key.startsWith('import/');
            }),
            [...importKeys].sort()
        );
        assert.ok(memory.calls.delete.length >= 1);
        assert.ok(
            memory.calls.delete.every(key => {
                return /^[0-9a-f]{64}$/.test(key);
            })
        );
    });
});
