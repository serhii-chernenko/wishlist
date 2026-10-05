import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    RATE_LIMIT_BINDINGS,
    linkHostRateLimitKey,
    selectBoundLimiter,
    selectLinkHostLimiter
} from '../src/api/rate-limit';
import { resolveShop } from '../src/bot/services/link-import/shop';
import {
    APP_API_ROUTES,
    CLIENT_SCREENS,
    LINK_IMPORT_OUTCOMES,
    LINK_IMPORT_SHOPS,
    LINK_IMPORT_SOURCES,
    type LinkImportOutcome
} from '../src/shared/app-api';
import type { WorkerBindings } from '../src/worker/env';
import { isLinkImportAiEnabled, isLinkImportEnabled } from '../src/worker/env';
import {
    LINK_IMPORT_ELAPSED_BUCKETS,
    LINK_IMPORT_IMAGE_BUCKETS,
    imageProxyServedEvent,
    linkImportCompletedEvent,
    normalizeTelemetryPath,
    toLinkImportElapsedBucket,
    toLinkImportImageBucket,
    toWishlistAttributes
} from '../src/worker/telemetry';

interface WranglerBlock {
    vars?: Record<string, string>;
    images?: { binding: string };
    ratelimits?: { name: string; namespace_id: string }[];
    previews?: WranglerBlock;
}

const wrangler = JSON.parse(
    readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
) as WranglerBlock & { env: { production: WranglerBlock } };

const wranglerBlocks = {
    local: wrangler,
    production: wrangler.env.production,
    previews: wrangler.env.production.previews ?? {}
};

test('the link import routes keep their contract', () => {
    assert.deepEqual(APP_API_ROUTES.importLink, {
        method: 'POST',
        path: '/link-import',
        access: 'user',
        bucket: 'import',
        body: 'json',
        status: 200
    });
    assert.deepEqual(APP_API_ROUTES.importWishImage, {
        method: 'POST',
        path: '/wishes/:id/images/import',
        access: 'user',
        bucket: 'upload',
        body: 'json',
        status: 200
    });
    assert.ok(CLIENT_SCREENS.includes('linkImport'));
});

test('the import bucket and the host limiter resolve to their bindings', () => {
    const limiter = { limit: () => Promise.resolve({ success: true }) };
    const env = {
        APP_IMPORT_LIMITER: limiter,
        LINK_HOST_LIMITER: limiter
    } as unknown as WorkerBindings;

    assert.equal(RATE_LIMIT_BINDINGS.import, 'APP_IMPORT_LIMITER');
    assert.equal(selectBoundLimiter(env, 'import'), limiter);
    assert.equal(selectLinkHostLimiter(env), limiter);
    assert.equal(selectLinkHostLimiter({} as WorkerBindings), null);
    assert.equal(linkHostRateLimitKey('rozetka.com.ua'), 'host:rozetka.com.ua');
});

test('the kill switch and the AI flag are read as exact strings', () => {
    assert.equal(isLinkImportEnabled({ LINK_IMPORT_ENABLED: 'true' }), true);
    assert.equal(isLinkImportEnabled({ LINK_IMPORT_ENABLED: 'false' }), false);
    assert.equal(isLinkImportAiEnabled({}), false);
    assert.equal(isLinkImportAiEnabled({ LINK_IMPORT_AI: 'true' }), true);
});

test('every wrangler block declares the link import limiters and flags and no image transforms', () => {
    const namespaces = new Set<string>();

    for (const [name, block] of Object.entries(wranglerBlocks)) {
        assert.equal(block.images, undefined, name);
        assert.equal(block.vars?.LINK_IMPORT_AI, 'false', name);

        for (const limiter of ['APP_IMPORT_LIMITER', 'LINK_HOST_LIMITER']) {
            const entry = block.ratelimits?.find(candidate => {
                return candidate.name === limiter;
            });

            assert.ok(entry, `${name} ${limiter}`);
            assert.equal(namespaces.has(entry.namespace_id), false);
            namespaces.add(entry.namespace_id);
        }
    }

    assert.equal(wranglerBlocks.local.vars?.LINK_IMPORT_ENABLED, 'true');
    assert.equal(wranglerBlocks.previews.vars?.LINK_IMPORT_ENABLED, 'true');
    assert.equal(wranglerBlocks.production.vars?.LINK_IMPORT_ENABLED, 'true');
});

