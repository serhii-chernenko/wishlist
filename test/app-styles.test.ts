import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

const AAA_CONTRAST = 7;
const NON_TEXT_CONTRAST = 3;
const APP_SOURCE = readFileSync(
    new URL('../src/app/styles/app.css', import.meta.url),
    'utf8'
);
const SHARE_SOURCE = readFileSync(
    new URL('../src/web/styles/share.css', import.meta.url),
    'utf8'
);
const GIFT_TAG_SOURCE = readFileSync(
    new URL('../src/web/styles/gift-tag.css', import.meta.url),
    'utf8'
);
const COMMITTED_STYLESHEET = readFileSync(
    new URL('../public/app/app.css', import.meta.url),
    'utf8'
);

const THEME_BLOCK_PATTERN = /@plugin 'daisyui\/theme' \{([^}]*)\}/g;
const SHARE_LIGHT_PATTERN = /^:root \{([^}]*)\}/m;
const BRIDGE_PATTERN = /^\[data-theme\] \{([^}]*)\}/m;

const SHARE_TOKEN_BY_DAISY_COLOR = {
    'base-100': 'tag',
    'base-200': 'paper',
    'base-content': 'text',
    primary: 'heart',
    'primary-content': 'on-heart',
    secondary: 'box',
    'secondary-content': 'on-box',
    accent: 'heart-ink',
    neutral: 'ink',
    'neutral-content': 'on-button'
} as const;

const BRIDGE_EXPECTED = {
    paper: 'color-base-200',
    tag: 'color-base-100',
    ink: 'color-neutral',
    text: 'color-base-content',
    heart: 'color-primary',
    'on-heart': 'color-primary-content',
    box: 'color-secondary',
    'on-box': 'color-secondary-content',
    'heart-ink': 'color-accent',
    button: 'color-neutral',
    'on-button': 'color-neutral-content',
    danger: 'color-error',
    'on-danger': 'color-error-content'
} as const;

const COLOR_ROLES = [
    'primary',
    'secondary',
    'accent',
    'neutral',
    'info',
    'success',
    'warning',
    'error'
] as const;

const SEMANTIC_TEXT_ROLES = ['info', 'success', 'warning', 'error'] as const;

const parseHexVariables = (block: string, prefix: string) => {
    return new Map(
        Array.from(
            block.matchAll(
                new RegExp(`--${prefix}([\\w-]+):\\s*(#[0-9a-f]{6});`, 'g')
            ),
            match => {
                return [match[1] ?? '', match[2] ?? ''] as const;
            }
        )
    );
};

const readDaisyThemes = () => {
    return new Map(
        Array.from(APP_SOURCE.matchAll(THEME_BLOCK_PATTERN), match => {
            const block = match[1] ?? '';
            const name = /name:\s*'([\w-]+)'/.exec(block)?.[1] ?? '';

            return [name, parseHexVariables(block, 'color-')] as const;
        })
    );
};

const DARK_SUFFIX = '-dark';

const splitShareTokens = (block: string) => {
    const all = parseHexVariables(block, '');
    const light = new Map<string, string>();
    const dark = new Map<string, string>();

    for (const [name, value] of all) {
        if (name.endsWith(DARK_SUFFIX)) {
            dark.set(name.slice(0, -DARK_SUFFIX.length), value);
        } else {
            light.set(name, value);
        }
    }

    return { light, dark };
};

