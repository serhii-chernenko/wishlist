import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const APP_SOURCE = readFileSync(
    new URL('../src/app/styles/app.css', import.meta.url),
    'utf8'
);
const APP_DIRECTORY = new URL('../src/app/', import.meta.url);
const STYLE_ATTRIBUTE = /\bstyle\s*=|setAttribute\(\s*['"]style['"]/;

const readSourceFiles = (directory: URL): string[] => {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const child = new URL(
            entry.isDirectory() ? `${entry.name}/` : entry.name,
            directory
        );

        if (entry.isDirectory()) {
            return readSourceFiles(child);
        }

        return entry.name.endsWith('.tsx') ? [readFileSync(child, 'utf8')] : [];
    });
};

test('the optical alignment tokens are defined once', () => {
    for (const token of [
        '--optical-shift-sans',
        '--optical-shift-display',
        '--field-max-rows',
        '--row-title-line'
    ]) {
        const definitions = APP_SOURCE.match(
            new RegExp(`^\\s*${token}:`, 'gm')
        );

        assert.equal(definitions?.length, 1, `${token} must be defined once`);
    }
});

test('leading and trailing row items share the optical shift', () => {
    const layer = APP_SOURCE.slice(APP_SOURCE.lastIndexOf('@layer components'));

    for (const selector of [
        '.menu-icon',
        '.row-icon',
        '.menu-row-chevron',
        '.row-trailing',
        '.toggle-switch'
    ]) {
        assert.ok(layer.includes(selector), `${selector} missing in the layer`);
    }

    assert.match(layer, /translate: 0 var\(--optical-shift\)/);
});

test('the pairs grid falls back to one column and never wraps labels', () => {
    assert.match(APP_SOURCE, /@container menu-pairs \(max-width: 20rem\)/);
    assert.match(
        APP_SOURCE,
        /\.menu-list-pairs \.menu-row-label \{[^}]*white-space: nowrap/
    );
});

test('textareas cap at the field row limit with native sizing when supported', () => {
    assert.match(APP_SOURCE, /@supports \(field-sizing: content\)/);
    assert.match(
        APP_SOURCE,
        /max-block-size: calc\(var\(--field-max-rows\) \* 1lh/
    );
});

test('toggle switches use a muted grey off track', () => {
    assert.match(
        APP_SOURCE,
        /--toggle-off-track: color-mix\(in srgb, var\(--ink\) \d+%, var\(--tag\)\)/
    );
    assert.match(
        APP_SOURCE,
        /\.toggle-button\[aria-pressed='true'\] \.toggle-switch \{\s*background: var\(--heart\)/
    );
});

test('app markup never sets inline styles', () => {
    for (const source of readSourceFiles(APP_DIRECTORY)) {
        assert.doesNotMatch(source, STYLE_ATTRIBUTE);
    }
});
