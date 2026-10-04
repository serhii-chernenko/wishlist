import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const AAA_CONTRAST = 7;
const COMMITTED_STYLESHEET = readFileSync(
    new URL('../public/styles/share.css', import.meta.url),
    'utf8'
);
const STYLESHEET_SOURCE = readFileSync(
    new URL('../src/web/styles/share.css', import.meta.url),
    'utf8'
);

const GIFT_TAG_SOURCE = readFileSync(
    new URL('../src/web/styles/gift-tag.css', import.meta.url),
    'utf8'
);
const FONTS_SOURCE = readFileSync(
    new URL('../src/web/styles/fonts.css', import.meta.url),
    'utf8'
);

const LIGHT_TOKENS_PATTERN = /^:root \{([^}]*)\}/m;
const DARK_OVERRIDE_PATTERN =
    /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{([^}]*)\}/;
const EXPLICIT_DARK_PATTERN = /^\[data-theme='wishlist-dark'\] \{([^}]*)\}/m;

const parseTokens = (block: string) => {
    return new Map(
        Array.from(block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g), token => {
            return [token[1] ?? '', token[2] ?? ''] as const;
        })
    );
};

const DARK_SUFFIX = '-dark';

const readThemes = () => {
    const tokens = parseTokens(
        LIGHT_TOKENS_PATTERN.exec(STYLESHEET_SOURCE)?.[1] ?? ''
    );
    const light = new Map<string, string>();
    const dark = new Map<string, string>();

    for (const [name, value] of tokens) {
        if (name.endsWith(DARK_SUFFIX)) {
            dark.set(name.slice(0, -DARK_SUFFIX.length), value);
        } else {
            light.set(name, value);
        }
    }

    return new Map([
        ['light', light],
        ['dark', dark]
    ]);
};

