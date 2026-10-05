import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const STYLE_FILES = [
    'src/app/styles/app.css',
    'src/app/styles/daisy-cards.css',
    'src/web/styles/gift-tag.css',
    'src/web/styles/share.css'
] as const;

const SOURCES = new Map(
    STYLE_FILES.map(file => {
        return [
            file,
            readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
        ] as const;
    })
);

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|color-mix\(/i;
const BLOCK_PATTERN = /([^{}]*)\{([^{}]*)\}/g;
const DECLARATION_PATTERN = /([\w-]+)\s*:[^;]*;/g;
const VARIABLE_REFERENCE = /var\(\s*--([\w-]+)/g;
const VARIABLE_DEFINITION = /(?:^|[\s;{])--([\w-]+)\s*:/g;
const COLOR_MIX_EXPRESSION = /color-mix\((?:[^()]|\([^()]*\))*\)/g;
const EXTERNAL_VARIABLE = /^(?:font-|tg-)/;
const EXTERNALLY_PROVIDED = new Set(['btn-fg', 'btn-bg', 'input-color']);

const TOKEN_BLOCK_SELECTORS = new Set([
    ':root',
    '[data-theme]',
    ':root,[data-theme]',
    ':root:not([data-theme])',
    "[data-theme='wishlist-dark']",
    "@plugin 'daisyui/theme'"
]);
const THEME_PLUGIN_SELECTOR = "@plugin 'daisyui/theme'";

interface RuleBlock {
    selector: string;
    body: string;
}

const readBlocks = (source: string): RuleBlock[] => {
    return Array.from(source.matchAll(BLOCK_PATTERN), match => {
        const header = match[1] ?? '';

        return {
            selector: header
                .slice(header.lastIndexOf(';') + 1)
                .replace(/\s+/g, ' ')
                .replace(/\s*,\s*/g, ',')
                .trim(),
            body: match[2] ?? ''
        };
    });
};

const isTokenBlock = (block: RuleBlock) => {
    return TOKEN_BLOCK_SELECTORS.has(block.selector);
};

const readDefinitions = (source: string) => {
    return Array.from(source.matchAll(VARIABLE_DEFINITION), match => {
        return match[1] ?? '';
    });
};

test('colors are written only inside token and theme definition blocks', () => {
    for (const [file, source] of SOURCES) {
        for (const block of readBlocks(source)) {
            if (!isTokenBlock(block)) {
                assert.doesNotMatch(
                    block.body,
                    COLOR_LITERAL,
                    `${file}: ${block.selector} hardcodes a color, define a token instead`
                );
            }
        }
    }
});

test('token definition blocks hold only custom properties and the color scheme', () => {
    for (const [file, source] of SOURCES) {
        for (const block of readBlocks(source)) {
            if (
                isTokenBlock(block) &&
                block.selector !== THEME_PLUGIN_SELECTOR
            ) {
                const names = Array.from(
                    block.body.matchAll(DECLARATION_PATTERN),
                    match => {
                        return match[1] ?? '';
                    }
                );

                assert.ok(names.length > 0, `${file}: ${block.selector}`);
                assert.ok(
                    names.every(name => {
                        return name.startsWith('--') || name === 'color-scheme';
                    }),
                    `${file}: ${block.selector} mixes tokens with styling`
                );
            }
        }
    }
});

test('the divider color is defined once, at theme level', () => {
    const owners = STYLE_FILES.flatMap(file => {
        return readBlocks(SOURCES.get(file) ?? '')
            .filter(block => {
                return readDefinitions(block.body).includes('divider');
            })
            .map(block => {
                return `${file} ${block.selector}`;
            });
    });

    assert.deepEqual(owners, ['src/app/styles/app.css [data-theme]']);
    assert.match(
        SOURCES.get('src/app/styles/app.css') ?? '',
        /^\[data-theme\] \{[^}]*--divider: color-mix\(in srgb, var\(--ink\) 18%, var\(--tag\)\);/m
    );
});

test('no color-mix expression is written twice', () => {
    const seen = new Map<string, string>();

    for (const [file, source] of SOURCES) {
        for (const match of source.matchAll(COLOR_MIX_EXPRESSION)) {
            const expression = match[0].replace(/\s+/g, ' ');

            assert.equal(
                seen.get(expression),
                undefined,
                `${file}: ${expression} already defined in ${seen.get(expression)}`
            );
            seen.set(expression, file);
        }
    }
});

test('every referenced custom property is defined or provided by a library', () => {
    const defined = new Set(
        STYLE_FILES.flatMap(file => {
            return readDefinitions(SOURCES.get(file) ?? '');
        })
    );

    for (const [file, source] of SOURCES) {
        for (const match of source.matchAll(VARIABLE_REFERENCE)) {
            const name = match[1] ?? '';

            assert.ok(
                defined.has(name) ||
                    EXTERNAL_VARIABLE.test(name) ||
                    EXTERNALLY_PROVIDED.has(name),
                `${file}: var(--${name}) is never defined`
            );
        }
    }
});
