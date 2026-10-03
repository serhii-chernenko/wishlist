import assert from 'node:assert/strict';
import test from 'node:test';

import { formatReleaseDate, parseReleaseDate } from '../src/app/logic/format';

test('changelog dates in DD.MM.YYYY parse to the same calendar day', () => {
    assert.equal(
        parseReleaseDate('02.10.2026')?.toISOString(),
        '2026-10-02T12:00:00.000Z'
    );
    assert.equal(
        parseReleaseDate('24.12.2023')?.toISOString(),
        '2023-12-24T12:00:00.000Z'
    );
    assert.equal(parseReleaseDate('31.02.2026'), null);
    assert.equal(parseReleaseDate('not a date'), null);
    assert.equal(
        parseReleaseDate('2026-10-02T09:00:00.000Z')?.toISOString(),
        '2026-10-02T09:00:00.000Z'
    );
});

test('release dates render as long localized dates', () => {
    assert.equal(formatReleaseDate('02.10.2026', 'en'), '2 October 2026');
    assert.match(formatReleaseDate('02.10.2026', 'uk'), /^2 жовтня 2026/);
    assert.match(formatReleaseDate('24.12.2023', 'pl'), /^24 grudnia 2023/);
    assert.equal(formatReleaseDate('soon', 'en'), 'soon');
});
