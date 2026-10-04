import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    matchesDeclaredImageType,
    sniffImageType
} from '../src/api/photos/image-signature';
import {
    countUnsupportedSkips,
    createImageStaging
} from '../src/bot/services/link-import/stage-images';
import {
    importImageKey,
    importMetaKey
} from '../src/bot/services/link-import/storage-keys';
import { buildCacheEntry } from '../src/bot/services/link-import/result-cache';
import {
    isSkippedStagedImage,
    type ExtractedProduct,
    type LinkImportDeps
} from '../src/bot/services/link-import/types';
import {
    LINK_IMPORT_IMAGE_MAX_BYTES,
    LINK_IMPORT_IMAGE_TIMEOUT_MS
} from '../src/shared/app-api';
import {
    AVIF_BYTES,
    createFakeSafeFetcher,
    createLinkImportEnv,
    createMemoryBucket,
    GIF_BYTES,
    JPEG_BYTES,
    padBytes,
    PNG_BYTES,
    toArrayBuffer,
    WEBP_BYTES,
    type FakeImageResponse,
    type FakeSafeFetcher,
    type MemoryBucket
} from './fixtures/link-import-fakes';

const URL_HASH = '0123456789abcdef0123456789abcdef';
const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const BUDGET_MS = 8000;

const imageUrl = (index: number) => {
    return `https://shop.example/images/${index}.img`;
};

interface Harness {
    memory: MemoryBucket;
    fetcher: FakeSafeFetcher;
    deps: LinkImportDeps;
    clock: { now: number };
    stage(
        indexes: number[],
        count?: number
    ): ReturnType<ReturnType<typeof createImageStaging>['stageImages']>;
    staging: ReturnType<typeof createImageStaging>;
}

const createHarness = (input: { responses: FakeImageResponse[] }): Harness => {
    const memory = createMemoryBucket();
    const fetcher = createFakeSafeFetcher({
        images: Object.fromEntries(
            input.responses.map((response, index) => {
                return [imageUrl(index), response];
            })
        )
    });
    const clock = { now: NOW };
    const deps: LinkImportDeps = {
        env: createLinkImportEnv({ bucket: memory.bucket }),
        now: () => clock.now
    };
    const staging = createImageStaging(() => fetcher);

    return {
        memory,
        fetcher,
        deps,
        clock,
        staging,
        stage(indexes, count = input.responses.length) {
            return staging.stageImages(deps, {
                urlHash: URL_HASH,
                imageUrls: Array.from({ length: count }, (_, index) => {
                    return imageUrl(index);
                }),
                indexes,
                budgetMs: BUDGET_MS
            });
        }
    };
};

describe('image signature sniffing', () => {
    it('detects every supported format from magic bytes only', () => {
        assert.equal(sniffImageType(toArrayBuffer(JPEG_BYTES)), 'image/jpeg');
        assert.equal(sniffImageType(toArrayBuffer(PNG_BYTES)), 'image/png');
        assert.equal(sniffImageType(toArrayBuffer(WEBP_BYTES)), 'image/webp');
        assert.equal(sniffImageType(toArrayBuffer(GIF_BYTES)), 'image/gif');
        assert.equal(sniffImageType(toArrayBuffer(AVIF_BYTES)), 'image/avif');
    });

    it('detects AVIF from a compatible brand and rejects other ftyp files', () => {
        const compatibleOnly = AVIF_BYTES.slice();

        compatibleOnly.set([0x6d, 0x69, 0x66, 0x31], 8);
        assert.equal(
            sniffImageType(toArrayBuffer(compatibleOnly)),
            'image/avif'
        );

        const mp4 = AVIF_BYTES.slice();

        mp4.set([0x69, 0x73, 0x6f, 0x6d], 8);
        mp4.set([0x69, 0x73, 0x6f, 0x6d], 16);
        assert.equal(sniffImageType(toArrayBuffer(mp4)), null);
    });

    it('returns null for markup and short buffers', () => {
        const svg = new TextEncoder().encode('<svg xmlns="x"></svg>');

        assert.equal(sniffImageType(toArrayBuffer(svg)), null);
        assert.equal(sniffImageType(new ArrayBuffer(2)), null);
    });

    it('keeps the declared-type check for uploads unchanged', () => {
        assert.equal(
            matchesDeclaredImageType(toArrayBuffer(AVIF_BYTES), 'image/jpeg'),
            false
        );
        assert.equal(
            matchesDeclaredImageType(toArrayBuffer(WEBP_BYTES), 'image/webp'),
            true
        );
    });
});

