import assert from 'node:assert/strict';
import test from 'node:test';

import { computeAutoRows, MAX_AUTO_ROWS } from '../src/app/logic/autosize';

const LINE_HEIGHT = 22;

test('empty content keeps the minimum number of rows', () => {
    assert.equal(
        computeAutoRows({
            contentHeight: 0,
            lineHeight: LINE_HEIGHT,
            minRows: 4
        }),
        4
    );
});

test('content grows the textarea one row per line', () => {
    assert.equal(
        computeAutoRows({
            contentHeight: LINE_HEIGHT * 7,
            lineHeight: LINE_HEIGHT,
            minRows: 4
        }),
        7
    );
});

test('a sub-pixel overflow does not add a row', () => {
    assert.equal(
        computeAutoRows({
            contentHeight: LINE_HEIGHT * 6 + 0.4,
            lineHeight: LINE_HEIGHT,
            minRows: 2
        }),
        6
    );
});

test('a partly filled row rounds up', () => {
    assert.equal(
        computeAutoRows({
            contentHeight: LINE_HEIGHT * 6 + 4,
            lineHeight: LINE_HEIGHT,
            minRows: 2
        }),
        7
    );
});

test('growth stops at twelve rows by default', () => {
    assert.equal(MAX_AUTO_ROWS, 12);
    assert.equal(
        computeAutoRows({
            contentHeight: LINE_HEIGHT * 40,
            lineHeight: LINE_HEIGHT,
            minRows: 2
        }),
        12
    );
});

test('the minimum wins over a smaller cap', () => {
    assert.equal(
        computeAutoRows({
            contentHeight: LINE_HEIGHT * 40,
            lineHeight: LINE_HEIGHT,
            minRows: 6,
            maxRows: 3
        }),
        6
    );
});

test('unusable measurements fall back to the minimum', () => {
    assert.equal(
        computeAutoRows({
            contentHeight: Number.NaN,
            lineHeight: LINE_HEIGHT,
            minRows: 3
        }),
        3
    );
    assert.equal(
        computeAutoRows({
            contentHeight: 100,
            lineHeight: Number.NaN,
            minRows: 3
        }),
        3
    );
    assert.equal(
        computeAutoRows({ contentHeight: 100, lineHeight: 0, minRows: 3 }),
        3
    );
});
