import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getNodesByteLength,
    htmlToNodes,
    inlineMarkup,
    TELEGRAPH_CONTENT_MAX_BYTES
} from '../src/bot/telegraph/nodes';
import {
    buildShareContent,
    type ShareWish
} from '../src/bot/telegraph/share-content';
import { i18nObject } from '../src/i18n/i18n-util';
import { loadLocale } from '../src/i18n/i18n-util.sync';

loadLocale('uk');
const LL = i18nObject('uk');

const baseInput = {
    LL,
    formatMoney: (value: number) => {
        return `${value} ₴`;
    },
    formatDate: (value: Date) => {
        return value.toISOString().slice(0, 10);
    },
    botUrl: 'https://t.me/wishlist_ua_bot',
    donateLinks: [
        { title: 'Monobank', url: 'https://send.monobank.ua/jar/x' },
        { title: 'Buymeacoffee', url: 'https://bmc.test' }
    ]
};

const fixtureWishes: ShareWish[] = [
    {
        title: 'Кавоварка <script>',
        description: 'Опис\nдругий рядок',
        link: 'https://shop.test/a?b=1&c=2',
        price: 2500,
        priority: true,
        createdAt: new Date('2026-01-02T10:00:00Z'),
        updatedAt: new Date('2026-02-03T10:00:00Z')
    },
    {
        title: 'Книга',
        description: null,
        link: null,
        price: 0,
        priority: false,
        createdAt: new Date('2026-01-02T10:00:00Z'),
        updatedAt: new Date('2026-01-02T12:00:00Z')
    }
];

test('share content matches the node snapshot', () => {
    const { nodes, includedWishes, truncated } = buildShareContent({
        ...baseInput,
        payments:
            'Моно *банка*: https://send.monobank.ua/jar/abc. Або _PayPal_',
        wishes: fixtureWishes
    });

    assert.equal(includedWishes, 2);
    assert.equal(truncated, false);
    assert.deepEqual(nodes, [
        {
            tag: 'blockquote',
            children: [
                'Якщо в тебе відсутня змога подарувати мені конкретний подарунок, в мене додані реквізити, за якими можна перерахувати кошти, щоб я мав(-ла) змогу придбати подарунок самостійно:',
                { tag: 'br' },
                { tag: 'br' },
                'Моно ',
                { tag: 'strong', children: ['банка'] },
                ': ',
                {
                    tag: 'a',
                    attrs: { href: 'https://send.monobank.ua/jar/abc' },
                    children: ['https://send.monobank.ua/jar/abc']
                },
                '. Або ',
                { tag: 'em', children: ['PayPal'] }
            ]
        },
        { tag: 'h3', children: ['Кавоварка <script>'] },
        {
            tag: 'p',
            children: [
                '💸 Орієнтовна вартість: ',
                { tag: 'strong', children: ['2500 ₴'] }
            ]
        },
        {
            tag: 'p',
            children: ['Опис', { tag: 'br' }, 'другий рядок']
        },
        {
            tag: 'blockquote',
            children: [
                '❗️ ',
                { tag: 'strong', children: ['Наразі дуже хочу це!'] }
            ]
        },
        {
            tag: 'p',
            children: [
                {
                    tag: 'a',
                    attrs: { href: 'https://shop.test/a?b=1&c=2' },
                    children: ['https://shop.test/a?b=1&c=2']
                }
            ]
        },
        {
            tag: 'p',
            children: ['🗓 ', { tag: 'em', children: ['Створено: 2026-01-02'] }]
        },
        {
            tag: 'p',
            children: ['🗓 ', { tag: 'em', children: ['Оновлено: 2026-02-03'] }]
        },
        { tag: 'hr' },
        { tag: 'h3', children: ['Книга'] },
        {
            tag: 'p',
            children: ['🗓 ', { tag: 'em', children: ['Створено: 2026-01-02'] }]
        },
        { tag: 'hr' },
        {
            tag: 'aside',
            children: [
                {
                    tag: 'a',
                    attrs: { href: 'https://t.me/wishlist_ua_bot' },
                    children: ['Лист бажань ❤️']
                }
            ]
        },
        {
            tag: 'aside',
            children: [
                {
                    tag: 'a',
                    attrs: { href: 'https://send.monobank.ua/jar/x' },
                    children: ['Monobank']
                },
                ' • ',
                {
                    tag: 'a',
                    attrs: { href: 'https://bmc.test' },
                    children: ['Buymeacoffee']
                }
            ]
        }
    ]);
});

test('share nodes survive a json round trip unchanged', () => {
    const { nodes } = buildShareContent({
        ...baseInput,
        payments: null,
        wishes: fixtureWishes
    });

    assert.deepEqual(JSON.parse(JSON.stringify(nodes)), nodes);
});

test('share content without payments or donate links has only the bot footer', () => {
    const { nodes } = buildShareContent({
        ...baseInput,
        donateLinks: [],
        payments: null,
        wishes: [fixtureWishes[1] as ShareWish]
    });

    assert.deepEqual(
        nodes.map(node => {
            return typeof node === 'string' ? node : node.tag;
        }),
        ['h3', 'p', 'hr', 'aside']
    );
});

test('large wishlists are truncated below the 60 KB payload cap', () => {
    const wishes: ShareWish[] = Array.from({ length: 400 }, (_, index) => {
        return {
            title: `Бажання ${index} ${'т'.repeat(150)}`,
            description: 'о'.repeat(480),
            link: `https://shop.test/items/${index}`,
            price: 1000 + index,
            priority: index % 2 === 0,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-02-03T10:00:00Z')
        };
    });
    const { nodes, includedWishes, truncated } = buildShareContent({
        ...baseInput,
        payments: 'реквізити',
        wishes
    });

    assert.equal(truncated, true);
    assert.ok(includedWishes > 0 && includedWishes < wishes.length);
    assert.ok(getNodesByteLength(nodes) <= TELEGRAPH_CONTENT_MAX_BYTES);
    assert.deepEqual(
        nodes.find(node => {
            return typeof node !== 'string' && node.children?.[0] === '…';
        }),
        { tag: 'p', children: ['…'] }
    );
    assert.equal(
        nodes.filter(node => {
            return typeof node !== 'string' && node.tag === 'h3';
        }).length,
        includedWishes
    );
});

test('a small fixture stays far below the payload cap', () => {
    const { nodes } = buildShareContent({
        ...baseInput,
        payments: null,
        wishes: fixtureWishes
    });

    assert.ok(getNodesByteLength(nodes) < TELEGRAPH_CONTENT_MAX_BYTES);
});

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

test('htmlToNodes converts the translation html subset', () => {
    assert.deepEqual(
        htmlToNodes('x <b>bold &amp; <i>it</i></b> <u>y</u> <foo>kept</foo>'),
        [
            'x ',
            {
                tag: 'strong',
                children: ['bold & ', { tag: 'em', children: ['it'] }]
            },
            ' ',
            { tag: 'u', children: ['y'] },
            ' ',
            'kept'
        ]
    );
});