const readShareThemes = () => {
    const { light, dark } = splitShareTokens(
        SHARE_LIGHT_PATTERN.exec(SHARE_SOURCE)?.[1] ?? ''
    );

    return new Map([
        ['wishlist', light],
        ['wishlist-dark', dark]
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

const requireColor = (
    colors: ReadonlyMap<string, string>,
    name: string,
    theme: string
) => {
    const color = colors.get(name);

    assert.ok(color, `${theme}: missing --color-${name}`);

    return color;
};

test('both daisyUI themes are declared, the light one is the default', () => {
    const themes = readDaisyThemes();

    assert.deepEqual(Array.from(themes.keys()), ['wishlist', 'wishlist-dark']);
    assert.match(
        APP_SOURCE,
        /name: 'wishlist';\s*default: true;\s*color-scheme: light;/
    );
    assert.match(APP_SOURCE, /name: 'wishlist-dark';\s*color-scheme: dark;/);
    assert.match(APP_SOURCE, /themes: false;/);
});

test('every app theme color that has a share token equals it', () => {
    const daisyThemes = readDaisyThemes();
    const shareThemes = readShareThemes();

    for (const [theme, colors] of daisyThemes) {
        const tokens = shareThemes.get(theme);

        assert.ok(tokens, theme);

        for (const [daisyColor, shareToken] of Object.entries(
            SHARE_TOKEN_BY_DAISY_COLOR
        )) {
            assert.equal(
                requireColor(colors, daisyColor, theme),
                tokens.get(shareToken),
                `${theme}: ${daisyColor} must equal share token ${shareToken}`
            );
        }
    }
});

test('the token bridge maps every share token onto a daisyUI color', () => {
    const bridge = BRIDGE_PATTERN.exec(APP_SOURCE)?.[1] ?? '';
    const mappings = new Map(
        Array.from(bridge.matchAll(/--([\w-]+):\s*var\(--([\w-]+)\);/g), m => {
            return [m[1] ?? '', m[2] ?? ''] as const;
        })
    );

    assert.deepEqual(Object.fromEntries(mappings), BRIDGE_EXPECTED);
});

test('every color pair and body text of both themes meets WCAG AAA', () => {
    for (const [theme, colors] of readDaisyThemes()) {
        for (const role of COLOR_ROLES) {
            const fill = requireColor(colors, role, theme);
            const content = requireColor(colors, `${role}-content`, theme);

            assert.ok(
                contrastRatio(fill, content) >= AAA_CONTRAST,
                `${theme}: ${role}-content on ${role}`
            );
        }

        const baseContent = requireColor(colors, 'base-content', theme);

        for (const base of ['base-100', 'base-200', 'base-300']) {
            assert.ok(
                contrastRatio(baseContent, requireColor(colors, base, theme)) >=
                    AAA_CONTRAST,
                `${theme}: base-content on ${base}`
            );
        }

        for (const role of SEMANTIC_TEXT_ROLES) {
            for (const base of ['base-100', 'base-200']) {
                assert.ok(
                    contrastRatio(
                        requireColor(colors, role, theme),
                        requireColor(colors, base, theme)
                    ) >= AAA_CONTRAST,
                    `${theme}: ${role} text on ${base}`
                );
            }
        }
    }
});

test('the focus ring and outlines stand out from every surface', () => {
    for (const [theme, colors] of readDaisyThemes()) {
        const ink = requireColor(colors, 'neutral', theme);

        for (const surface of ['base-100', 'base-200']) {
            assert.ok(
                contrastRatio(ink, requireColor(colors, surface, theme)) >=
                    NON_TEXT_CONTRAST,
                `${theme}: ink on ${surface}`
            );
        }
    }

    assert.match(
        APP_SOURCE,
        /:focus-visible \{\s*outline: var\(--focus-outline\);/
    );
    assert.match(GIFT_TAG_SOURCE, /--focus-outline: 3px solid var\(--ink\);/);
});

test('safe areas, reduced motion and the compact grid are in the source', () => {
    assert.match(APP_SOURCE, /--tg-safe-area-inset-top/);
    assert.match(APP_SOURCE, /--tg-content-safe-area-inset-bottom/);
    assert.match(APP_SOURCE, /env\(safe-area-inset-left/);
    assert.match(APP_SOURCE, /prefers-reduced-motion: reduce/);
    assert.match(
        APP_SOURCE,
        /\.wish-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\);/
    );
    assert.match(
        APP_SOURCE,
        /\.wish-grid-frame \{\s*container: wish-list \/ inline-size;/
    );
    assert.match(
        APP_SOURCE,
        /@container wish-list \(min-width: 20rem\) \{\s*\.wish-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
    );
    assert.doesNotMatch(APP_SOURCE, /@media \(min-width: 26rem\)/);
});

test('the source and the committed stylesheet load nothing from the network', () => {
    assert.doesNotMatch(APP_SOURCE, /url\(\s*['"]?https?:/);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /url\(\s*['"]?https?:/);
    assert.doesNotMatch(COMMITTED_STYLESHEET, /@import/);
});

const MAX_RAW_STYLESHEET_BYTES = 120_000;
const MAX_GZIP_STYLESHEET_BYTES = 20_000;

test('the committed stylesheet carries both themes and self hosted fonts', () => {
    assert.ok(existsSync(new URL('../public/app/app.css', import.meta.url)));
    assert.ok(COMMITTED_STYLESHEET.length < MAX_RAW_STYLESHEET_BYTES);
    assert.ok(
        gzipSync(COMMITTED_STYLESHEET).byteLength < MAX_GZIP_STYLESHEET_BYTES
    );
    assert.match(COMMITTED_STYLESHEET, /\[data-theme=wishlist\]/);
    assert.match(COMMITTED_STYLESHEET, /\[data-theme=wishlist-dark\]/);
    assert.match(COMMITTED_STYLESHEET, /--paper:var\(--color-base-200\)/);

    const fontUrls = Array.from(
        COMMITTED_STYLESHEET.matchAll(
            /url\(\s*['"]?(\/fonts\/[^'")]+)['"]?\s*\)/g
        ),
        match => {
            return match[1] ?? '';
        }
    );

    assert.equal(fontUrls.length, 7);

    for (const fontUrl of fontUrls) {
        const file = /^\/fonts\/([\w-]+\.woff2)\?v=[\d.]+$/.exec(fontUrl)?.[1];

        assert.ok(file, fontUrl);
        assert.ok(
            existsSync(new URL(`../public/fonts/${file}`, import.meta.url)),
            fontUrl
        );
    }
});

test('the gifted band sits on the page tint in both themes, so it cuts across the card', () => {
    const giftedSource = readFileSync(
        new URL('../src/web/styles/gifted.css', import.meta.url),
        'utf8'
    );

    assert.match(giftedSource, /background: var\(--gifted-band\);/);
    assert.match(
        GIFT_TAG_SOURCE,
        /:root,\s*\[data-theme\] \{[^}]*--gifted-band: var\(--paper\);/
    );
    assert.equal(GIFT_TAG_SOURCE.split('--gifted-band').length, 2);
});

const toOklabLightness = (hex: string) => {
    const [red = 0, green = 0, blue = 0] = [1, 3, 5].map(offset => {
        return toLinear(Number.parseInt(hex.slice(offset, offset + 2), 16));
    });
    const cone = (a: number, b: number, c: number) => {
        return Math.cbrt(a * red + b * green + c * blue);
    };

    return (
        0.2104542553 * cone(0.4122214708, 0.5363325363, 0.0514459929) +
        0.793617785 * cone(0.2119034982, 0.6806995451, 0.1073969566) -
        0.0040720468 * cone(0.0883024619, 0.2817188376, 0.6299787005)
    );
};

test('in dark the card is clearly lighter than the page, mirroring light mode', () => {
    const dark = readShareThemes().get('wishlist-dark');
    const pageLightness = toOklabLightness(dark?.get('paper') ?? '#000000');
    const cardLightness = toOklabLightness(dark?.get('tag') ?? '#000000');

    assert.ok(
        pageLightness >= 0.16 && pageLightness <= 0.18,
        String(pageLightness)
    );
    assert.ok(
        cardLightness - pageLightness >= 0.08,
        String(cardLightness - pageLightness)
    );
});

const STICKY_HEADER_SOURCE = readFileSync(
    new URL('../src/app/styles/sticky-header.css', import.meta.url),
    'utf8'
);

test('toasts sit 1rem above the safe area and clear the in-page bar only when it is mounted', () => {
    assert.match(
        APP_SOURCE,
        /\.toast-host \{[^}]*padding: 0 var\(--gutter-right\) calc\(var\(--safe-bottom\) \+ 1rem\)/
    );
    assert.match(
        APP_SOURCE,
        /:root:has\(\.bottom-bar\) \.toast-host \{\s*padding-bottom: calc\(var\(--safe-bottom\) \+ 5rem\);/
    );
    assert.ok(
        APP_SOURCE.indexOf(':root:has(.bottom-bar) .toast-host') >
            APP_SOURCE.indexOf('.toast-host {')
    );
});

test('the sticky list header respects the safe area, compacts its chips and honours reduced motion', () => {
    assert.match(APP_SOURCE, /@import '\.\/sticky-header\.css';/);
    assert.match(
        STICKY_HEADER_SOURCE,
        /\.screen-header-sticky \{[^}]*position: sticky;[^}]*top: var\(--safe-top\);/
    );
    assert.match(
        STICKY_HEADER_SOURCE,
        /\.sticky-sentinel \{[^}]*top: calc\(var\(--safe-top\) \* -1\);/
    );
    assert.match(
        STICKY_HEADER_SOURCE,
        /\[data-stuck\] \.screen-header-bar \{[^}]*border-bottom-color: var\(--ink\);/
    );
    assert.match(
        STICKY_HEADER_SOURCE,
        /\.screen-header-sticky \{[^}]*pointer-events: none;/
    );
    assert.match(
        STICKY_HEADER_SOURCE,
        /\.screen-header-bar \{[^}]*pointer-events: auto;/
    );
    assert.match(
        STICKY_HEADER_SOURCE,
        /\[data-stuck\] \.filter-row \.chip \{[^}]*min-height: 2rem;/
    );
    assert.match(STICKY_HEADER_SOURCE, /overscroll-behavior-x: contain;/);
    assert.match(
        STICKY_HEADER_SOURCE,
        /@media \(prefers-reduced-motion: no-preference\) \{[^@]*var\(--motion-collapse\)/
    );
    assert.match(APP_SOURCE, /--motion-collapse: 150ms ease-out;/);
});

test('the link button sits at the bottom of the card and the action row follows it without a second auto margin', () => {
    assert.match(
        GIFT_TAG_SOURCE,
        /\.wish-link,\s*:not\(\.wish-link\) \+ \.wish-details \{\s*margin-top: auto;/
    );
    assert.match(APP_SOURCE, /\.wish-actions \{[^}]*margin-top: auto;/);
    assert.match(
        APP_SOURCE,
        /\.wish-link \+ \.wish-actions \{\s*margin-top: 0;\s*\}/
    );
});

test('the price chip hangs on a thread from the card edge, drawn by a themed mask that never takes taps', () => {
    const thread =
        /\.price::after \{([^}]*)\}/.exec(GIFT_TAG_SOURCE)?.[1] ?? '';

    assert.match(thread, /background: var\(--ink\)/);
    assert.match(thread, /mask: url\('\/icons\/price-string\.svg'\)/);
    assert.match(thread, /pointer-events: none/);
    assert.match(
        thread,
        /width: calc\(var\(--price-inset\) \+ var\(--card-border\)\)/
    );
    assert.doesNotMatch(thread, /data:/);

    const icon = readFileSync(
        new URL('../public/icons/price-string.svg', import.meta.url),
        'utf8'
    );

    assert.match(icon, /stroke-width="2\.5"/);
    assert.match(icon, /stroke-linecap="round"/);
});
