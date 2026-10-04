import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDescription } from '../src/bot/input/description';
import { parseFindQuery } from '../src/bot/input/find-query';
import { cutText, truncateWithMark } from '../src/bot/input/limits';
import {
    extractLink,
    isRenderableLink,
    parseLink
} from '../src/bot/input/link';
import { pickLargestPhoto } from '../src/bot/input/photo';
import { parsePrice } from '../src/bot/input/price';
import { isRemoveCommand } from '../src/bot/input/remove-command';
import { parseTitle } from '../src/bot/input/title';
import { parseWishImages } from '../src/bot/input/wish-images';

const removeLabels = ['❌ Видалити', '❌ Remove', '❌ Usuń'];

test('parsePrice accepts spaced thousands', () => {
    assert.deepEqual(parsePrice('1 500', removeLabels), {
        ok: true,
        value: 1500
    });
    assert.deepEqual(parsePrice('1 500', removeLabels), {
        ok: true,
        value: 1500
    });
    assert.deepEqual(parsePrice('1 500', removeLabels), {
        ok: true,
        value: 1500
    });
});

test('parsePrice treats the comma as a decimal separator and rounds', () => {
    assert.deepEqual(parsePrice('1500,50', removeLabels), {
        ok: true,
        value: 1501
    });
    assert.deepEqual(parsePrice('1500.49', removeLabels), {
        ok: true,
        value: 1500
    });
});

test('parsePrice treats a separator followed by exactly three digits as thousands', () => {
    const cases: Array<[string, number]> = [
        ['1,500', 1500],
        ['1.500', 1500],
        ['1 500', 1500],
        ['12,345', 12345],
        ['12.345', 12345],
        ['1,234,567', 1234567],
        ['1.234.567', 1234567],
        ['1,500.00', 1500],
        ['1.500,00', 1500],
        ['1.500,50', 1501],
        ['1,500.49', 1500],
        ['1,500 UAH', 1500],
        ['999', 999]
    ];

    for (const [input, value] of cases) {
        assert.deepEqual(
            parsePrice(input, removeLabels),
            { ok: true, value },
            input
        );
    }
});

test('parsePrice keeps other separators as decimals and rounds', () => {
    const cases: Array<[string, number]> = [
        ['1500,50', 1501],
        ['1500.50', 1501],
        ['1500.49', 1500],
        ['15,5', 16],
        ['1.5', 2],
        ['1,50', 2],
        ['1,5000', 2],
        ['0,500', 1],
        ['0.500', 1],
        ['1500', 1500]
    ];

    for (const [input, value] of cases) {
        assert.deepEqual(
            parsePrice(input, removeLabels),
            { ok: true, value },
            input
        );
    }
});

test('parsePrice rejects text without a leading number', () => {
    assert.deepEqual(parsePrice('abc', removeLabels), {
        ok: false,
        reason: 'invalid'
    });
    assert.deepEqual(parsePrice('', removeLabels), {
        ok: false,
        reason: 'invalid'
    });
    assert.deepEqual(parsePrice(undefined, removeLabels), {
        ok: false,
        reason: 'invalid'
    });
    assert.deepEqual(parsePrice('-5', removeLabels), {
        ok: false,
        reason: 'invalid'
    });
});

test('parsePrice rejects values above one billion', () => {
    assert.deepEqual(parsePrice('1000000001', removeLabels), {
        ok: false,
        reason: 'invalid'
    });
    assert.deepEqual(parsePrice('1000000000', removeLabels), {
        ok: true,
        value: 1_000_000_000
    });
});

test('parsePrice maps the remove label of any locale to zero', () => {
    for (const label of removeLabels) {
        assert.deepEqual(parsePrice(label, removeLabels), {
            ok: true,
            value: 0
        });
    }
});

test('isRemoveCommand ignores surrounding whitespace', () => {
    assert.equal(isRemoveCommand(' ❌ Видалити ', removeLabels), true);
    assert.equal(isRemoveCommand('Видалити', removeLabels), false);
    assert.equal(isRemoveCommand(undefined, removeLabels), false);
});

test('extractLink takes the first http link from surrounding text', () => {
    assert.equal(
        extractLink('look here: https://example.com/a?b=1 and more'),
        'https://example.com/a?b=1'
    );
    assert.equal(
        extractLink('first http://one.test then https://two.test'),
        'http://one.test'
    );
});

