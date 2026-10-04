import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createLinkImportCache } from '../../src/bot/services/link-import/result-cache';
import {
    importImageKey,
    importMetaKey,
    importUsageKey
} from '../../src/bot/services/link-import/storage-keys';
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const EXPIRED_HASH = 'a'.repeat(32);
const FRESH_HASH = 'b'.repeat(32);
const WISH_IMAGE_KEY = 'c'.repeat(64);

describe('link import purge on R2', () => {
    let harness: D1Harness;

    const putWithExpiry = (key: string, expiresAt: number) => {
        return harness.env.IMAGES.put(key, 'x', {
            customMetadata: { expiresAt: String(expiresAt) }
        });
    };

    before(async () => {
        harness = await createD1Harness();
    });

    after(async () => {
        await harness.dispose();
    });

    it('lists custom metadata and deletes only expired import objects', async () => {
        await putWithExpiry(importMetaKey(EXPIRED_HASH), NOW - 1);
        await putWithExpiry(importImageKey(EXPIRED_HASH, 0), NOW - 1);
        await putWithExpiry(importUsageKey('2026-09-30'), NOW - 1);
        await putWithExpiry(importMetaKey(FRESH_HASH), NOW + 1000);
        await putWithExpiry(importUsageKey('2026-10-04'), NOW + 1000);
        await harness.env.IMAGES.put(WISH_IMAGE_KEY, 'x');

        const purged = await createLinkImportCache(
            harness.env.IMAGES
        ).purgeExpired(NOW);
        const remaining = await harness.env.IMAGES.list();

        assert.equal(purged, 3);
        assert.deepEqual(
            remaining.objects
                .map(object => {
                    return object.key;
                })
                .sort(),
            [
                importMetaKey(FRESH_HASH),
                importUsageKey('2026-10-04'),
                WISH_IMAGE_KEY
            ].sort()
        );
    });
});
