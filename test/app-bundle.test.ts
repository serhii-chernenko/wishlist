import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
    APP_BUILD_OPTIONS,
    buildAppBundle,
    isWithinBudget,
    MAX_GZIP_BYTES,
    MAX_MINIFIED_BYTES,
    measureBundle
} from '../scripts/web/build-app';

const COMMITTED_BUNDLE = readFileSync(
    new URL('../public/app/app.js', import.meta.url)
);
const FORBIDDEN_FRAGMENTS = [
    /\beval\s*\(/,
    /new Function\s*\(/,
    /api\.telegram\.org/,
    /BOT_TOKEN/
];

const sha256 = (bytes: Uint8Array) => {
    return createHash('sha256').update(bytes).digest('hex');
};

test('the committed bundle fits the size budget', () => {
    const size = measureBundle(COMMITTED_BUNDLE);

    assert.ok(size.minifiedBytes > 0);
    assert.ok(
        size.minifiedBytes <= MAX_MINIFIED_BYTES,
        String(size.minifiedBytes)
    );
    assert.ok(size.gzipBytes <= MAX_GZIP_BYTES, String(size.gzipBytes));
    assert.equal(MAX_MINIFIED_BYTES, 200 * 1024);
    assert.equal(MAX_GZIP_BYTES, 70 * 1024);
});

test('the budget check rejects bundles over either limit', () => {
    assert.equal(isWithinBudget({ minifiedBytes: 1, gzipBytes: 1 }), true);
    assert.equal(
        isWithinBudget({ minifiedBytes: MAX_MINIFIED_BYTES + 1, gzipBytes: 1 }),
        false
    );
    assert.equal(
        isWithinBudget({ minifiedBytes: 1, gzipBytes: MAX_GZIP_BYTES + 1 }),
        false
    );
});

test('the committed bundle has no eval, Telegram API host or bot token', () => {
    const source = COMMITTED_BUNDLE.toString('utf8');

    for (const fragment of FORBIDDEN_FRAGMENTS) {
        assert.doesNotMatch(source, fragment);
    }
});

test('the build options follow the documented pipeline', () => {
    assert.equal(APP_BUILD_OPTIONS.format, 'esm');
    assert.equal(APP_BUILD_OPTIONS.bundle, true);
    assert.equal(APP_BUILD_OPTIONS.minify, true);
    assert.equal(APP_BUILD_OPTIONS.jsxImportSource, 'hono/jsx/dom');
    assert.equal(APP_BUILD_OPTIONS.tsconfig, 'tsconfig.app.json');
    assert.equal(APP_BUILD_OPTIONS.outfile, 'public/app/app.js');
    assert.deepEqual(APP_BUILD_OPTIONS.target, [
        'es2020',
        'safari15',
        'chrome100'
    ]);
    assert.equal('splitting' in APP_BUILD_OPTIONS, false);
});

test('two builds are byte identical and pass the same checks', async () => {
    const first = await buildAppBundle({ logLevel: 'silent' });
    const second = await buildAppBundle({ logLevel: 'silent' });

    assert.equal(sha256(first), sha256(second));
    assert.equal(isWithinBudget(measureBundle(first)), true);

    for (const fragment of FORBIDDEN_FRAGMENTS) {
        assert.doesNotMatch(Buffer.from(first).toString('utf8'), fragment);
    }
});
