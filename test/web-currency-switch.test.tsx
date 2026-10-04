import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildCurrencyCookie,
    buildCurrencySwitchPath,
    isWebCurrencyChoice,
    readCurrencyCookie,
    WEB_CURRENCY_CHOICES
} from '../src/web/currency';
import { variantFingerprint } from '../src/web/share/fingerprint';
import { renderSharePage } from '../src/web/share/render';
import { toSafeBackPath } from '../src/web/theme';
import { FALLBACK_RATES } from '../src/shared/money';
import type { SharePageModel } from '../src/web/share/view-model';

const PUBLIC_ID = 'abcdefghijklmnopqrstuvwx';

const buildModel = (
    overrides: Partial<SharePageModel> = {}
): SharePageModel => {
    return {
        language: 'en',
        publicId: PUBLIC_ID,
        origin: 'https://wishlist.chernenko.dev',
        assetVersion: 'deploy-1',
        displayName: 'Alice',
        username: null,
        payments: null,
        displayCurrency: 'EUR',
        currencyChoice: 'auto',
        deliveryHintShown: false,
        rates: FALLBACK_RATES,
        visibleCount: 1,
        lastUpdatedAt: new Date('2026-02-03T10:00:00Z'),
        wishes: [
            {
                title: 'Coffee',
                description: null,
                link: null,
                price: 2500,
                currency: 'UAH',
                priority: 'none',
                createdAt: new Date('2026-02-01T10:00:00Z'),
                updatedAt: new Date('2026-02-01T10:00:00Z')
            }
        ],
        indexable: true,
        botUrl: 'https://t.me/wishlist_ua_bot',
        githubUrl: 'https://github.com/serhii-chernenko/wishlist',
        supportLinks: [],
        ...overrides
    };
};

test('the currency cookie accepts a known currency and ignores everything else', () => {
    assert.equal(readCurrencyCookie(undefined), 'auto');
    assert.equal(readCurrencyCookie(''), 'auto');
    assert.equal(readCurrencyCookie('currency=USD'), 'USD');
    assert.equal(
        readCurrencyCookie('theme=dark; currency=PLN; other=1'),
        'PLN'
    );
    assert.equal(readCurrencyCookie('currency=usd'), 'auto');
    assert.equal(readCurrencyCookie('currency=GBP'), 'auto');
    assert.equal(readCurrencyCookie('currency=auto'), 'auto');
    assert.equal(readCurrencyCookie('xcurrency=USD'), 'auto');
});

test('the switcher choices are auto plus every supported currency', () => {
    assert.deepEqual(
        [...WEB_CURRENCY_CHOICES],
        ['auto', 'UAH', 'USD', 'EUR', 'PLN']
    );

    for (const choice of WEB_CURRENCY_CHOICES) {
        assert.equal(isWebCurrencyChoice(choice), true);
    }

    assert.equal(isWebCurrencyChoice('GBP'), false);
    assert.equal(isWebCurrencyChoice(undefined), false);
});

test('choosing a currency sets a year long cookie and auto clears it', () => {
    assert.equal(
        buildCurrencyCookie('USD'),
        'currency=USD; Max-Age=31536000; Path=/; SameSite=Lax; Secure'
    );
    assert.equal(
        buildCurrencyCookie('auto'),
        'currency=; Max-Age=0; Path=/; SameSite=Lax; Secure'
    );
});

test('the switch path carries the choice and an encoded back path', () => {
    assert.equal(
        buildCurrencySwitchPath('EUR', '/en/w/abc'),
        '/currency?set=EUR&back=%2Fen%2Fw%2Fabc'
    );
});

test('the back path of the switcher never leaves the site', () => {
    for (const back of ['https://evil.example/', '//evil.example', '/\\evil']) {
        assert.equal(toSafeBackPath(back), '/', back);
    }

    assert.equal(toSafeBackPath('/en/w/abc'), '/en/w/abc');
});

test('each currency choice gets its own page variant', () => {
    const variants = WEB_CURRENCY_CHOICES.map(choice => {
        return variantFingerprint('abc', 'system', choice);
    });

    assert.equal(new Set(variants).size, WEB_CURRENCY_CHOICES.length);
    assert.equal(variants[0], 'abc');
});

test('the switcher sits next to the theme switcher and marks the current choice', () => {
    const html = renderSharePage(buildModel({ currencyChoice: 'USD' }));
    const topBar = /<div class="top-bar">([\s\S]*?)<\/div>/.exec(html)?.[1];

    assert.ok(topBar);
    assert.ok(
        topBar.indexOf('class="theme-switch"') <
            topBar.indexOf('class="currency-switch"')
    );
    assert.ok(
        topBar.indexOf('class="currency-switch"') <
            topBar.indexOf('class="lang-switch"')
    );
    assert.match(topBar, /<nav class="currency-switch" aria-label="Currency">/);
    assert.match(topBar, /<span aria-current="true" aria-label="\$ US dollar"/);
    assert.match(
        topBar,
        new RegExp(
            `href="/currency\\?set=auto&amp;back=%2Fen%2Fw%2F${PUBLIC_ID}" rel="nofollow"`
        )
    );
    assert.doesNotMatch(html, /<form/);
    assert.doesNotMatch(html, /<script/);
});

test('the converted price follows the chosen currency', () => {
    const usd = renderSharePage(
        buildModel({ currencyChoice: 'USD', displayCurrency: 'USD' })
    );
    const uah = renderSharePage(
        buildModel({ currencyChoice: 'UAH', displayCurrency: 'UAH' })
    );

    assert.match(usd, /≈\s*\$/);
    assert.doesNotMatch(uah, /≈/);
    assert.match(uah, /₴/);
});
