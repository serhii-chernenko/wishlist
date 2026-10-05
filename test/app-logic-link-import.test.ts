import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classifyImportFailure,
    formatSourcePrice,
    importImageSources,
    linkOnlyStart,
    noteForOutcome,
    parseImportTarget,
    startFromResult
} from '../src/app/logic/link-import';
import { createEmptyDraft } from '../src/app/logic/wish-draft';
import type { LinkImportDto } from '../src/shared/app-api';

const target = { url: 'https://shop.example/p/1', host: 'shop.example' };

const result = (patch: Partial<LinkImportDto> = {}): LinkImportDto => {
    return {
        outcome: 'ok',
        source: 'jsonld',
        importToken: 'token',
        draft: {
            title: 'Kettle',
            description: 'Steel',
            link: 'https://shop.example/p/1',
            price: 1500,
            currency: 'UAH'
        },
        sourcePrice: null,
        images: [
            { url: '/img/i/a/0?e=1&s=x', index: 0 },
            { url: '/img/i/a/1?e=1&s=x', index: 1 },
            { url: '/img/i/a/2?e=1&s=x', index: 2 },
            { url: '/img/i/a/3?e=1&s=x', index: 3 },
            { url: '/img/i/a/4?e=1&s=x', index: 4 },
            { url: '/img/i/a/5?e=1&s=x', index: 5 }
        ],
        ...patch
    };
};

test('a pasted link becomes a target with a www-free host', () => {
    assert.deepEqual(parseImportTarget('  https://www.rozetka.com.ua/p/1/  '), {
        url: 'https://www.rozetka.com.ua/p/1/',
        host: 'rozetka.com.ua'
    });
});

test('a link without a scheme gets https', () => {
    assert.deepEqual(parseImportTarget('ikea.pl/pl/p/lamp-123'), {
        url: 'https://ikea.pl/pl/p/lamp-123',
        host: 'ikea.pl'
    });
});

test('a link is found inside shared text', () => {
    assert.equal(
        parseImportTarget('Look at this https://shop.example/p/1 nice')?.url,
        'https://shop.example/p/1'
    );
});

test('text that is not a public http link is not a target', () => {
    for (const text of [
        '',
        '   ',
        'kettle',
        'two words.com',
        'ftp://shop.example/file',
        'javascript:alert(1)',
        'https://localhost/p',
        'https://192.168.0.1/p',
        'https://[::1]/p',
        'https://user:pass@shop.example/p',
        'mailto:a@b.co',
        `https://shop.example/${'a'.repeat(2100)}`
    ]) {
        assert.equal(parseImportTarget(text), null, text);
    }
});

test('outcomes map to the note shown in the editor', () => {
    assert.deepEqual(noteForOutcome('ok', 'shop.example'), {
        kind: 'filled',
        host: 'shop.example'
    });
    assert.deepEqual(noteForOutcome('partial', 'shop.example'), {
        kind: 'partial',
        host: 'shop.example'
    });
    assert.deepEqual(noteForOutcome('blocked', 'shop.example'), {
        kind: 'failed',
        reason: 'blocked'
    });
    assert.deepEqual(noteForOutcome('rateLimited', 'shop.example'), {
        kind: 'failed',
        reason: 'rateLimited'
    });
    assert.equal(noteForOutcome('invalidUrl', 'shop.example'), null);
});

test('only the preselected images become tiles and every tile carries the token', () => {
    const sources = importImageSources(result());

    assert.equal(sources.length, 5);
    assert.deepEqual(sources[0], {
        importToken: 'token',
        index: 0,
        previewUrl: '/img/i/a/0?e=1&s=x'
    });
    assert.equal(importImageSources(result(), 2).length, 2);
    assert.deepEqual(importImageSources(result({ importToken: null })), []);
});

test('a found product fills the draft, the banner and the photo tiles', () => {
    const start = startFromResult(result(), target, 'EUR');

    assert.equal(start?.draft.title, 'Kettle');
    assert.equal(start?.draft.price, '1500');
    assert.equal(start?.draft.currency, 'UAH');
    assert.deepEqual(start?.note, { kind: 'filled', host: 'shop.example' });
    assert.equal(start?.images.length, 5);
});

test('a partial result keeps the title and leaves the price empty', () => {
    const start = startFromResult(
        result({
            outcome: 'partial',
            draft: {
                title: 'Kettle',
                description: null,
                link: 'https://shop.example/p/1',
                price: null,
                currency: null
            },
            sourcePrice: { amount: 49.99, currency: 'GBP' }
        }),
        target,
        'EUR'
    );

    assert.equal(start?.draft.price, '');
    assert.equal(start?.draft.currency, 'EUR');
    assert.deepEqual(start?.sourcePrice, { amount: 49.99, currency: 'GBP' });
    assert.deepEqual(start?.note, { kind: 'partial', host: 'shop.example' });
});

test('a failed outcome opens the editor with only the link and no photos', () => {
    const start = startFromResult(
        result({ outcome: 'blocked', importToken: null, images: [] }),
        target,
        'PLN'
    );

    assert.deepEqual(start, {
        draft: { ...createEmptyDraft('PLN'), link: target.url },
        note: { kind: 'failed', reason: 'blocked' },
        sourcePrice: null,
        images: []
    });
});

test('a rejected link has no editor to open', () => {
    assert.equal(
        startFromResult(result({ outcome: 'invalidUrl' }), target, 'UAH'),
        null
    );
});

test('the link falls back to what the user pasted when the answer has none', () => {
    const start = startFromResult(
        result({ draft: { ...result().draft, link: '' } }),
        target,
        'UAH'
    );

    assert.equal(start?.draft.link, target.url);
});

test('a link-only start can carry a reason or none', () => {
    assert.equal(linkOnlyStart(target.url, 'UAH', null).note, null);
    assert.deepEqual(linkOnlyStart(target.url, 'UAH', 'timeout').note, {
        kind: 'failed',
        reason: 'timeout'
    });
});

test('request failures are told apart by what the screen does next', () => {
    assert.equal(
        classifyImportFailure({
            kind: 'api',
            status: 422,
            code: 'validation',
            fields: { url: 'invalid' }
        }),
        'invalidUrl'
    );
    assert.equal(
        classifyImportFailure({ kind: 'api', status: 503, code: 'disabled' }),
        'disabled'
    );
    assert.equal(
        classifyImportFailure({
            kind: 'api',
            status: 429,
            code: 'rateLimited'
        }),
        'rateLimited'
    );
    assert.equal(classifyImportFailure({ kind: 'network' }), 'other');
    assert.equal(
        classifyImportFailure({ kind: 'api', status: 502, code: 'upstream' }),
        'other'
    );
});

test('a source price keeps its own currency code', () => {
    assert.equal(
        formatSourcePrice({ amount: 49.99, currency: 'GBP' }, 'en'),
        '49.99 GBP'
    );
    assert.equal(
        formatSourcePrice({ amount: 1200, currency: 'CZK' }, 'en'),
        '1,200 CZK'
    );
});