test('shops resolve by registrable name and everything else is other', () => {
    assert.equal(resolveShop('rozetka.com.ua'), 'rozetka');
    assert.equal(resolveShop('www.amazon.de'), 'amazon');
    assert.equal(resolveShop('m.olx.ua'), 'olx');
    assert.equal(resolveShop('www.ikea.com'), 'ikea');
    assert.equal(resolveShop('shop.example.com'), 'other');
    assert.equal(resolveShop('rozetka.evil.example'), 'other');
    assert.equal(resolveShop('com.ua'), 'other');
    assert.equal(resolveShop('localhost'), 'other');
});

test('elapsed and image buckets are letter-led labels at the documented bounds', () => {
    assert.equal(toLinkImportElapsedBucket(0), 'instant');
    assert.equal(toLinkImportElapsedBucket(299), 'instant');
    assert.equal(toLinkImportElapsedBucket(300), 'quick');
    assert.equal(toLinkImportElapsedBucket(2999), 'normal');
    assert.equal(toLinkImportElapsedBucket(5999), 'slow');
    assert.equal(toLinkImportElapsedBucket(6000), 'verySlow');
    assert.equal(toLinkImportImageBucket(0), 'none');
    assert.equal(toLinkImportImageBucket(1), 'oneToFour');
    assert.equal(toLinkImportImageBucket(4), 'oneToFour');
    assert.equal(toLinkImportImageBucket(5), 'fivePlus');
    assert.equal(toLinkImportImageBucket(9), 'fivePlus');
    assert.equal(LINK_IMPORT_ELAPSED_BUCKETS.length, 5);
    assert.equal(LINK_IMPORT_IMAGE_BUCKETS.length, 3);
});

test('the link import event keeps only closed labels for every enum value', () => {
    for (const shop of LINK_IMPORT_SHOPS) {
        for (const result of LINK_IMPORT_OUTCOMES) {
            for (const source of [null, ...LINK_IMPORT_SOURCES]) {
                const attributes = toWishlistAttributes(
                    linkImportCompletedEvent({
                        channel: 'app',
                        result,
                        source,
                        shop,
                        cacheOutcome: 'miss',
                        imagesStaged: 5,
                        imagesSkipped: 2,
                        imagesIngested: 0,
                        elapsedMs: 1200
                    }),
                    'production'
                );

                assert.equal(
                    Object.values(attributes).includes('invalid'),
                    false
                );
            }
        }
    }
});

test('the link import event reports the result, the channel path and no raw values', () => {
    const attributes = toWishlistAttributes(
        linkImportCompletedEvent({
            channel: 'bot',
            result: 'partial',
            source: 'og',
            shop: 'other',
            cacheOutcome: 'hit',
            imagesStaged: 3,
            imagesSkipped: 6,
            imagesIngested: 2,
            elapsedMs: 250
        }),
        'production'
    );

    assert.deepEqual(attributes, {
        eventName: 'link_import_completed',
        path: '/telegram/webhook',
        outcome: 'success',
        channel: 'bot',
        result: 'partial',
        source: 'og',
        shop: 'other',
        cacheOutcome: 'hit',
        imagesStaged: 'oneToFour',
        imagesSkipped: 'fivePlus',
        imagesIngested: 'oneToFour',
        elapsedBucket: 'instant',
        botEnvironment: 'production'
    });
});

test('result labels map to success, rejected and error outcomes', () => {
    const outcomes = Object.fromEntries(
        LINK_IMPORT_OUTCOMES.map((result: LinkImportOutcome) => {
            const event = linkImportCompletedEvent({
                channel: 'app',
                result,
                source: null,
                shop: 'other',
                cacheOutcome: 'miss',
                imagesStaged: 0,
                imagesSkipped: 0,
                imagesIngested: 0,
                elapsedMs: 0
            });

            return [result, event.outcome];
        })
    );

    assert.deepEqual(outcomes, {
        ok: 'success',
        partial: 'success',
        blocked: 'rejected',
        notProduct: 'rejected',
        timeout: 'error',
        invalidUrl: 'rejected',
        rateLimited: 'rejected'
    });
});

test('the import image path normalizes to its prefix', () => {
    assert.equal(
        normalizeTelemetryPath(
            '/img/i/0123456789abcdef0123456789abcdef/0',
            null
        ),
        '/img/i'
    );
});

test('import previews report the import scope under the import path', () => {
    const attributes = toWishlistAttributes(
        imageProxyServedEvent({
            scope: 'import',
            result: 'miss',
            status: 200,
            elapsedMs: 40
        }),
        'production'
    );

    assert.equal(attributes.path, '/img/i');
    assert.equal(attributes.scope, 'import');
});
