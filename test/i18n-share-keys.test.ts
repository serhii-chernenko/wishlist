import assert from 'node:assert/strict';
import test from 'node:test';

import { getTranslator } from '../src/bot/i18n';
import en from '../src/i18n/en';
import pl from '../src/i18n/pl';
import uk from '../src/i18n/uk';

type Tree = { [key: string]: string | Tree };

const locales = {
    uk: uk as unknown as Tree,
    en: en as unknown as Tree,
    pl: pl as unknown as Tree
};

const flatten = (tree: Tree, prefix: string): [string, string][] => {
    return Object.entries(tree).flatMap(([key, value]) => {
        const path = `${prefix}.${key}`;

        return typeof value === 'string'
            ? [[path, value] as [string, string]]
            : flatten(value, path);
    });
};

const expectedWebKeys = [
    'web.header.count',
    'web.header.updated',
    'web.header.username',
    'web.payments.title',
    'web.payments.description',
    'web.wish.priority',
    'web.wish.price',
    'web.wish.link',
    'web.wish.created',
    'web.wish.updated',
    'web.empty',
    'web.truncated',
    'web.footer.cta',
    'web.footer.support',
    'web.footer.openSource',
    'web.language.label',
    'web.notFound.title',
    'web.notFound.description',
    'web.notFound.cta',
    'web.gone.title',
    'web.gone.description',
    'web.meta.description'
].sort();

const expectedShareKeys = [
    'wishlist.share.consent',
    'wishlist.share.ready',
    'wishlist.share.pageEmpty',
    'wishlist.share.empty',
    'wishlist.share.stopConfirm',
    'wishlist.share.stopped',
    'wishlist.share.newConfirm',
    'wishlist.share.rotated',
    'wishlist.share.sendText',
    'wishlist.share.actions.publish',
    'wishlist.share.actions.open',
    'wishlist.share.actions.send',
    'wishlist.share.actions.stop',
    'wishlist.share.actions.newLink',
    'wishlist.share.actions.showUsername',
    'wishlist.share.actions.hideUsername'
];

test('every locale has the full web.* key set and only plain text in it', () => {
    for (const [locale, tree] of Object.entries(locales)) {
        const entries = flatten(tree.web as Tree, 'web');

        assert.deepEqual(
            entries.map(([key]) => key).sort(),
            expectedWebKeys,
            locale
        );

        for (const [key, text] of entries) {
            assert.doesNotMatch(text, /<\/?[a-z][^>]*>/i, `${locale}:${key}`);
        }
    }
});

test('every locale has the share flow keys without HTML markup', () => {
    for (const [locale, tree] of Object.entries(locales)) {
        const entries = new Map(
            flatten((tree.wishlist as Tree).share as Tree, 'wishlist.share')
        );

        for (const key of expectedShareKeys) {
            const text = entries.get(key);

            assert.ok(text, `${locale}:${key}`);
            assert.doesNotMatch(text, /<\/?[a-z][^>]*>/i, `${locale}:${key}`);
        }
    }
});

test('wish counts use the right plural form in every locale', () => {
    const expected = {
        uk: [
            '1 бажання',
            '2 бажання',
            '5 бажань',
            '11 бажань',
            '21 бажання',
            '22 бажання',
            '25 бажань'
        ],
        en: [
            '1 wish',
            '2 wishes',
            '5 wishes',
            '11 wishes',
            '21 wishes',
            '22 wishes',
            '25 wishes'
        ],
        pl: [
            '1 życzenie',
            '2 życzenia',
            '5 życzeń',
            '11 życzeń',
            '21 życzeń',
            '22 życzenia',
            '25 życzeń'
        ]
    } as const;

    for (const locale of ['uk', 'en', 'pl'] as const) {
        const LL = getTranslator(locale);

        assert.deepEqual(
            [1, 2, 5, 11, 21, 22, 25].map(count => {
                return LL.web.header.count({ count });
            }),
            [...expected[locale]],
            locale
        );
        assert.ok(
            LL.web.meta
                .description({ name: 'Alice', count: 5 })
                .startsWith(`Alice: ${expected[locale][2]}`),
            locale
        );
    }
});

test('the consent copy names the host and the public, indexable nature of the page', () => {
    const hints = {
        uk: ['пошукових систем', 'будь-коли'],
        en: ['search engine', 'any time'],
        pl: ['wyszukiwarek', 'w każdej chwili']
    } as const;

    for (const locale of ['uk', 'en', 'pl'] as const) {
        const consent = getTranslator(locale).wishlist.share.consent({
            name: 'Alice',
            host: 'wishlist.chernenko.dev'
        });

        assert.ok(consent.includes('wishlist.chernenko.dev'), locale);
        assert.ok(consent.includes('Alice'), locale);
        assert.ok(consent.includes('• '), locale);
        assert.ok(consent.includes('@username'), locale);

        for (const hint of hints[locale]) {
            assert.ok(consent.includes(hint), `${locale}:${hint}`);
        }
    }
});

test('the donate description carries a link placeholder and no email address', () => {
    for (const locale of ['uk', 'en', 'pl'] as const) {
        const LL = getTranslator(locale);
        const description = LL.donate.description({
            paypal: 'https://www.paypal.me/chernenkoserhii'
        });

        assert.ok(
            description.includes('https://www.paypal.me/chernenkoserhii'),
            locale
        );
        assert.doesNotMatch(description, /@[a-z]+\.[a-z]+/i, locale);
        assert.equal('buymeacoffee' in LL.donate.services, false, locale);
    }
});
