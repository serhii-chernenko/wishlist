import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { createImportSigner } from '../src/api/auth/import-signing';
import type { LinkImportServices } from '../src/api/context';
import type { RateLimiterLike } from '../src/api/rate-limit';
import { importImageKey } from '../src/bot/services/link-import/storage-keys';
import type { LoadStagedImage } from '../src/bot/services/link-import/types';
import { createApp } from '../src/worker/app';
import type { WorkerBindings } from '../src/worker/env';
import type { TelemetryFields } from '../src/worker/telemetry';
import { createNodeApiCrypto, TEST_BOT_TOKEN } from './fixtures/app-auth';
import {
    createMemoryBucket,
    JPEG_BYTES,
    toArrayBuffer,
    WEBP_BYTES,
    type MemoryBucket
} from './fixtures/link-import-fakes';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const URL_HASH = '0123456789abcdef0123456789abcdef';
const CLIENT_IP = '198.51.100.20';

describe('signed import image proxy', () => {
    const crypto = createNodeApiCrypto();
    let memory: MemoryBucket;
    let events: TelemetryFields[];
    let now: Date;
    let limiter: RateLimiterLike | null;
    let loaderCalls: { urlHash: string; index: number }[];
    let loaderResult: Awaited<ReturnType<LoadStagedImage>>;

    const signedUrl = (index: number, urlHash = URL_HASH) => {
        return createImportSigner({
            botToken: TEST_BOT_TOKEN,
            environment: 'production',
            crypto
        }).buildImportImageUrl({ urlHash, index }, NOW);
    };

    const request = (
        path: string,
        options: {
            withLoader?: boolean;
            viaServices?: boolean;
        } = {}
    ) => {
        const loadStagedImage: LoadStagedImage = async (_deps, input) => {
            loaderCalls.push(input);

            return loaderResult;
        };
        const loader =
            options.withLoader === false
                ? {}
                : options.viaServices === true
                  ? {
                        linkImport: {
                            loadStagedImage
                        } as unknown as LinkImportServices
                    }
                  : { loadStagedImage };
        const app = createApp(
            {},
            {},
            {},
            {},
            {
                now: () => now,
                crypto,
                selectLimiter: () => limiter,
                emitTelemetry: (_env, _context, fields) => {
                    events.push(fields);
                },
                ...loader
            }
        );
        const env = {
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            IMAGES: memory.bucket
        } as unknown as WorkerBindings;

        return app.request(
            path,
            { headers: { 'cf-connecting-ip': CLIENT_IP } },
            env
        );
    };

    const servedEvents = () => {
        return events
            .filter(event => {
                return event.event === 'image_proxy_served';
            })
            .map(event => {
                return `${event.scope}:${event.result}:${event.status}`;
            });
    };

    beforeEach(() => {
        memory = createMemoryBucket();
        events = [];
        now = NOW;
        limiter = null;
        loaderCalls = [];
        loaderResult = { skipped: 'failed' };
    });

    it('serves a staged image from R2 with private, same-origin, sandboxed headers', async () => {
        memory.seed(importImageKey(URL_HASH, 2), WEBP_BYTES, {
            contentType: 'image/webp'
        });

        const response = await request(await signedUrl(2));

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/webp');
        assert.equal(
            response.headers.get('Cache-Control'),
            'private, max-age=3600'
        );
        assert.equal(
            response.headers.get('Cross-Origin-Resource-Policy'),
            'same-origin'
        );
        assert.equal(
            response.headers.get('Content-Security-Policy'),
            "default-src 'none'; sandbox"
        );
        assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
        assert.deepEqual(
            new Uint8Array(await response.arrayBuffer()),
            WEBP_BYTES
        );
        assert.deepEqual(loaderCalls, []);
        assert.deepEqual(servedEvents(), ['import:hit:200']);
        assert.equal(
            events.find(event => {
                return event.event === 'image_proxy_served';
            })?.path,
            '/img/i'
        );
    });

    it('re-stages on a miss through the injected loader', async () => {
        loaderResult = {
            body: toArrayBuffer(JPEG_BYTES),
            contentType: 'image/jpeg'
        };

        const response = await request(await signedUrl(0));

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
        assert.deepEqual(loaderCalls, [{ urlHash: URL_HASH, index: 0 }]);
        assert.deepEqual(servedEvents(), ['import:miss:200']);
    });

    it('serves the placeholder when the image cannot be staged', async () => {
        const response = await request(await signedUrl(1));

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/svg+xml');
        assert.equal(
            response.headers.get('Cache-Control'),
            'private, max-age=300'
        );
        assert.deepEqual(servedEvents(), ['import:placeholder:200']);

        const withoutLoader = await request(await signedUrl(1), {
            withLoader: false
        });

        assert.equal(
            withoutLoader.headers.get('Content-Type'),
            'image/svg+xml'
        );
    });

    it('re-stages through the wired link import services on a miss', async () => {
        loaderResult = {
            body: JPEG_BYTES.buffer as ArrayBuffer,
            contentType: 'image/jpeg'
        };

        const response = await request(await signedUrl(3), {
            viaServices: true
        });

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
        assert.deepEqual(loaderCalls, [{ urlHash: URL_HASH, index: 3 }]);
    });

    it('rejects forged, expired and malformed URLs before touching R2', async () => {
        memory.seed(importImageKey(URL_HASH, 0), JPEG_BYTES, {
            contentType: 'image/jpeg'
        });

        const valid = await signedUrl(0);
        const forged = valid.replace(/s=[^&]+/, `s=${'A'.repeat(43)}`);
        const otherIndex = valid.replace(`/${URL_HASH}/0?`, `/${URL_HASH}/1?`);

        assert.equal((await request(forged)).status, 403);
        assert.equal((await request(otherIndex)).status, 403);
        assert.equal((await request(`/img/i/${URL_HASH}/0?s=abc`)).status, 403);
        assert.equal(
            (await request(`/img/i/${URL_HASH.slice(0, 16)}/0?e=1&s=x`)).status,
            404
        );
        assert.equal((await request(await signedUrl(9))).status, 404);
        assert.equal((await request(`/img/i/${URL_HASH}/0/extra`)).status, 404);

        now = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
        assert.equal((await request(valid)).status, 410);
        assert.deepEqual(memory.calls.get, []);
        assert.deepEqual(loaderCalls, []);
    });

    it('applies the image proxy rate limit', async () => {
        limiter = {
            async limit() {
                return { success: false };
            }
        };

        const response = await request(await signedUrl(0));

        assert.equal(response.status, 429);
        assert.equal(response.headers.get('Retry-After'), '60');
        assert.deepEqual(servedEvents(), ['import:rateLimited:429']);
    });
});
