import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildAppUrl,
    buildMainAppLink,
    buildShareAppLink,
    formatStartParam,
    getStartKind,
    parseStartParam,
    START_PARAM_MAX_LENGTH,
    START_SCREENS
} from '../src/shared/app-links';
import { isValidSharePublicId } from '../src/web/share/public-id';

const PUBLIC_ID = '01k6g4z8q3m2n7p5r9s1t0v6wx';

test('every screen keyword parses to a screen target and round-trips', () => {
    assert.deepEqual(
        [...START_SCREENS],
        [
            'wishes',
            'add',
            'gives',
            'find',
            'share',
            'settings',
            'visibility',
            'payments',
            'language',
            'feedback',
            'stats',
            'donate',
            'releases',
            'about'
        ]
    );

    for (const screen of START_SCREENS) {
        const target = parseStartParam(screen);

        assert.deepEqual(target, { kind: 'screen', screen });
        assert.equal(formatStartParam({ kind: 'screen', screen }), screen);
        assert.equal(getStartKind(screen), 'screen');
    }
});

test('wish and share deep links carry their ids', () => {
    assert.deepEqual(parseStartParam('w_42'), { kind: 'wish', wishId: 42 });
    assert.equal(formatStartParam({ kind: 'wish', wishId: 42 }), 'w_42');
    assert.equal(getStartKind('w_42'), 'wish');
    assert.ok(isValidSharePublicId(PUBLIC_ID));
    assert.deepEqual(parseStartParam(`s_${PUBLIC_ID}`), {
        kind: 'share',
        publicId: PUBLIC_ID
    });
    assert.equal(
        formatStartParam({ kind: 'share', publicId: PUBLIC_ID }),
        `s_${PUBLIC_ID}`
    );
    assert.equal(getStartKind(`s_${PUBLIC_ID}`), 'share');
});

test('anything outside the grammar is rejected', () => {
    for (const value of [
        '',
        'Wishes',
        'home',
        'w_',
        'w_0',
        'w_007',
        'w_-1',
        'w_12a',
        `w_${'9'.repeat(17)}`,
        's_',
        `s_${PUBLIC_ID.toUpperCase()}`,
        `s_${PUBLIC_ID.slice(1)}`,
        `s_${PUBLIC_ID.slice(0, -1)}u`,
        'wishes?x=1',
        'wishes ',
        'wishes/../',
        'a'.repeat(START_PARAM_MAX_LENGTH + 1),
        null,
        undefined
    ]) {
        assert.equal(parseStartParam(value), null, String(value));
        assert.equal(getStartKind(value), 'none', String(value));
    }
});

test('the start param is capped at 64 characters', () => {
    assert.equal(START_PARAM_MAX_LENGTH, 64);
    assert.equal(
        buildAppUrl('https://wishlist.test', 'a'.repeat(64)),
        `https://wishlist.test/app?start=${'a'.repeat(64)}`
    );
    assert.equal(
        buildAppUrl('https://wishlist.test', 'a'.repeat(65)),
        'https://wishlist.test/app'
    );
});

test('buildAppUrl points at /app on the given origin', () => {
    assert.equal(
        buildAppUrl('https://wishlist.chernenko.dev'),
        'https://wishlist.chernenko.dev/app'
    );
    assert.equal(
        buildAppUrl('https://preview-wishlist.chernenko.workers.dev/', 'w_7'),
        'https://preview-wishlist.chernenko.workers.dev/app?start=w_7'
    );
    assert.equal(
        buildAppUrl('https://wishlist.test', 'share'),
        'https://wishlist.test/app?start=share'
    );
    assert.equal(
        buildAppUrl('https://wishlist.test', 'bad param'),
        'https://wishlist.test/app'
    );
    assert.equal(
        buildAppUrl('https://wishlist.test', null),
        'https://wishlist.test/app'
    );
});

test('buildMainAppLink opens the Main Mini App with an optional start param', () => {
    assert.equal(
        buildMainAppLink('https://t.me/wishlist_ua_bot'),
        'https://t.me/wishlist_ua_bot?startapp'
    );
    assert.equal(
        buildMainAppLink('https://t.me/wishlist_ua_bot/', `s_${PUBLIC_ID}`),
        `https://t.me/wishlist_ua_bot?startapp=s_${PUBLIC_ID}`
    );
    assert.equal(
        buildMainAppLink('https://t.me/wishlist_ua_bot', '<script>'),
        'https://t.me/wishlist_ua_bot?startapp'
    );
});

test('buildShareAppLink points a shared list at the bot Mini App and parses back', () => {
    const link = buildShareAppLink('https://t.me/wishlist_ua_bot/', PUBLIC_ID);

    assert.equal(link, `https://t.me/wishlist_ua_bot?startapp=s_${PUBLIC_ID}`);
    assert.deepEqual(parseStartParam(`s_${PUBLIC_ID}`), {
        kind: 'share',
        publicId: PUBLIC_ID
    });
    assert.equal(buildShareAppLink('', PUBLIC_ID), null);
    assert.equal(buildShareAppLink(undefined, PUBLIC_ID), null);
});
