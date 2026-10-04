import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    hashImportUrl,
    isBlockedImportHost,
    normalizeImportUrl,
    registrableDomain
} from '../src/bot/services/link-import/normalize-url';
import { LINK_IMPORT_URL_HASH_LENGTH } from '../src/shared/app-api';

describe('normalizeImportUrl', () => {
    it('lower-cases the host, drops the fragment and tracking params, keeps variant params', () => {
        const normalized = normalizeImportUrl(
            '  https://WWW.Zalando.PL/nike-q11.html?size=42&utm_source=tg&UTM_Medium=x&fbclid=1&gclid=2&ref=home&srsltid=3&yclid=4#reviews  '
        );

        assert.deepEqual(normalized, {
            url: 'https://www.zalando.pl/nike-q11.html?size=42',
            host: 'www.zalando.pl',
            registrableDomain: 'zalando.pl'
        });
    });

    it('drops an empty query left after stripping', () => {
        assert.equal(
            normalizeImportUrl('https://prom.ua/ua/p1.html?utm_campaign=a')
                ?.url,
            'https://prom.ua/ua/p1.html'
        );
    });

    it('upgrades http and adds a missing scheme', () => {
        assert.equal(
            normalizeImportUrl('http://rozetka.com.ua/ua/p1/')?.url,
            'https://rozetka.com.ua/ua/p1/'
        );
        assert.equal(
            normalizeImportUrl('rozetka.com.ua/ua/p1/')?.url,
            'https://rozetka.com.ua/ua/p1/'
        );
    });

    it('strips a trailing dot from the host', () => {
        assert.equal(
            normalizeImportUrl('https://allo.ua./ua/p.html')?.host,
            'allo.ua'
        );
    });

    const rejected = [
        '',
        'not a url at all',
        'ftp://shop.example.com/file',
        'javascript:alert(1)',
        'https://shop.example.com:8080/',
        'https://user@shop.example.com/',
        'https://192.168.1.1/',
        'https://[fe80::1]/',
        'https://localhost:3000/',
        'https://nas.local/',
        'https://wishlist.chernenko.dev/w/abc',
        'https://my-worker.workers.dev/',
        `https://shop.example.com/${'a'.repeat(2048)}`
    ];

    for (const raw of rejected) {
        it(`rejects ${raw.slice(0, 60) || 'an empty string'}`, () => {
            assert.equal(normalizeImportUrl(raw), null);
        });
    }
});

describe('registrableDomain', () => {
    const cases: readonly [string, string][] = [
        ['rozetka.com.ua', 'rozetka.com.ua'],
        ['www.olx.ua', 'olx.ua'],
        ['pl.aliexpress.com', 'aliexpress.com'],
        ['www.ikea.com', 'ikea.com'],
        ['www.amazon.co.uk', 'amazon.co.uk'],
        ['epicentrk.ua', 'epicentrk.ua']
    ];

    for (const [host, expected] of cases) {
        it(`maps ${host} to ${expected}`, () => {
            assert.equal(registrableDomain(host), expected);
        });
    }
});

describe('isBlockedImportHost', () => {
    it('allows public shop hosts', () => {
        assert.equal(isBlockedImportHost('www.decathlon.pl'), false);
        assert.equal(isBlockedImportHost('xn--80aswg.xn--p1ai'), false);
    });

    it('blocks single labels, IP literals and our own hosts', () => {
        for (const host of [
            'intranet',
            '10.0.0.1',
            '[::1]',
            'svc.internal',
            'wishlist.chernenko.dev',
            'preview.wishlist.chernenko.dev',
            'workers.dev'
        ]) {
            assert.equal(isBlockedImportHost(host), true, host);
        }
    });
});

describe('hashImportUrl', () => {
    it('returns a stable lowercase hex digest of the contract length', async () => {
        const first = await hashImportUrl('https://prom.ua/ua/p1.html');
        const second = await hashImportUrl('https://prom.ua/ua/p1.html');
        const other = await hashImportUrl('https://prom.ua/ua/p2.html');

        assert.equal(first.length, LINK_IMPORT_URL_HASH_LENGTH);
        assert.match(first, /^[0-9a-f]+$/);
        assert.equal(first, second);
        assert.notEqual(first, other);
    });
});
