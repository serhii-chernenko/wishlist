import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createSigner,
    getImageUrlExpiry,
    getSigningLabel
} from '../src/api/auth/signing';
import { createNodeApiCrypto, TEST_BOT_TOKEN } from './fixtures/app-auth';

const NOW = new Date('2026-10-03T12:20:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const OWNER_TOKEN_TTL_MS = 12 * HOUR_MS;
const OWNER_ID = 41;
const VIEWER_ID = 7;
const IMAGE = { wishId: 1234, index: 2, hash: '0123456789abcdef' };

const signerFor = (environment = 'production', botToken = TEST_BOT_TOKEN) => {
    return createSigner({
        botToken,
        environment,
        crypto: createNodeApiCrypto()
    });
};

const mint = (signer = signerFor(), now = NOW) => {
    return signer.mintOwnerToken({
        ownerId: OWNER_ID,
        viewerUserId: VIEWER_ID,
        now
    });
};

const parseImageUrl = (url: string) => {
    const parsed = new URL(url, 'https://wishlist.test');

    return {
        path: parsed.pathname,
        expiresAt: Number(parsed.searchParams.get('e')),
        signature: parsed.searchParams.get('s') ?? ''
    };
};

test('owner tokens round-trip for the bound viewer', async () => {
    const signer = signerFor();
    const token = await mint(signer);
    const [owner, expiry, signature] = token.split('.');

    assert.equal(owner, OWNER_ID.toString(36));
    assert.equal(
        Number.parseInt(expiry ?? '', 36),
        Math.floor((NOW.getTime() + OWNER_TOKEN_TTL_MS) / 1000)
    );
    assert.match(signature ?? '', /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(
        await signer.verifyOwnerToken(token, {
            viewerUserId: VIEWER_ID,
            now: NOW
        }),
        {
            ok: true,
            ownerId: OWNER_ID,
            expiresAt: Math.floor((NOW.getTime() + OWNER_TOKEN_TTL_MS) / 1000)
        }
    );
});

test('another viewer cannot use an owner token', async () => {
    const signer = signerFor();

    assert.deepEqual(
        await signer.verifyOwnerToken(await mint(signer), {
            viewerUserId: VIEWER_ID + 1,
            now: NOW
        }),
        { ok: false, reason: 'invalid' }
    );
});

test('owner tokens expire after 12 hours', async () => {
    const signer = signerFor();
    const token = await mint(signer);

    assert.equal(
        (
            await signer.verifyOwnerToken(token, {
                viewerUserId: VIEWER_ID,
                now: new Date(NOW.getTime() + OWNER_TOKEN_TTL_MS - 1000)
            })
        ).ok,
        true
    );
    assert.deepEqual(
        await signer.verifyOwnerToken(token, {
            viewerUserId: VIEWER_ID,
            now: new Date(NOW.getTime() + OWNER_TOKEN_TTL_MS)
        }),
        { ok: false, reason: 'expired' }
    );
});

test('tampered owner tokens are invalid', async () => {
    const signer = signerFor();
    const token = await mint(signer);
    const [owner, expiry, signature = ''] = token.split('.');
    const flipped = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    const later = (Number.parseInt(expiry ?? '', 36) + 3600).toString(36);

    for (const candidate of [
        `${(OWNER_ID + 1).toString(36)}.${expiry}.${signature}`,
        `${owner}.${later}.${signature}`,
        `${owner}.${expiry}.${flipped}`,
        `0${owner}.${expiry}.${signature}`,
        `${owner}.${expiry}`,
        `${token}.extra`,
        '',
        'not-a-token'
    ]) {
        assert.deepEqual(
            await signer.verifyOwnerToken(candidate, {
                viewerUserId: VIEWER_ID,
                now: NOW
            }),
            { ok: false, reason: 'invalid' },
            candidate
        );
    }
});

test('an image signature is never a valid owner token', async () => {
    const signer = signerFor();
    const { expiresAt, signature } = await signer.signImage(IMAGE, NOW);
    const forged = `${OWNER_ID.toString(36)}.${expiresAt.toString(36)}.${signature}`;

    assert.deepEqual(
        await signer.verifyOwnerToken(forged, {
            viewerUserId: VIEWER_ID,
            now: NOW
        }),
        { ok: false, reason: 'invalid' }
    );
});

test('tokens and image URLs do not cross environments or bot tokens', async () => {
    const production = signerFor('production');
    const preview = signerFor('preview');
    const otherBot = signerFor('production', '654321:OTHER');
    const token = await mint(production);
    const imageUrl = parseImageUrl(await production.buildImageUrl(IMAGE, NOW));

    for (const signer of [preview, otherBot]) {
        assert.deepEqual(
            await signer.verifyOwnerToken(token, {
                viewerUserId: VIEWER_ID,
                now: NOW
            }),
            { ok: false, reason: 'invalid' }
        );
        assert.deepEqual(await signer.verifyImage(IMAGE, imageUrl, NOW), {
            ok: false,
            reason: 'invalid'
        });
    }

    assert.equal(
        getSigningLabel('owner-token', 'production'),
        'wishlist:owner-token:v1:production'
    );
    assert.equal(
        getSigningLabel('image-url', 'preview'),
        'wishlist:image-url:v1:preview'
    );
});

test('image URLs stay identical within an hour and expire an hour after it', async () => {
    const signer = signerFor();
    const startOfHour = new Date('2026-10-03T12:00:01.000Z');
    const endOfHour = new Date('2026-10-03T12:59:59.000Z');
    const nextHour = new Date('2026-10-03T13:00:01.000Z');
    const first = await signer.buildImageUrl(IMAGE, startOfHour);

    assert.equal(await signer.buildImageUrl(IMAGE, NOW), first);
    assert.equal(await signer.buildImageUrl(IMAGE, endOfHour), first);
    assert.notEqual(await signer.buildImageUrl(IMAGE, nextHour), first);
    assert.equal(
        getImageUrlExpiry(NOW),
        Date.parse('2026-10-03T14:00:00.000Z') / 1000
    );

    const parsed = parseImageUrl(first);

    assert.equal(parsed.path, '/img/w/1234/2/0123456789abcdef');
    assert.deepEqual(await signer.verifyImage(IMAGE, parsed, endOfHour), {
        ok: true
    });
    assert.deepEqual(
        await signer.verifyImage(
            IMAGE,
            parsed,
            new Date('2026-10-03T14:00:01.000Z')
        ),
        { ok: false, reason: 'expired' }
    );
});

test('image signatures reject a different wish, index, hash or expiry', async () => {
    const signer = signerFor();
    const params = parseImageUrl(await signer.buildImageUrl(IMAGE, NOW));

    for (const [reference, signed] of [
        [{ ...IMAGE, wishId: IMAGE.wishId + 1 }, params],
        [{ ...IMAGE, index: IMAGE.index + 1 }, params],
        [{ ...IMAGE, hash: 'fedcba9876543210' }, params],
        [{ ...IMAGE, hash: 'not-a-hash' }, params],
        [IMAGE, { ...params, expiresAt: params.expiresAt + 3600 }],
        [IMAGE, { ...params, signature: `${params.signature}x` }]
    ] as const) {
        assert.deepEqual(await signer.verifyImage(reference, signed, NOW), {
            ok: false,
            reason: 'invalid'
        });
    }
});
