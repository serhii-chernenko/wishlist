import assert from 'node:assert/strict';
import test from 'node:test';

import { splitTextLinks } from '../src/app/logic/text-links';

test('plain text stays one text segment', () => {
    assert.deepEqual(splitTextLinks('Just text\nwith a line break'), [
        { kind: 'text', text: 'Just text\nwith a line break' }
    ]);
    assert.deepEqual(splitTextLinks(''), []);
});

test('a URL in a sentence becomes a link and its full stop stays text', () => {
    assert.deepEqual(
        splitTextLinks(
            'Pages now live on https://wishlist.chernenko.dev. Old ones stay.'
        ),
        [
            { kind: 'text', text: 'Pages now live on ' },
            {
                kind: 'link',
                text: 'https://wishlist.chernenko.dev',
                href: 'https://wishlist.chernenko.dev'
            },
            { kind: 'text', text: '. Old ones stay.' }
        ]
    );
});

test('several links and line breaks keep their order', () => {
    assert.deepEqual(
        splitTextLinks('A http://a.example/x?y=1,\nB https://b.example'),
        [
            { kind: 'text', text: 'A ' },
            {
                kind: 'link',
                text: 'http://a.example/x?y=1',
                href: 'http://a.example/x?y=1'
            },
            { kind: 'text', text: ',\nB ' },
            {
                kind: 'link',
                text: 'https://b.example',
                href: 'https://b.example'
            }
        ]
    );
});

test('a closing bracket belongs to the URL only when it opened inside it', () => {
    assert.deepEqual(splitTextLinks('(see https://a.example/x)'), [
        { kind: 'text', text: '(see ' },
        {
            kind: 'link',
            text: 'https://a.example/x',
            href: 'https://a.example/x'
        },
        { kind: 'text', text: ')' }
    ]);
    assert.deepEqual(splitTextLinks('https://en.wiki.example/A_(b)'), [
        {
            kind: 'link',
            text: 'https://en.wiki.example/A_(b)',
            href: 'https://en.wiki.example/A_(b)'
        }
    ]);
});

test('only http and https are linked, quotes end a URL', () => {
    assert.deepEqual(splitTextLinks('ftp://x.example javascript:alert(1)'), [
        { kind: 'text', text: 'ftp://x.example javascript:alert(1)' }
    ]);
    assert.deepEqual(splitTextLinks('«https://a.example»'), [
        { kind: 'text', text: '«' },
        { kind: 'link', text: 'https://a.example', href: 'https://a.example' },
        { kind: 'text', text: '»' }
    ]);
    assert.deepEqual(splitTextLinks('https://'), [
        { kind: 'text', text: 'https://' }
    ]);
});
