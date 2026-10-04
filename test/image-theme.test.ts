import assert from 'node:assert/strict';
import test from 'node:test';

import { createSigner } from '../src/api/auth/signing';
import { withImageTheme, parseImageTheme } from '../src/shared/image-theme';
import { createNodeApiCrypto, TEST_BOT_TOKEN } from './fixtures/app-auth';

const HASH = '0123456789abcdef';
const NOW = new Date('2026-10-01T00:00:00Z');

test('the theme parameter is appended to app and share image paths only', () => {
    assert.equal(
        withImageTheme(`/img/s/pid/7/0/${HASH}`, 'dark'),
        `/img/s/pid/7/0/${HASH}?t=dark`
    );
    assert.equal(
        withImageTheme(`/img/w/7/0/${HASH}?e=1&s=abc-_`, 'light'),
        `/img/w/7/0/${HASH}?e=1&s=abc-_&t=light`
    );
    assert.equal(
        withImageTheme('blob:https://wishlist.test/uuid', 'dark'),
        'blob:https://wishlist.test/uuid'
    );
    assert.equal(
        withImageTheme(`/img/i/${HASH}/0?e=1&s=x`, 'dark'),
        `/img/i/${HASH}/0?e=1&s=x`
    );
});

test('applying a theme twice replaces the earlier one', () => {
    const once = withImageTheme(`/img/w/7/0/${HASH}?e=1&s=x`, 'light');

    assert.equal(
        withImageTheme(once, 'dark'),
        `/img/w/7/0/${HASH}?e=1&s=x&t=dark`
    );
});

test('only light and dark are accepted as image themes', () => {
    assert.equal(parseImageTheme('light'), 'light');
    assert.equal(parseImageTheme('dark'), 'dark');
    assert.equal(parseImageTheme('system'), undefined);
    assert.equal(parseImageTheme(''), undefined);
    assert.equal(parseImageTheme(null), undefined);
    assert.equal(parseImageTheme(undefined), undefined);
});

test('the theme parameter is not part of the signed payload, so a signed url verifies with it', async () => {
    const signer = createSigner({
        botToken: TEST_BOT_TOKEN,
        environment: 'production',
        crypto: createNodeApiCrypto()
    });
    const url = await signer.buildImageUrl(
        { wishId: 7, index: 0, hash: HASH },
        NOW
    );
    const themed = new URL(withImageTheme(url, 'dark'), 'https://x.test');
    const verification = await signer.verifyImage(
        { wishId: 7, index: 0, hash: HASH },
        {
            expiresAt: Number(themed.searchParams.get('e')),
            signature: themed.searchParams.get('s') ?? ''
        },
        NOW
    );

    assert.equal(themed.searchParams.get('t'), 'dark');
    assert.equal(verification.ok, true);
});
