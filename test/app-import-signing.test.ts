import assert from 'node:assert/strict';
import test from 'node:test';

import { createImportSigner } from '../src/api/auth/import-signing';
import { createSigner } from '../src/api/auth/signing';
import { createNodeApiCrypto, TEST_BOT_TOKEN } from './fixtures/app-auth';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const URL_HASH = 'c'.repeat(32);
const USER_ID = 77;
const SECONDS_PER_HOUR = 3600;

const buildSigner = (environment = 'production', botToken = TEST_BOT_TOKEN) => {
    return createImportSigner({
        botToken,
        environment,
        crypto: createNodeApiCrypto()
    });
};

const readImageParams = (url: string) => {
    const query = new URL(url, 'https://app.test').searchParams;

    return {
        expiresAt: Number(query.get('e')),
        signature: query.get('s') ?? ''
    };
};

test('an import token round-trips its claims and expires after two hours', async () => {
    const signer = buildSigner();
    const token = await signer.mintImportToken({
        userId: USER_ID,
        urlHash: URL_HASH,
        now: NOW
    });
    const fresh = await signer.verifyImportToken(token, NOW);
    const later = new Date(NOW.getTime() + 2 * SECONDS_PER_HOUR * 1000);

    assert.deepEqual(fresh, {
        ok: true,
        claims: {
            userId: USER_ID,
            urlHash: URL_HASH,
            expiresAt: Math.floor(NOW.getTime() / 1000) + 2 * SECONDS_PER_HOUR
        }
    });
    assert.deepEqual(await signer.verifyImportToken(token, later), {
        ok: false,
        reason: 'expired'
    });
});

test('an import token does not verify under another environment or bot token', async () => {
    const token = await buildSigner().mintImportToken({
        userId: USER_ID,
        urlHash: URL_HASH,
        now: NOW
    });

    assert.deepEqual(
        await buildSigner('preview').verifyImportToken(token, NOW),
        {
            ok: false,
            reason: 'invalid'
        }
    );
    assert.deepEqual(
        await buildSigner('production', '999:OTHER').verifyImportToken(
            token,
            NOW
        ),
        { ok: false, reason: 'invalid' }
    );
});

test('an import token rejects edited user, hash and expiry parts', async () => {
    const signer = buildSigner();
    const token = await signer.mintImportToken({
        userId: USER_ID,
        urlHash: URL_HASH,
        now: NOW
    });
    const [userPart, hashPart, expiryPart, signature] = token.split('.');
    const edits = [
        ['2s', hashPart, expiryPart, signature],
        [userPart, 'd'.repeat(32), expiryPart, signature],
        [userPart, hashPart, 'zzzzzz', signature],
        [userPart, hashPart, expiryPart]
    ];

    for (const parts of edits) {
        assert.deepEqual(await signer.verifyImportToken(parts.join('.'), NOW), {
            ok: false,
            reason: 'invalid'
        });
    }
});

test('an import image URL verifies for its hash and index only', async () => {
    const signer = buildSigner();
    const url = await signer.buildImportImageUrl(
        { urlHash: URL_HASH, index: 3 },
        NOW
    );
    const params = readImageParams(url);

    assert.match(url, new RegExp(`^/img/i/${URL_HASH}/3\\?e=\\d+&s=`));
    assert.deepEqual(
        await signer.verifyImportImage(
            { urlHash: URL_HASH, index: 3 },
            params,
            NOW
        ),
        { ok: true }
    );
    assert.deepEqual(
        await signer.verifyImportImage(
            { urlHash: URL_HASH, index: 4 },
            params,
            NOW
        ),
        { ok: false, reason: 'invalid' }
    );
    assert.deepEqual(
        await signer.verifyImportImage(
            { urlHash: 'd'.repeat(32), index: 3 },
            params,
            NOW
        ),
        { ok: false, reason: 'invalid' }
    );
    assert.deepEqual(
        await signer.verifyImportImage(
            { urlHash: URL_HASH, index: 3 },
            params,
            new Date(NOW.getTime() + 3 * SECONDS_PER_HOUR * 1000)
        ),
        { ok: false, reason: 'expired' }
    );
});

test('an import image signature is not interchangeable with a wish image signature', async () => {
    const importSigner = buildSigner();
    const wishSigner = createSigner({
        botToken: TEST_BOT_TOKEN,
        environment: 'production',
        crypto: createNodeApiCrypto()
    });
    const wishUrl = await wishSigner.buildImageUrl(
        { wishId: 1, index: 0, hash: 'e'.repeat(16) },
        NOW
    );

    assert.deepEqual(
        await importSigner.verifyImportImage(
            { urlHash: URL_HASH, index: 0 },
            readImageParams(wishUrl),
            NOW
        ),
        { ok: false, reason: 'invalid' }
    );
});
