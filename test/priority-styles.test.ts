import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { SignalHigh, SignalLow, SignalMedium, type IconNode } from 'lucide';

import {
    BADGE_PRIORITIES,
    type BadgePriority
} from '../src/shared/priority-badge';

const AAA_CONTRAST = 7;
const NON_TEXT_CONTRAST = 3;
const MINIMUM_FILL_LUMINANCE = 0.3;

const readSource = (path: string) => {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
};

const PRIORITY_SOURCE = readSource('../src/web/styles/priority.css');
const SHARE_SOURCE = readSource('../src/web/styles/share.css');
const COMMITTED_SHARE = readSource('../public/styles/share.css');
const COMMITTED_APP = readSource('../public/app/app.css');

const readTokens = (block: string) => {
    return new Map(
        Array.from(block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g), token => {
            return [token[1] ?? '', token[2] ?? ''] as const;
        })
    );
};

const PRIORITY_TOKENS = readTokens(PRIORITY_SOURCE);
const SHARE_TOKENS = readTokens(
    /^:root \{([^}]*)\}/m.exec(SHARE_SOURCE)?.[1] ?? ''
);

const getToken = (tokens: Map<string, string>, name: string) => {
    const value = tokens.get(name);

    assert.ok(value, name);

    return value;
};

const THEMES = {
    light: { ink: 'ink', card: 'tag', heart: 'heart' },
    dark: { ink: 'ink-dark', card: 'tag-dark', heart: 'heart-dark' }
} as const;

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

const ICON_NODES: Record<BadgePriority, IconNode> = {
    low: SignalLow,
    medium: SignalMedium,
    high: SignalHigh
};

test('badge text passes AAA on every level fill', () => {
    const text = getToken(PRIORITY_TOKENS, 'on-prio');

    for (const level of BADGE_PRIORITIES) {
        const fill = getToken(PRIORITY_TOKENS, `prio-${level}`);

        assert.ok(
            contrastRatio(text, fill) >= AAA_CONTRAST,
            `${level}: ${contrastRatio(text, fill)}`
        );
    }
});

test('every level fill is light enough for black text in both themes', () => {
    for (const level of BADGE_PRIORITIES) {
        const fill = getToken(PRIORITY_TOKENS, `prio-${level}`);

        assert.ok(luminance(fill) >= MINIMUM_FILL_LUMINANCE, level);
    }
});

test('the badge outline and fill both stand out from the card in light and dark', () => {
    for (const [theme, names] of Object.entries(THEMES)) {
        const card = getToken(SHARE_TOKENS, names.card);
        const ink = getToken(SHARE_TOKENS, names.ink);

        assert.ok(
            contrastRatio(ink, card) >= NON_TEXT_CONTRAST,
            `${theme} outline`
        );

        for (const level of BADGE_PRIORITIES) {
            const fill = getToken(PRIORITY_TOKENS, `prio-${level}`);

            assert.ok(
                contrastRatio(fill, card) >= NON_TEXT_CONTRAST ||
                    contrastRatio(ink, card) >= NON_TEXT_CONTRAST,
                `${theme} ${level}`
            );
        }
    }
});

test('the high badge uses the same pink as the heart sticker in both themes', () => {
    const high = getToken(PRIORITY_TOKENS, 'prio-high');

    for (const names of Object.values(THEMES)) {
        assert.equal(getToken(SHARE_TOKENS, names.heart), high);
    }
});

test('the three levels have distinct fills', () => {
    const fills = BADGE_PRIORITIES.map(level => {
        return getToken(PRIORITY_TOKENS, `prio-${level}`);
    });

    assert.equal(new Set(fills).size, BADGE_PRIORITIES.length);
});

test('each signal icon file draws the matching lucide icon', () => {
    for (const level of BADGE_PRIORITIES) {
        const path = `../public/icons/signal-${level}.svg`;

        assert.ok(existsSync(new URL(path, import.meta.url)), level);
        assert.match(
            PRIORITY_SOURCE,
            new RegExp(`/icons/signal-${level}\\.svg`)
        );

        const svg = readSource(path);
        const drawn = Array.from(
            svg.matchAll(/<path d="([^"]+)"\/>/g),
            match => {
                return match[1];
            }
        );
        const expected = ICON_NODES[level].map(([, attrs]) => {
            return attrs.d;
        });

        assert.deepEqual(drawn, expected, level);
        assert.doesNotMatch(svg, /<script|href=/);
    }
});

test('both stylesheets ship the badge and the sticker rules', () => {
    for (const stylesheet of [COMMITTED_SHARE, COMMITTED_APP]) {
        assert.match(stylesheet, /\.priority-badge\[data-level=high\]/);
        assert.match(stylesheet, /--prio-high:#f57aa6/);
    }

    assert.match(COMMITTED_SHARE, /\.sticker-fill/);
});

test('the badge never relies on inline styles or data URLs', () => {
    assert.doesNotMatch(PRIORITY_SOURCE, /data:|style=/);
});