test('isRenderableLink accepts only one whole http or https url', () => {
    assert.equal(isRenderableLink('https://example.com/a?b=1'), true);
    assert.equal(isRenderableLink('http://example.com'), true);
    assert.equal(isRenderableLink(null), false);
    assert.equal(isRenderableLink(undefined), false);
    assert.equal(isRenderableLink(''), false);
    assert.equal(isRenderableLink('example.com'), false);
    assert.equal(isRenderableLink('ftp://example.com/a'), false);
    assert.equal(isRenderableLink('https://example.com/a b'), false);
    assert.equal(
        isRenderableLink('https://example.com/a\nhttps://b.com'),
        false
    );
    assert.equal(isRenderableLink(' https://example.com'), false);
    assert.equal(
        isRenderableLink(`https://example.com/${'a'.repeat(2048)}`),
        false
    );
});

test('truncateWithMark keeps short text and cuts long text to the limit with an ellipsis', () => {
    assert.equal(truncateWithMark('abc', 3), 'abc');
    assert.equal(truncateWithMark('abcd', 3), 'ab…');
    assert.equal(Array.from(truncateWithMark('😀'.repeat(20), 10)).length, 10);
});

test('extractLink rejects missing, malformed and oversized links', () => {
    assert.equal(extractLink('no link here'), null);
    assert.equal(extractLink('ftp://example.com/file'), null);
    assert.equal(extractLink('http://'), null);
    assert.equal(extractLink(`https://example.com/${'a'.repeat(2048)}`), null);
    assert.equal(extractLink(undefined), null);
});

test('parseLink supports removal and reports invalid input', () => {
    assert.deepEqual(parseLink('❌ Видалити', removeLabels), {
        ok: true,
        value: null
    });
    assert.deepEqual(parseLink('https://example.com', removeLabels), {
        ok: true,
        value: 'https://example.com'
    });
    assert.deepEqual(parseLink('example.com', removeLabels), {
        ok: false,
        reason: 'invalid'
    });
});

test('parseTitle trims and validates', () => {
    assert.deepEqual(parseTitle('  Кавоварка  '), {
        ok: true,
        value: 'Кавоварка'
    });
    assert.deepEqual(parseTitle('   '), { ok: false, reason: 'empty' });
    assert.deepEqual(parseTitle(undefined), { ok: false, reason: 'empty' });
    assert.deepEqual(parseTitle('a'.repeat(201)), {
        ok: false,
        reason: 'tooLong'
    });
    assert.deepEqual(parseTitle('a'.repeat(200)), {
        ok: true,
        value: 'a'.repeat(200)
    });
    assert.deepEqual(parseTitle('see HTTPS://shop.test'), {
        ok: false,
        reason: 'containsLink'
    });
});

test('parseDescription trims, limits and supports removal', () => {
    assert.deepEqual(parseDescription(' text ', removeLabels), {
        ok: true,
        value: 'text'
    });
    assert.deepEqual(parseDescription('❌ Видалити', removeLabels), {
        ok: true,
        value: null
    });
    assert.deepEqual(parseDescription('', removeLabels), {
        ok: false,
        reason: 'empty'
    });
    assert.deepEqual(parseDescription('a'.repeat(501), removeLabels), {
        ok: false,
        reason: 'tooLong'
    });
});

const UKRAINIAN_SEARCHER = { locale: 'uk', currency: 'UAH' } as const;
const POLISH_SEARCHER = { locale: 'pl', currency: 'PLN' } as const;
const ENGLISH_USD_SEARCHER = { locale: 'en', currency: 'USD' } as const;
const ENGLISH_PLN_SEARCHER = { locale: 'en', currency: 'PLN' } as const;
const ENGLISH_UAH_SEARCHER = { locale: 'en', currency: 'UAH' } as const;

const phoneOf = (
    text: string,
    region: Parameters<typeof parseFindQuery>[1] = ENGLISH_USD_SEARCHER
) => {
    return parseFindQuery(text, region)?.phone;
};