const toLinear = (channel: number) => {
    const scaled = channel / 255;

    return scaled <= 0.03928
        ? scaled / 12.92
        : ((scaled + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
    const [red, green, blue] = [1, 3, 5].map(offset => {
        return toLinear(Number.parseInt(hex.slice(offset, offset + 2), 16));
    });

    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
};

const contrastRatio = (first: string, second: string) => {
    const [lighter = 0, darker = 0] = [
        luminance(first),
        luminance(second)
    ].sort((left, right) => {
        return right - left;
    });

    return (lighter + 0.05) / (darker + 0.05);
};

const readFontPackageVersion = (family: string) => {
    const manifest = JSON.parse(
        readFileSync(
            new URL(
                `../node_modules/@fontsource-variable/${family}/package.json`,
                import.meta.url
            ),
            'utf8'
        )
    ) as { version: string };

    return manifest.version;
};

const NON_TEXT_CONTRAST = 3;

const FOCUS_RING_PAIRS = [
    ['ink', 'paper'],
    ['ink', 'tag'],
    ['on-box', 'box']
] as const;

const TEXT_PAIRS = [
    ['text', 'paper'],
    ['text', 'tag'],
    ['heart-ink', 'paper'],
    ['heart-ink', 'tag'],
    ['on-heart', 'heart'],
    ['on-box', 'box'],
    ['on-button', 'button']
] as const;

const EXPECTED_TOKENS = {
    light: {
        paper: '#f1e3fb',
        tag: '#ffffff',
        ink: '#000000',
        text: '#000000',
        heart: '#f57aa6',
        box: '#2aabe2',
        'heart-ink': '#7a1040'
    },
    dark: {
        paper: '#1a1220',
        tag: '#261b2e',
        ink: '#f1e3fb',
        text: '#fbf4ff',
        heart: '#f57aa6',
        box: '#2aabe2'
    }
} as const;

test('the page stylesheet is committed, self contained and CSP friendly', () => {
    assert.ok(COMMITTED_STYLESHEET.length > 5_000);
    assert.ok(COMMITTED_STYLESHEET.length < 60_000);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /data:/);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /@import/);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /url\(\s*['"]?https?:/);
    assert.match(COMMITTED_STYLESHEET, /prefers-color-scheme:dark/);
    assert.match(COMMITTED_STYLESHEET, /--paper:#f1e3fb/);
    assert.match(COMMITTED_STYLESHEET, /--paper-dark:#1a1220/);
    assert.match(
        COMMITTED_STYLESHEET,
        /\[data-theme=wishlist-dark\]\{color-scheme:dark;--paper:var\(--paper-dark\)/
    );
});

test('every font face is self hosted from a committed woff2 file', () => {
    const fontUrls = Array.from(
        COMMITTED_STYLESHEET.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g),
        match => {
            return match[1] ?? '';
        }
    ).filter(url => {
        return !url.startsWith('/icons/');
    });

    assert.equal(fontUrls.length, 7);

    for (const fontUrl of fontUrls) {
        const [, file = '', family = '', version = ''] =
            /^\/fonts\/((\w+)-[\w-]+\.woff2)\?v=([\d.]+)$/.exec(fontUrl) ?? [];

        assert.ok(file, fontUrl);
        assert.equal(version, readFontPackageVersion(family), fontUrl);
        assert.ok(
            existsSync(new URL(`../public/fonts/${file}`, import.meta.url)),
            fontUrl
        );
    }
});

test('both themes exist and every text pair meets WCAG AAA', () => {
    const themes = readThemes();

    for (const [name, expected] of Object.entries(EXPECTED_TOKENS)) {
        for (const [token, value] of Object.entries(expected)) {
            assert.equal(
                themes.get(name)?.get(token),
                value,
                `${name}: ${token}`
            );
        }
    }

    for (const [name, colors] of themes) {
        for (const [foreground, background] of TEXT_PAIRS) {
            const foregroundColor = colors.get(foreground);
            const backgroundColor = colors.get(background);

            assert.ok(foregroundColor, `${name}: ${foreground}`);
            assert.ok(backgroundColor, `${name}: ${background}`);
            assert.ok(
                contrastRatio(foregroundColor, backgroundColor) >= AAA_CONTRAST,
                `${name}: ${foreground} on ${background}`
            );
        }
    }
});

test('the shared partials are imported and own the font faces and tag primitives', () => {
    assert.match(STYLESHEET_SOURCE, /@import '\.\/fonts\.css';/);
    assert.match(STYLESHEET_SOURCE, /@import '\.\/gift-tag\.css';/);
    assert.doesNotMatch(STYLESHEET_SOURCE, /@font-face/);
    assert.equal(FONTS_SOURCE.match(/@font-face/g)?.length, 7);
    assert.doesNotMatch(FONTS_SOURCE, /url\(\s*['"]?https?:/);
    assert.match(GIFT_TAG_SOURCE, /^@layer components \{/);
});

test('the focus ring outline stands out from every surface it sits on', () => {
    assert.match(
        STYLESHEET_SOURCE,
        /:focus-visible \{\s*outline: var\(--focus-outline\);/
    );
    assert.match(GIFT_TAG_SOURCE, /--focus-outline: 3px solid var\(--ink\);/);
    assert.match(
        GIFT_TAG_SOURCE,
        /\.envelope-link:focus-visible \{\s*outline-color: var\(--on-box\);/
    );

    for (const [name, colors] of readThemes()) {
        for (const [ring, surface] of FOCUS_RING_PAIRS) {
            const ringColor = colors.get(ring) ?? '';
            const surfaceColor = colors.get(surface) ?? '';

            assert.ok(
                contrastRatio(ringColor, surfaceColor) >= NON_TEXT_CONTRAST,
                `${name}: ${ring} on ${surface}`
            );
        }
    }
});

test('system dark and the explicit dark theme map every token to its dark value', () => {
    const light = readThemes().get('light') ?? new Map<string, string>();

    for (const pattern of [DARK_OVERRIDE_PATTERN, EXPLICIT_DARK_PATTERN]) {
        const block = pattern.exec(STYLESHEET_SOURCE)?.[1] ?? '';

        assert.match(block, /color-scheme: dark;/);

        for (const name of light.keys()) {
            assert.ok(
                block.includes(`--${name}: var(--${name}-dark);`),
                `${pattern.source}: --${name}`
            );
        }
    }
});
