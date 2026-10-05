import assert from 'node:assert/strict';
import test from 'node:test';

import en from '../src/i18n/en';
import pl from '../src/i18n/pl';
import uk from '../src/i18n/uk';

type PairLabels = Record<
    'stats' | 'donate' | 'feedback' | 'releases' | 'about',
    string
>;

const SHARED_CELL_MAX_CHARACTERS = 12;
const FULL_WIDTH_CELL_MAX_CHARACTERS = 20;

const locales: Record<string, PairLabels> = {
    uk: (uk as unknown as { app: { home: { pairs: PairLabels } } }).app.home
        .pairs,
    en: (en as unknown as { app: { home: { pairs: PairLabels } } }).app.home
        .pairs,
    pl: (pl as unknown as { app: { home: { pairs: PairLabels } } }).app.home
        .pairs
};

for (const [locale, labels] of Object.entries(locales)) {
    test(`${locale} pairs labels fit a half-width cell`, () => {
        for (const key of [
            'stats',
            'donate',
            'feedback',
            'releases'
        ] as const) {
            assert.ok(
                labels[key].length <= SHARED_CELL_MAX_CHARACTERS,
                `${locale}.${key} "${labels[key]}" is longer than ${SHARED_CELL_MAX_CHARACTERS} characters`
            );
        }
    });

    test(`${locale} pairs about label fits the full-width cell`, () => {
        assert.ok(
            labels.about.length <= FULL_WIDTH_CELL_MAX_CHARACTERS,
            `${locale}.about "${labels.about}" is too long`
        );
    });
}
