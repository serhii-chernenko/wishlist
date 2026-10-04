import assert from 'node:assert/strict';
import test from 'node:test';

import {
    renderWishHtml,
    toWishMessage,
    type WishMarkupFormatters,
    type WishMarkupSource
} from '../src/bot/content/wish-markup';
import { i18nObject } from '../src/i18n/i18n-util';
import { loadLocale } from '../src/i18n/i18n-util.sync';

loadLocale('uk');
const LL = i18nObject('uk');

const formatters: WishMarkupFormatters = {
    formatMoney: value => {
        return `${value} ₴`;
    },
    formatDate: value => {
        return value.toISOString().slice(0, 10);
    }
};

const createWish = (
    overrides: Partial<WishMarkupSource> = {}
): WishMarkupSource => {
    return {
        title: 'Кавоварка',
        description: null,
        price: 0,
        currency: 'UAH',
        priorityLevel: 0,
        hidden: false,
        createdAt: new Date('2026-01-02T10:00:00Z'),
        updatedAt: new Date('2026-01-02T12:00:00Z'),
        ...overrides
    };
};

const ownerFull = {
    audience: 'owner',
    detail: 'full',
    showHidden: true
} as const;

test('markup escapes html special characters in every user field', () => {
    const html = renderWishHtml(
        LL,
        createWish({
            title: `<script>alert("x")</script> & 'q'`,
            description: `<b>bold</b> "quoted" & 'single'`
        }),
        formatters,
        ownerFull
    );

    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('<b>bold</b>'), false);
    assert.ok(
        html.includes(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;'
        )
    );
    assert.ok(
        html.includes(
            '&lt;b&gt;bold&lt;/b&gt; &quot;quoted&quot; &amp; &#39;single&#39;'
        )
    );
});

test('full owner markup lists title, priority, description, price and dates', () => {
    const html = renderWishHtml(
        LL,
        createWish({
            description: 'Опис',
            price: 2500,
            priorityLevel: 3,
            updatedAt: new Date('2026-02-03T10:00:00Z')
        }),
        formatters,
        ownerFull
    );

    assert.equal(
        html,
        [
            '❤️ <b>Кавоварка</b>',
            '\n\n<blockquote>❗️ <b>Наразі дуже хочу це!</b></blockquote>',
            '\n\n✏️ Опис:\nОпис',
            '\n\n💸 Орієнтовна вартість: <b>2500 ₴</b>',
            '\n\n🗓 <i>Створено: 2026-01-02</i>',
            '\n🗓 <i>Оновлено: 2026-02-03</i>'
        ].join('')
    );
});

test('watcher markup uses the watcher priority wording', () => {
    const html = renderWishHtml(
        LL,
        createWish({ priorityLevel: 3 }),
        formatters,
        {
            audience: 'watcher',
            detail: 'full',
            showHidden: false
        }
    );

    assert.ok(html.includes('Наразі дуже хоче це!'));
    assert.equal(html.includes('Наразі дуже хочу це!'), false);
});

test('every priority level except none adds its own priority block', () => {
    const expectedByLevel: Record<number, string | null> = {
        0: null,
        1: 'Наразі трохи хочу це',
        2: 'Наразі хочу це',
        3: 'Наразі дуже хочу це!'
    };

    for (const [level, expected] of Object.entries(expectedByLevel)) {
        const html = renderWishHtml(
            LL,
            createWish({ priorityLevel: Number(level) }),
            formatters,
            ownerFull
        );

        if (expected === null) {
            assert.equal(html.includes('<blockquote>'), false, level);
        } else {
            assert.ok(html.includes(`<b>${expected}</b>`), level);
        }
    }
});

test('prices are formatted in the wish currency', () => {
    const currencies: string[] = [];

    renderWishHtml(
        LL,
        createWish({ price: 15, currency: 'USD' }),
        {
            ...formatters,
            formatMoney: (value, currency) => {
                currencies.push(currency);

                return `${value} ${currency}`;
            }
        },
        ownerFull
    );

    assert.deepEqual(currencies, ['USD']);
});

test('the updated line is omitted when it falls on the creation day', () => {
    const html = renderWishHtml(LL, createWish(), formatters, ownerFull);

    assert.ok(html.includes('Створено: 2026-01-02'));
    assert.equal(html.includes('Оновлено'), false);
});

test('hidden wishes are flagged only when hidden markers are requested', () => {
    const hiddenWish = createWish({ hidden: true });

    assert.ok(
        renderWishHtml(LL, hiddenWish, formatters, ownerFull).includes(
            'приховане від інших'
        )
    );
    assert.equal(
        renderWishHtml(LL, hiddenWish, formatters, {
            ...ownerFull,
            showHidden: false
        }).includes('приховане від інших'),
        false
    );
});

test('summary markup shows title, price and one date line only', () => {
    const summary = renderWishHtml(
        LL,
        createWish({
            description: 'Опис',
            price: 100,
            priorityLevel: 3,
            updatedAt: new Date('2026-02-03T10:00:00Z')
        }),
        formatters,
        { audience: 'owner', detail: 'summary', showHidden: true }
    );

    assert.equal(
        summary,
        [
            '❤️ <b>Кавоварка</b>',
            '\n\n💸 Орієнтовна вартість: <b>100 ₴</b>',
            '\n\n🗓 <i>Оновлено: 2026-02-03</i>'
        ].join('')
    );
});

test('long titles and descriptions are cut before escaping', () => {
    const html = renderWishHtml(
        LL,
        createWish({
            title: '&'.repeat(300),
            description: '<'.repeat(600)
        }),
        formatters,
        ownerFull
    );

    assert.equal(html.split('&amp;').length - 1, 200);
    assert.equal(html.split('&lt;').length - 1, 500);
});

test('toWishMessage parses the stored image list', () => {
    assert.deepEqual(toWishMessage('<b>x</b>', { images: '["a","b"]' }), {
        html: '<b>x</b>',
        images: ['a', 'b']
    });
    assert.deepEqual(toWishMessage('x', { images: 'broken' }), {
        html: 'x',
        images: []
    });
});
