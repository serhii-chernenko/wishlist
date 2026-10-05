import assert from 'node:assert/strict';
import test from 'node:test';

import {
    inlineMarkup,
    mergeAdjacentText,
    textWithBreaks,
    trimEdgeWhitespace
} from '../src/web/share/inline-markup';

test('inlineMarkup converts emphasis and bare links', () => {
    assert.deepEqual(
        inlineMarkup('a *b* _c_ https://x.test/p?q=1, www.y.test.'),
        [
            'a ',
            { tag: 'strong', children: ['b'] },
            ' ',
            { tag: 'em', children: ['c'] },
            ' ',
            {
                tag: 'a',
                attrs: { href: 'https://x.test/p?q=1' },
                children: ['https://x.test/p?q=1']
            },
            ', ',
            {
                tag: 'a',
                attrs: { href: 'https://www.y.test' },
                children: ['www.y.test']
            },
            '.'
        ]
    );
});

test('inlineMarkup keeps snake_case words and urls with underscores intact', () => {
    assert.deepEqual(inlineMarkup('snake_case_word'), ['snake_case_word']);
    assert.deepEqual(inlineMarkup('https://x.test/a_b_c'), [
        {
            tag: 'a',
            attrs: { href: 'https://x.test/a_b_c' },
            children: ['https://x.test/a_b_c']
        }
    ]);
});

test('inlineMarkup without emphasis only links urls', () => {
    assert.deepEqual(
        inlineMarkup('a *b* https://x.test', { emphasis: false }),
        [
            'a *b* ',
            {
                tag: 'a',
                attrs: { href: 'https://x.test' },
                children: ['https://x.test']
            }
        ]
    );
});

test('inlineMarkup never emits script or html tags', () => {
    assert.deepEqual(inlineMarkup('<script>alert(1)</script>'), [
        '<script>alert(1)</script>'
    ]);
});

test('inlineMarkup turns new lines into break elements', () => {
    assert.deepEqual(inlineMarkup('one\ntwo *three*\nfour'), [
        'one',
        { tag: 'br' },
        'two ',
        { tag: 'strong', children: ['three'] },
        { tag: 'br' },
        'four'
    ]);
});

test('inlineMarkup keeps trailing punctuation outside of the link', () => {
    assert.deepEqual(inlineMarkup('see https://x.test/a?b=1!'), [
        'see ',
        {
            tag: 'a',
            attrs: { href: 'https://x.test/a?b=1' },
            children: ['https://x.test/a?b=1']
        },
        '!'
    ]);
});

test('inlineMarkup output survives a JSON round trip', () => {
    const nodes = inlineMarkup('a *b* _c_ https://x.test\nlast');

    assert.deepEqual(JSON.parse(JSON.stringify(nodes)), nodes);
});

test('textWithBreaks drops empty lines but keeps their breaks', () => {
    assert.deepEqual(textWithBreaks('a\n\nb'), [
        'a',
        { tag: 'br' },
        { tag: 'br' },
        'b'
    ]);
});

test('mergeAdjacentText joins neighbouring strings only', () => {
    assert.deepEqual(mergeAdjacentText(['a', 'b', { tag: 'br' }, 'c', 'd']), [
        'ab',
        { tag: 'br' },
        'cd'
    ]);
});

test('trimEdgeWhitespace trims only the outer text nodes', () => {
    assert.deepEqual(
        trimEdgeWhitespace([' ', '  a ', { tag: 'br' }, ' b  ', ' ']),
        ['a ', { tag: 'br' }, ' b']
    );
});
