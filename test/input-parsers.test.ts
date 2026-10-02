import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDescription } from '../src/bot/input/description';
import { parseFindQuery } from '../src/bot/input/find-query';
import { cutText } from '../src/bot/input/limits';
import { extractLink, parseLink } from '../src/bot/input/link';
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

test('parseFindQuery strips at signs and detects long phone numbers', () => {
    assert.deepEqual(parseFindQuery('@Some_User'), {
        username: 'Some_User',
        phoneDigits: null
    });
    assert.deepEqual(parseFindQuery('+380 (50) 123-45-67'), {
        username: '+380 (50) 123-45-67',
        phoneDigits: '380501234567'
    });
    assert.deepEqual(parseFindQuery('123456789'), {
        username: '123456789',
        phoneDigits: null
    });
    assert.equal(parseFindQuery('   '), null);
    assert.equal(parseFindQuery(undefined), null);
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
