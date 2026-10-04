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
    importMetaKey,
    importUsageKey
} from '../src/bot/services/link-import/storage-keys';
import {
    createTransformBudget,
    LINK_IMPORT_DAILY_TRANSFORM_CAP,
    toUsageDate
} from '../src/bot/services/link-import/transform-budget';
import { buildCacheEntry } from '../src/bot/services/link-import/result-cache';
import type {
    ExtractedProduct,
    LinkImportDeps
} from '../src/bot/services/link-import/types';
import {
    LINK_IMPORT_IMAGE_TIMEOUT_MS,
    LINK_IMPORT_PASSTHROUGH_MAX_BYTES
} from '../src/shared/app-api';
import {
    AVIF_BYTES,
    createFakeImagesBinding,
    createFakeSafeFetcher,
    createLinkImportEnv,
    createMemoryBucket,
    GIF_BYTES,
    JPEG_BYTES,
    padBytes,
    PNG_BYTES,
    toArrayBuffer,
    TRANSCODED_JPEG_BYTES,
    WEBP_BYTES,
    type FakeImageResponse,
    type FakeImagesBinding,
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
    images: FakeImagesBinding | null;
    fetcher: FakeSafeFetcher;
    deps: LinkImportDeps;
    clock: { now: number };
    stage(
        indexes: number[],
        count?: number
    ): ReturnType<ReturnType<typeof createImageStaging>['stageImagesDetailed']>;
    staging: ReturnType<typeof createImageStaging>;
}

