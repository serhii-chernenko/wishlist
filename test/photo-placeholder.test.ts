import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { LOGO_PATHS } from '../src/shared/logo';
import {
    buildPhotoPlaceholderSvg,
    PLACEHOLDER_DARK,
    PLACEHOLDER_LIGHT,
    PLACEHOLDER_LOGO_FRAME
} from '../src/shared/photo-placeholder';

const readSource = (path: string) => {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
};

const GIFT_TAG_SOURCE = readSource('../src/web/styles/gift-tag.css');
const APP_SOURCE = readSource('../src/app/styles/app.css');
const MAX_PLACEHOLDER_BYTES = 8 * 1024;

const readTokens = (block: string) => {
    return Object.fromEntries(
        Array.from(
            block.matchAll(
                /--photo-placeholder-(bg|fill|line): (#[0-9a-f]{6})/g
            )
        ).map(([, name, value]) => [name, value])
    );
};

test('the standalone placeholder is a small well-formed svg built from the logo paths', () => {
    const svg = buildPhotoPlaceholderSvg();
    const tags = Array.from(svg.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g));
    const open: string[] = [];

    for (const [, closing, name, selfClosing] of tags) {
        if (closing) {
            assert.equal(open.pop(), name);
        } else if (!selfClosing) {
            open.push(name ?? '');
        }
    }

    assert.deepEqual(open, []);
    assert.ok(svg.length < MAX_PLACEHOLDER_BYTES);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
    for (const path of LOGO_PATHS) {
        assert.ok(svg.includes(`d="${path}"`));
    }
    assert.doesNotMatch(svg, /<script|href|url\(|telegram|#29abe2|#ff7bac/i);
});

test('the placeholder follows light by default and dark through a media query', () => {
    const svg = buildPhotoPlaceholderSvg();

    assert.ok(svg.includes(`fill="${PLACEHOLDER_LIGHT.background}"`));
    assert.ok(svg.includes(`fill="${PLACEHOLDER_LIGHT.fill}"`));
    assert.ok(svg.includes('@media (prefers-color-scheme:dark)'));
    assert.ok(svg.includes(`.b{fill:${PLACEHOLDER_DARK.background}}`));
    assert.ok(svg.includes(`.f{fill:${PLACEHOLDER_DARK.fill}}`));
});

test('the logo silhouette is centered and covers 40% of the shorter side', () => {
    assert.equal(PLACEHOLDER_LOGO_FRAME.size, 120);
    assert.equal(PLACEHOLDER_LOGO_FRAME.x, 140);
    assert.equal(PLACEHOLDER_LOGO_FRAME.y, 90);
});

test('the stylesheet tokens match the palettes used by the image', () => {
    const lightBlock = /:root \{([^}]*)\}/.exec(GIFT_TAG_SOURCE)?.[1] ?? '';
    const darkBlock =
        /\[data-theme='wishlist-dark'\] \{([^}]*)\}/.exec(
            GIFT_TAG_SOURCE
        )?.[1] ?? '';
    const mediaBlock =
        /prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{([^}]*)\}/.exec(
            GIFT_TAG_SOURCE
        )?.[1] ?? '';
    const expectedLight = {
        bg: PLACEHOLDER_LIGHT.background,
        fill: PLACEHOLDER_LIGHT.fill,
        line: PLACEHOLDER_LIGHT.line
    };
    const expectedDark = {
        bg: PLACEHOLDER_DARK.background,
        fill: PLACEHOLDER_DARK.fill,
        line: PLACEHOLDER_DARK.line
    };

    assert.deepEqual(readTokens(lightBlock), expectedLight);
    assert.deepEqual(readTokens(darkBlock), expectedDark);
    assert.deepEqual(readTokens(mediaBlock), expectedDark);
});

test('broken photos never show their alt text on the share cards or in the app tiles', () => {
    assert.match(
        GIFT_TAG_SOURCE,
        /\.wish-photo img \{[^}]*font-size: 0;[^}]*color: transparent;[^}]*object-fit: cover;/
    );
    assert.match(
        APP_SOURCE,
        /\.photo-tile img \{[^}]*font-size: 0;[^}]*color: transparent;[^}]*object-fit: cover;/
    );
});

test('the app bundle ships the inline placeholder with the logo paths and the swap on error', () => {
    const bundle = readSource('../public/app/app.js');

    assert.ok(bundle.includes('photo-placeholder-fill'));
    assert.ok(bundle.includes('photo-placeholder-stroke'));
    for (const path of LOGO_PATHS) {
        assert.ok(bundle.includes(path));
    }
    assert.ok(bundle.includes('onError'));
});