describe('image staging', () => {
    it('passes JPEG, PNG and WebP through and stores them under the import prefix', async () => {
        const harness = createHarness({
            responses: [
                { bytes: JPEG_BYTES },
                { bytes: PNG_BYTES },
                { bytes: WEBP_BYTES, contentType: 'image/jpeg' }
            ]
        });
        const outcome = await harness.stage([0, 1, 2]);

        assert.deepEqual(outcome.skipped, []);
        assert.deepEqual(
            outcome.staged.map(image => {
                return [image.index, image.contentType];
            }),
            [
                [0, 'image/jpeg'],
                [1, 'image/png'],
                [2, 'image/webp']
            ]
        );
        assert.deepEqual(harness.memory.keys(), [
            importImageKey(URL_HASH, 0),
            importImageKey(URL_HASH, 1),
            importImageKey(URL_HASH, 2)
        ]);
        assert.equal(
            harness.memory.objects.get(importImageKey(URL_HASH, 2))
                ?.httpMetadata.contentType,
            'image/webp'
        );

        for (const key of harness.memory.keys()) {
            assert.equal(key.includes('shop.example'), false);
        }
    });

    it('requests images with the image timeout and the Telegram byte cap', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });

        await harness.stage([0]);

        assert.deepEqual(harness.fetcher.imageCalls[0]?.options, {
            timeoutMs: LINK_IMPORT_IMAGE_TIMEOUT_MS,
            maxBytes: LINK_IMPORT_IMAGE_MAX_BYTES
        });
    });

    it('skips AVIF, GIF, unknown bytes and oversized images as unsupported without transcoding', async () => {
        const harness = createHarness({
            responses: [
                { bytes: WEBP_BYTES },
                { bytes: AVIF_BYTES },
                { bytes: GIF_BYTES },
                { bytes: new TextEncoder().encode('<html></html>') },
                { failure: 'tooLarge' },
                { failure: 'timeout' }
            ]
        });
        const outcome = await harness.stage([0, 1, 2, 3, 4, 5]);

        assert.deepEqual(
            outcome.staged.map(image => {
                return [image.index, image.contentType];
            }),
            [[0, 'image/webp']]
        );
        assert.deepEqual(outcome.skipped, [
            { index: 1, reason: 'unsupportedFormat' },
            { index: 2, reason: 'unsupportedFormat' },
            { index: 3, reason: 'unsupportedFormat' },
            { index: 4, reason: 'unsupportedFormat' },
            { index: 5, reason: 'failed' }
        ]);
        assert.equal(countUnsupportedSkips(outcome), 4);
        assert.deepEqual(harness.memory.keys(), [importImageKey(URL_HASH, 0)]);
    });

    it('keeps a photo at the 10 MiB limit and skips one byte more', async () => {
        const harness = createHarness({
            responses: [
                { bytes: padBytes(JPEG_BYTES, LINK_IMPORT_IMAGE_MAX_BYTES) },
                { bytes: padBytes(PNG_BYTES, LINK_IMPORT_IMAGE_MAX_BYTES + 1) }
            ]
        });
        const outcome = await harness.stage([0, 1]);

        assert.deepEqual(
            outcome.staged.map(image => {
                return [image.index, image.bytes];
            }),
            [[0, LINK_IMPORT_IMAGE_MAX_BYTES]]
        );
        assert.deepEqual(outcome.skipped, [
            { index: 1, reason: 'unsupportedFormat' }
        ]);
    });

    it('reuses an image that is already staged without fetching it again', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });

        await harness.stage([0]);

        const again = await harness.stage([0]);

        assert.equal(harness.fetcher.imageCalls.length, 1);
        assert.deepEqual(again.staged, [
            {
                index: 0,
                contentType: 'image/jpeg',
                bytes: JPEG_BYTES.byteLength
            }
        ]);
    });

    it('ignores out-of-range and duplicate indexes', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });
        const outcome = await harness.stage([0, 0, 1, -1, 9]);

        assert.equal(outcome.staged.length, 1);
        assert.deepEqual(outcome.skipped, []);
    });

    it('stops starting downloads once the staging budget is spent', async () => {
        const harness = createHarness({
            responses: [
                { bytes: JPEG_BYTES },
                { bytes: JPEG_BYTES },
                { bytes: JPEG_BYTES },
                { bytes: JPEG_BYTES }
            ]
        });
        const original = harness.fetcher.fetchImage;

        harness.fetcher.fetchImage = async (url, options) => {
            harness.clock.now += BUDGET_MS;

            return original(url, options);
        };

        const outcome = await harness.stage([0, 1, 2, 3]);

        assert.ok(outcome.staged.length >= 1);
        assert.ok(outcome.skipped.length >= 1);
        assert.equal(outcome.staged.length + outcome.skipped.length, 4);
        assert.equal(harness.fetcher.imageCalls.length, outcome.staged.length);
        assert.ok(
            outcome.skipped.every(skipped => {
                return skipped.reason === 'failed';
            })
        );
    });
});

