import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ALIGNMENT_PROBE_SOURCE } from '../scripts/web/alignment-probe';

const readSource = (path: string) => {
    return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
};

const SEGMENTED_SOURCE = readSource('src/app/styles/segmented.css');
const APP_PRIORITY_SOURCE = readSource('src/app/styles/priority.css');
const WEB_PRIORITY_SOURCE = readSource('src/web/styles/priority.css');
const EDITOR_SOURCE = readSource('src/app/screens/wish-editor.tsx');

test('segmented labels stay on one line and truncate instead of wrapping', () => {
    assert.match(
        SEGMENTED_SOURCE,
        /\.segmented-label \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis/
    );
    assert.match(SEGMENTED_SOURCE, /\.segmented-label \{[^}]*overflow: hidden/);
    assert.match(
        SEGMENTED_SOURCE,
        /grid-auto-columns: minmax\(var\(--tap-size\), 1fr\)/
    );
});

test('the alignment probe reports wrapped or clipped segmented labels', () => {
    assert.match(ALIGNMENT_PROBE_SOURCE, /\.segmented-label/);
    assert.match(ALIGNMENT_PROBE_SOURCE, /segmentedLabelsWrapped/);
});

test('the wish editor picks priority from a list, not a segmented control', () => {
    assert.match(EDITOR_SOURCE, /<ChoiceCards[^>]*name='wish-priority'/);
    assert.match(EDITOR_SOURCE, /variant='list'/);
    assert.doesNotMatch(EDITOR_SOURCE, /<Segmented\b[^>]*wish-priority/);
});

test('priority list markers reuse the badge fill tokens', () => {
    for (const level of ['low', 'medium', 'high']) {
        assert.match(
            APP_PRIORITY_SOURCE,
            new RegExp(
                `\\.row-marker\\[data-level='${level}'\\] \\{\\s*--marker-fill: var\\(--prio-${level}\\)`
            )
        );
        assert.match(
            WEB_PRIORITY_SOURCE,
            new RegExp(
                `\\.priority-badge\\[data-level='${level}'\\] \\{\\s*--prio-fill: var\\(--prio-${level}\\)`
            )
        );
    }

    assert.match(
        APP_PRIORITY_SOURCE,
        /\.row-marker::before \{[^}]*background: var\(--marker-fill, transparent\)/
    );
});

const GIFT_TAG_SOURCE = readSource('src/web/styles/gift-tag.css');
const APP_SWITCH_SOURCE = readSource('src/app/styles/switch.css');
const WEB_SWITCH_SOURCE = readSource('src/web/styles/switch.css');
const WEB_SWITCH_SELECTED = [
    '.lang-switch',
    '.theme-switch',
    '.currency-switch'
]
    .map(selector => {
        return `${selector.replace('.', '\\.')} \\[aria-current\\]`;
    })
    .join(',\\s*');

const LIFT_DECLARATIONS = [
    /border-color: var\(--ink\);/,
    /box-shadow: var\(--switch-lift\) var\(--switch-lift\) 0 var\(--ink\);/,
    /translate: calc\(var\(--switch-lift\) \* -0\.5\)\s+calc\(var\(--switch-lift\) \* -0\.5\);/
];

const STYLE_SOURCES = [
    'src/app/styles/app.css',
    'src/app/styles/segmented.css',
    'src/app/styles/switch.css',
    'src/web/styles/gift-tag.css',
    'src/web/styles/share.css',
    'src/web/styles/switch.css',
    'src/web/styles/currency-switch.css'
].map(readSource);

test('the switch lift offset and press motion are tokens defined once', () => {
    for (const token of ['--switch-lift: 2px', '--motion-switch: 120ms']) {
        const definitions = STYLE_SOURCES.flatMap(source => {
            return source.match(new RegExp(`^\\s*${token}`, 'gm')) ?? [];
        });

        assert.equal(definitions.length, 1, token);
    }

    assert.match(GIFT_TAG_SOURCE, /--switch-lift: 2px;/);
});

test('the selected app segment and filter chip lift off the strip with the ink shadow', () => {
    const selected =
        /\.segmented-option:has\(input:checked\),\s*\.chip-group \.chip\[aria-pressed='true'\] \{([^}]*)\}/.exec(
            APP_SWITCH_SOURCE
        )?.[1];

    assert.ok(selected);
    assert.match(selected, /background: var\(--heart\);/);

    for (const declaration of LIFT_DECLARATIONS) {
        assert.match(selected, declaration);
    }
});

test('the selected share page switch options use the same lift', () => {
    const selected = new RegExp(`${WEB_SWITCH_SELECTED} \\{([^}]*)\\}`).exec(
        WEB_SWITCH_SOURCE
    )?.[1];

    assert.ok(selected);
    assert.match(selected, /background: var\(--heart\);/);

    for (const declaration of LIFT_DECLARATIONS) {
        assert.match(selected, declaration);
    }
});

test('pressing the selected option drops it flat and only shadow and translate animate', () => {
    for (const source of [APP_SWITCH_SOURCE, WEB_SWITCH_SOURCE]) {
        assert.match(
            source,
            /:active \{\s*box-shadow: 0 0 0 0 var\(--ink\);\s*translate: 0 0;/
        );
        assert.match(
            source,
            /@media \(prefers-reduced-motion: no-preference\) \{[^@]*transition:\s*box-shadow var\(--motion-switch\),\s*translate var\(--motion-switch\);/
        );
    }
});

test('switch tracks never clip the lifted option', () => {
    for (const source of [
        SEGMENTED_SOURCE,
        APP_SWITCH_SOURCE,
        WEB_SWITCH_SOURCE
    ]) {
        const tracks = source.match(
            /[^{}]*(?:\.segmented|switch ul) \{[^}]*\}/g
        );

        for (const track of tracks ?? []) {
            assert.doesNotMatch(track, /overflow:\s*hidden/);
        }
    }
});

test('unselected segments and share switch options carry a transparent border so selecting never shifts them', () => {
    assert.match(
        SEGMENTED_SOURCE,
        /\.segmented-option \{[^}]*border: var\(--border-thin\) solid transparent;/
    );
    assert.match(
        WEB_SWITCH_SOURCE,
        /\.currency-switch span \{[^}]*border: var\(--border-thin\) solid transparent;/
    );
});
