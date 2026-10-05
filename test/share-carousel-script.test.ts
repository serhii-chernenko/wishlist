import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

const SCRIPT_URL = new URL('../public/share/carousel.js', import.meta.url);
const SCRIPT = readFileSync(SCRIPT_URL, 'utf8');
const SHARE_CSS = readFileSync(
    new URL('../public/styles/share.css', import.meta.url),
    'utf8'
);
const HEADERS = readFileSync(
    new URL('../public/_headers', import.meta.url),
    'utf8'
);
const MAX_GZIP_SCRIPT_BYTES = 1024;

test('the share carousel script stays tiny and dependency free', () => {
    assert.ok(statSync(SCRIPT_URL).size > 0);
    assert.ok(gzipSync(SCRIPT).byteLength < MAX_GZIP_SCRIPT_BYTES);
    assert.doesNotMatch(
        SCRIPT,
        /\b(?:import|require|eval|fetch|XMLHttpRequest)\b/
    );
    assert.doesNotMatch(SCRIPT, /innerHTML|document\.write|new Function/);
    assert.doesNotMatch(SCRIPT, /^\s*(?:\/\/|\/\*)/m);
});

test('the share carousel script only enhances the markup the server renders', () => {
    for (const hook of [
        "'scroll'",
        "'beforetoggle'",
        "'toggle'",
        "'keydown'",
        'photo-dot-active',
        '.wish-stage:popover-open'
    ]) {
        assert.ok(SCRIPT.includes(hook), hook);
    }
});

test('the share stylesheet draws dots and the popover viewer and drops the count chip', () => {
    assert.match(SHARE_CSS, /\.photo-dots/);
    assert.match(SHARE_CSS, /\.wish-stage:popover-open/);
    assert.match(SHARE_CSS, /\.photo-viewer-close/);
    assert.doesNotMatch(SHARE_CSS, /data-count/);
    assert.doesNotMatch(SHARE_CSS, /\.wish-stage[^{]*\{[^}]*animation/);
});

test('the share script is cached like the other versioned assets', () => {
    assert.match(
        HEADERS,
        /\/share\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/
    );
});