describe('loading staged images', () => {
    const product: ExtractedProduct = {
        title: 'Kettle',
        description: null,
        price: 999,
        currency: 'UAH',
        images: [imageUrl(0), imageUrl(1)],
        source: 'jsonld',
        canonicalUrl: null,
        finalUrl: 'https://shop.example/p/1'
    };

    it('serves a staged image from R2 without fetching', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });

        harness.memory.seed(importImageKey(URL_HASH, 1), PNG_BYTES, {
            contentType: 'image/png'
        });

        const loaded = await harness.staging.loadStagedImage(harness.deps, {
            urlHash: URL_HASH,
            index: 1
        });

        assert.ok(!isSkippedStagedImage(loaded));
        assert.equal(loaded.contentType, 'image/png');
        assert.equal(harness.fetcher.imageCalls.length, 0);
    });

    it('re-stages a missing image from the cached entry, even an expired one', async () => {
        const harness = createHarness({
            responses: [{ bytes: JPEG_BYTES }, { bytes: WEBP_BYTES }]
        });
        const entry = buildCacheEntry({
            outcome: 'ok',
            normalizedUrl: 'https://shop.example/p/1',
            product,
            storedAt: NOW - 2 * 24 * 60 * 60 * 1000
        });

        harness.memory.seed(importMetaKey(URL_HASH), JSON.stringify(entry));

        const loaded = await harness.staging.loadStagedImage(harness.deps, {
            urlHash: URL_HASH,
            index: 1
        });

        assert.ok(!isSkippedStagedImage(loaded));
        assert.equal(loaded.contentType, 'image/webp');
        assert.deepEqual(
            harness.fetcher.imageCalls.map(call => {
                return call.url;
            }),
            [imageUrl(1)]
        );
        assert.ok(harness.memory.objects.has(importImageKey(URL_HASH, 1)));
    });

    it('reports a failure without a cached entry or for an index past the candidates', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });

        assert.deepEqual(
            await harness.staging.loadStagedImage(harness.deps, {
                urlHash: URL_HASH,
                index: 0
            }),
            { skipped: 'failed' }
        );
        assert.deepEqual(
            await harness.staging.loadStagedImage(harness.deps, {
                urlHash: URL_HASH,
                index: 9
            }),
            { skipped: 'failed' }
        );
        assert.equal(harness.fetcher.imageCalls.length, 0);
    });

    it('reports an unsupported format when re-staging finds a format Telegram does not take', async () => {
        const harness = createHarness({
            responses: [{ bytes: JPEG_BYTES }, { bytes: AVIF_BYTES }]
        });
        const entry = buildCacheEntry({
            outcome: 'ok',
            normalizedUrl: 'https://shop.example/p/1',
            product,
            storedAt: NOW
        });

        harness.memory.seed(importMetaKey(URL_HASH), JSON.stringify(entry));

        assert.deepEqual(
            await harness.staging.loadStagedImage(harness.deps, {
                urlHash: URL_HASH,
                index: 1
            }),
            { skipped: 'unsupportedFormat' }
        );
        assert.equal(
            harness.memory.objects.has(importImageKey(URL_HASH, 1)),
            false
        );
    });
});