const createHarness = (input: {
    responses: FakeImageResponse[];
    withBinding?: boolean;
}): Harness => {
    const memory = createMemoryBucket();
    const images =
        input.withBinding === false ? null : createFakeImagesBinding();
    const fetcher = createFakeSafeFetcher({
        images: Object.fromEntries(
            input.responses.map((response, index) => {
                return [imageUrl(index), response];
            })
        )
    });
    const clock = { now: NOW };
    const deps: LinkImportDeps = {
        env: createLinkImportEnv({
            bucket: memory.bucket,
            ...(images === null ? {} : { images: images.binding })
        }),
        now: () => clock.now
    };
    const staging = createImageStaging(() => fetcher);

    return {
        memory,
        images,
        fetcher,
        deps,
        clock,
        staging,
        stage(indexes, count = input.responses.length) {
            return staging.stageImagesDetailed(deps, {
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

const seedUsage = (memory: MemoryBucket, count: number, at = NOW) => {
    memory.seed(importUsageKey(toUsageDate(at)), JSON.stringify({ count }), {
        contentType: 'application/json'
    });
};

const readUsage = async (memory: MemoryBucket, at = NOW) => {
    const object = await memory.bucket.get(importUsageKey(toUsageDate(at)));

    return object === null ? null : JSON.parse(await object.text());
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

describe('daily transform budget', () => {
    it('allows transforms up to the cap and then refuses', async () => {
        const memory = createMemoryBucket();
        const budget = createTransformBudget(memory.bucket, () => NOW, 2);

        assert.equal(await budget.tryConsume(), true);
        assert.equal(await budget.tryConsume(), true);
        assert.equal(await budget.tryConsume(), false);
        assert.deepEqual(await readUsage(memory), { count: 2 });
        assert.equal(LINK_IMPORT_DAILY_TRANSFORM_CAP, 50);
    });

    it('serializes concurrent consumption within one budget', async () => {
        const memory = createMemoryBucket();
        const budget = createTransformBudget(memory.bucket, () => NOW, 3);
        const results = await Promise.all(
            Array.from({ length: 5 }, () => {
                return budget.tryConsume();
            })
        );

        assert.deepEqual(results, [true, true, true, false, false]);
    });

    it('rolls the counter over at the UTC date boundary', async () => {
        const memory = createMemoryBucket();
        const clock = { now: Date.parse('2026-10-04T23:59:59.000Z') };
        const budget = createTransformBudget(memory.bucket, () => clock.now);

        seedUsage(memory, LINK_IMPORT_DAILY_TRANSFORM_CAP, clock.now);
        assert.equal(await budget.tryConsume(), false);

        clock.now = Date.parse('2026-10-05T00:00:01.000Z');
        assert.equal(await budget.tryConsume(), true);
        assert.deepEqual(memory.keys(), [
            'import/_usage/2026-10-04.json',
            'import/_usage/2026-10-05.json'
        ]);

        const usage = memory.objects.get('import/_usage/2026-10-05.json');

        assert.equal(
            usage?.customMetadata.expiresAt,
            String(Date.parse('2026-10-09T00:00:00.000Z'))
        );
    });

    it('refuses transforms without a bucket', async () => {
        const budget = createTransformBudget(undefined, () => NOW);

        assert.equal(await budget.tryConsume(), false);
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
                return [image.index, image.contentType, image.transform];
            }),
            [
                [0, 'image/jpeg', 'passthrough'],
                [1, 'image/png', 'passthrough'],
                [2, 'image/webp', 'passthrough']
            ]
        );
        assert.deepEqual(harness.memory.keys(), [
            importImageKey(URL_HASH, 0),
            importImageKey(URL_HASH, 1),
            importImageKey(URL_HASH, 2)
        ]);
        assert.equal(harness.images?.transformCalls, 0);
        assert.equal(
            harness.memory.objects.get(importImageKey(URL_HASH, 2))
                ?.httpMetadata.contentType,
            'image/webp'
        );

        for (const key of harness.memory.keys()) {
            assert.equal(key.includes('shop.example'), false);
        }
    });

    it('requests images with the image timeout and the binding byte cap', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });

        await harness.stage([0]);

        assert.deepEqual(harness.fetcher.imageCalls[0]?.options, {
            timeoutMs: LINK_IMPORT_IMAGE_TIMEOUT_MS,
            maxBytes: 10 * 1024 * 1024
        });
    });

    it('transcodes AVIF and GIF with the binding and counts each transform', async () => {
        const harness = createHarness({
            responses: [{ bytes: AVIF_BYTES }, { bytes: GIF_BYTES }]
        });
        const outcome = await harness.stage([0, 1]);

        assert.deepEqual(
            outcome.staged.map(image => {
                return [image.contentType, image.transform];
            }),
            [
                ['image/jpeg', 'binding'],
                ['image/jpeg', 'binding']
            ]
        );
        assert.equal(harness.images?.transformCalls, 2);
        assert.deepEqual(await readUsage(harness.memory), { count: 2 });

        const stored = await harness.staging.loadStagedImage(harness.deps, {
            urlHash: URL_HASH,
            index: 0
        });

        assert.deepEqual(
            new Uint8Array(stored?.body ?? new ArrayBuffer(0)),
            TRANSCODED_JPEG_BYTES
        );
    });

    it('transcodes passthrough formats over 5 MiB or over the Telegram dimension limit', async () => {
        const harness = createHarness({
            responses: [
                {
                    bytes: padBytes(
                        JPEG_BYTES,
                        LINK_IMPORT_PASSTHROUGH_MAX_BYTES + 1
                    )
                }
            ]
        });

        assert.equal(
            (await harness.stage([0])).staged[0]?.transform,
            'binding'
        );

        const tall = createHarness({ responses: [{ bytes: PNG_BYTES }] });

        assert.ok(tall.images);
        tall.images.dimensions = { width: 4000, height: 7000 };
        assert.equal((await tall.stage([0])).staged[0]?.transform, 'binding');
    });

    it('skips unrecognised bytes the binding cannot read without spending the budget', async () => {
        const harness = createHarness({
            responses: [{ bytes: new TextEncoder().encode('<html></html>') }]
        });

        assert.ok(harness.images);
        harness.images.dimensions = null;

        const outcome = await harness.stage([0]);

        assert.deepEqual(outcome.skipped, [{ index: 0, reason: 'failed' }]);
        assert.equal(harness.images.transformCalls, 0);
        assert.equal(await readUsage(harness.memory), null);
    });

    it('skips images with an aspect ratio Telegram rejects', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });

        assert.ok(harness.images);
        harness.images.dimensions = { width: 4200, height: 200 };

        const outcome = await harness.stage([0]);

        assert.deepEqual(outcome.skipped, [{ index: 0, reason: 'failed' }]);
        assert.equal(countUnsupportedSkips(outcome), 0);
    });

    it('falls back to passthrough and drops AVIF when the daily cap is reached', async () => {
        const harness = createHarness({
            responses: [
                { bytes: AVIF_BYTES },
                { bytes: WEBP_BYTES },
                {
                    bytes: padBytes(
                        PNG_BYTES,
                        LINK_IMPORT_PASSTHROUGH_MAX_BYTES + 1
                    )
                }
            ]
        });

        seedUsage(harness.memory, LINK_IMPORT_DAILY_TRANSFORM_CAP);

        const outcome = await harness.stage([0, 1, 2]);

        assert.deepEqual(
            outcome.staged.map(image => {
                return [image.index, image.transform];
            }),
            [[1, 'passthrough']]
        );
        assert.deepEqual(outcome.skipped, [
            { index: 0, reason: 'unsupportedFormat' },
            { index: 2, reason: 'unsupportedFormat' }
        ]);
        assert.equal(countUnsupportedSkips(outcome), 2);
        assert.equal(harness.images?.transformCalls, 0);
        assert.deepEqual(await readUsage(harness.memory), {
            count: LINK_IMPORT_DAILY_TRANSFORM_CAP
        });
    });

    it('marks images the binding fails to transcode as unsupported', async () => {
        const harness = createHarness({ responses: [{ bytes: AVIF_BYTES }] });

        assert.ok(harness.images);
        harness.images.failTransform = true;

        const outcome = await harness.stage([0]);

        assert.deepEqual(outcome.skipped, [
            { index: 0, reason: 'unsupportedFormat' }
        ]);
        assert.equal(
            harness.memory.objects.has(importImageKey(URL_HASH, 0)),
            false
        );
    });

    it('passes through without the binding and marks AVIF and oversized images unsupported', async () => {
        const harness = createHarness({
            withBinding: false,
            responses: [
                { bytes: WEBP_BYTES },
                { bytes: AVIF_BYTES },
                { failure: 'tooLarge' },
                { failure: 'timeout' }
            ]
        });
        const outcome = await harness.stage([0, 1, 2, 3]);

        assert.deepEqual(
            outcome.staged.map(image => {
                return [image.index, image.transform];
            }),
            [[0, 'missing']]
        );
        assert.deepEqual(outcome.skipped, [
            { index: 1, reason: 'unsupportedFormat' },
            { index: 2, reason: 'unsupportedFormat' },
            { index: 3, reason: 'failed' }
        ]);
        assert.equal(
            harness.fetcher.imageCalls[0]?.options?.maxBytes,
            LINK_IMPORT_PASSTHROUGH_MAX_BYTES
        );
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
                bytes: JPEG_BYTES.byteLength,
                transform: 'passthrough'
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

        assert.equal(loaded?.contentType, 'image/png');
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

        assert.equal(loaded?.contentType, 'image/webp');
        assert.deepEqual(
            harness.fetcher.imageCalls.map(call => {
                return call.url;
            }),
            [imageUrl(1)]
        );
        assert.ok(harness.memory.objects.has(importImageKey(URL_HASH, 1)));
    });

    it('returns null without a cached entry or for an index past the candidates', async () => {
        const harness = createHarness({ responses: [{ bytes: JPEG_BYTES }] });

        assert.equal(
            await harness.staging.loadStagedImage(harness.deps, {
                urlHash: URL_HASH,
                index: 0
            }),
            null
        );
        assert.equal(
            await harness.staging.loadStagedImage(harness.deps, {
                urlHash: URL_HASH,
                index: 9
            }),
            null
        );
        assert.equal(harness.fetcher.imageCalls.length, 0);
    });
});