test('parseFindQuery strips at signs and leaves usernames out of phone search', () => {
    assert.deepEqual(parseFindQuery('@Some_User', UKRAINIAN_SEARCHER), {
        username: 'Some_User',
        phone: { kind: 'none' }
    });
    assert.deepEqual(parseFindQuery('user380501234567', UKRAINIAN_SEARCHER), {
        username: 'user380501234567',
        phone: { kind: 'none' }
    });
    assert.equal(parseFindQuery('   ', UKRAINIAN_SEARCHER), null);
    assert.equal(parseFindQuery(undefined, UKRAINIAN_SEARCHER), null);
});

test('parseFindQuery treats phone-shaped text as a phone only', () => {
    assert.deepEqual(
        parseFindQuery('+380 (50) 123-45-67', ENGLISH_USD_SEARCHER),
        {
            username: null,
            phone: { kind: 'digits', digits: '380501234567' }
        }
    );
});

test('parseFindQuery keeps eleven or more digits as a full international number', () => {
    assert.deepEqual(phoneOf('380501234567'), {
        kind: 'digits',
        digits: '380501234567'
    });
    assert.deepEqual(phoneOf('+48 512 345 678'), {
        kind: 'digits',
        digits: '48512345678'
    });
    assert.deepEqual(phoneOf('+1 (415) 555-0132'), {
        kind: 'digits',
        digits: '14155550132'
    });
    assert.deepEqual(phoneOf('1234567890123456'), { kind: 'none' });
});

test('parseFindQuery prefixes ten-digit Ukrainian national numbers with 38', () => {
    for (const region of [UKRAINIAN_SEARCHER, ENGLISH_USD_SEARCHER]) {
        assert.deepEqual(phoneOf('0501234567', region), {
            kind: 'digits',
            digits: '380501234567'
        });
        assert.deepEqual(phoneOf('050 123-45-67', region), {
            kind: 'digits',
            digits: '380501234567'
        });
    }

    assert.deepEqual(phoneOf('5012345678'), { kind: 'needsCountryCode' });
});

test('parseFindQuery infers the country of nine-digit numbers from the searcher', () => {
    assert.deepEqual(phoneOf('512 345 678', POLISH_SEARCHER), {
        kind: 'digits',
        digits: '48512345678'
    });
    assert.deepEqual(phoneOf('501234567', UKRAINIAN_SEARCHER), {
        kind: 'digits',
        digits: '380501234567'
    });
    assert.deepEqual(phoneOf('512345678', ENGLISH_PLN_SEARCHER), {
        kind: 'digits',
        digits: '48512345678'
    });
    assert.deepEqual(phoneOf('501234567', ENGLISH_UAH_SEARCHER), {
        kind: 'digits',
        digits: '380501234567'
    });
    assert.deepEqual(phoneOf('512345678', { locale: 'pl', currency: 'UAH' }), {
        kind: 'digits',
        digits: '48512345678'
    });
    assert.deepEqual(phoneOf('512345678', ENGLISH_USD_SEARCHER), {
        kind: 'needsCountryCode'
    });
});

test('parseFindQuery never turns short or ambiguous numbers into a prefix search', () => {
    for (const text of ['123', '12345678', '+', '( )']) {
        const phone = phoneOf(text, UKRAINIAN_SEARCHER);

        assert.notEqual(phone?.kind, 'digits', text);
    }

    assert.deepEqual(phoneOf('12345678', UKRAINIAN_SEARCHER), {
        kind: 'needsCountryCode'
    });
    assert.deepEqual(phoneOf('+', UKRAINIAN_SEARCHER), { kind: 'none' });
});

test('pickLargestPhoto chooses the biggest resolution', () => {
    assert.equal(pickLargestPhoto([]), null);
    assert.equal(
        pickLargestPhoto([
            { file_id: 'small', width: 90, height: 90 },
            { file_id: 'big', width: 1280, height: 960 },
            { file_id: 'medium', width: 320, height: 240 }
        ])?.file_id,
        'big'
    );
});

test('parseWishImages tolerates invalid json', () => {
    assert.deepEqual(parseWishImages('["a","b"]'), ['a', 'b']);
    assert.deepEqual(parseWishImages('not json'), []);
    assert.deepEqual(parseWishImages('{"a":1}'), []);
    assert.deepEqual(parseWishImages('["a",1,""]'), ['a']);
});

test('cutText never splits a surrogate pair', () => {
    assert.equal(cutText('😀😀😀', 2), '😀😀');
    assert.equal(cutText('abc', 5), 'abc');
});
