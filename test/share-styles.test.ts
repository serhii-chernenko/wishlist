import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const THEME_BLOCK_PATTERN =
    /@plugin 'daisyui\/theme' \{\s*name: '([\w-]+)';([^}]*)\}/g;

const readThemes = () => {
    return new Map(
        Array.from(STYLESHEET_SOURCE.matchAll(THEME_BLOCK_PATTERN), match => {
            const colors = new Map(
                Array.from(
                    (match[2] ?? '').matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g),
                    color => [color[1] ?? '', color[2] ?? '']
                )
            );

            return [match[1] ?? '', colors] as const;
        })
    );
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

const TEXT_PAIRS = [
    ['color-base-content', 'color-base-100'],
    ['color-base-content', 'color-base-200'],
    ['color-base-content', 'color-base-300'],
    ['color-primary-content', 'color-primary'],
    ['color-secondary-content', 'color-secondary'],
    ['color-accent-content', 'color-accent'],
    ['color-neutral-content', 'color-neutral'],
    ['color-info-content', 'color-info'],
    ['color-success-content', 'color-success'],
    ['color-warning-content', 'color-warning'],
    ['color-error-content', 'color-error'],
    ['wishlist-link', 'color-base-100'],
    ['wishlist-link', 'color-base-200']
] as const;

test('the page stylesheet is committed, self contained and CSP friendly', () => {
    assert.ok(COMMITTED_STYLESHEET.length > 5_000);
    assert.ok(COMMITTED_STYLESHEET.length < 60_000);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /data:/);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /@import|@font-face/);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /url\(\s*['"]?https?:/);
    assert.match(COMMITTED_STYLESHEET, /prefers-color-scheme:dark/);
    assert.match(COMMITTED_STYLESHEET, /--color-base-100:#fcf7ff/);
    assert.match(COMMITTED_STYLESHEET, /--color-base-100:#261b30/);
});

test('both themes exist and every text pair meets WCAG AAA', () => {
    const themes = readThemes();

    assert.deepEqual(Array.from(themes.keys()), ['wishlist', 'wishlist-dark']);

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
