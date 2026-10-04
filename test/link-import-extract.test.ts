import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    decodeHtmlEntities,
    extractProduct,
    stripSiteSuffix
} from '../src/bot/services/link-import/extract';
import type {
    ExtractedProduct,
    LinkImportSource,
    PageSignals
} from '../src/bot/services/link-import/types';

const signalsDirectory = path.resolve(
    process.cwd(),
    'test/fixtures/link-import/signals'
);

const loadSignals = (name: string) => {
    return JSON.parse(
        readFileSync(path.join(signalsDirectory, `${name}.json`), 'utf8')
    ) as PageSignals;
};

const emptySignals = (overrides: Partial<PageSignals> = {}): PageSignals => {
    return {
        jsonLd: [],
        meta: {},
        itemprops: [],
        canonical: null,
        titleTag: null,
        baseHref: null,
        truncated: false,
        ...overrides
    };
};

const SHOP_URL = 'https://shop.example.com/p/kettle-123';

const extractFromJsonLd = (
    nodes: unknown,
    overrides: Partial<PageSignals> = {}
) => {
    return extractProduct(
        emptySignals({ jsonLd: [JSON.stringify(nodes)], ...overrides }),
        SHOP_URL
    );
};

const requireProduct = (product: ExtractedProduct | null) => {
    assert.ok(product, 'expected a product');

    return product;
};

interface FixtureExpectation {
    name: string;
    finalUrl: string;
    source: LinkImportSource;
    title: string;
    price: number | null;
    currency: string | null;
    imageCount: number;
    firstImage?: string;
}

const FIXTURES: readonly FixtureExpectation[] = [
    {
        name: 'rozetka',
        finalUrl:
            'https://rozetka.com.ua/ua/apple-iphone-15-128gb-black/p395460480/',
        source: 'jsonld',
        title: 'Мобільний телефон Apple iPhone 15 128GB Black (MTP03RX/A)',
        price: 44499,
        currency: 'UAH',
        imageCount: 7,
        firstImage:
            'https://content.rozetka.com.ua/goods/images/base_action/364623521.jpg'
    },
    {
        name: 'prom',
        finalUrl:
            'https://prom.ua/ua/p1371891022-chajnik-elektricheskij-kamille.html',
        source: 'jsonld',
        title: 'Чайник електричний Kamille 1л пластиковий (білий з сірим) KM-1719B',
        price: 772,
        currency: 'UAH',
        imageCount: 6
    },
    {
        name: 'epicentrk',
        finalUrl:
            'https://epicentrk.ua/ua/shop/chainyk-tefal-bronx-electric-ki513d10.html',
        source: 'microdata',
        title: 'Електрочайник Tefal Bronx KI513D10',
        price: 2099,
        currency: 'UAH',
        imageCount: 9,
        firstImage: 'https://cdn.27.ua/original/31/f3/7418355_15.jpeg'
    },
    {
        name: 'comfy',
        finalUrl:
            'https://comfy.ua/ua/smartfon-apple-iphone-15-128gb-black.html',
        source: 'jsonld',
        title: 'Смартфон Apple iPhone 15 128Gb Black',
        price: 44499,
        currency: 'UAH',
        imageCount: 1
    },
    {
        name: 'allo',
        finalUrl:
            'https://allo.ua/ua/products/mobile/apple-iphone-15-128gb-black.html',
        source: 'jsonld',
        title: 'Apple iPhone 15 128GB Black (MTP03)',
        price: 44499,
        currency: 'UAH',
        imageCount: 1
    },
    {
        name: 'olx',
        finalUrl:
            'https://www.olx.ua/d/uk/obyavlenie/bagazhnk-na-velosiped-ID11okGv.html',
        source: 'jsonld',
        title: 'Багажнік на велосипед',
        price: 250,
        currency: 'UAH',
        imageCount: 2,
        firstImage:
            'https://ireland.apollo.olxcdn.com/v1/files/zocj5zirfm73-UA/image'
    },
    {
        name: 'ikea-pl',
        finalUrl: 'https://www.ikea.com/pl/pl/p/billy-regal-bialy-00263850/',
        source: 'jsonld',
        title: 'BILLY Regał - biały 80x28x202 cm',
        price: 279,
        currency: 'PLN',
        imageCount: 7,
        firstImage:
            'https://www.ikea.com/pl/pl/images/products/billy-regal-bialy__1590272_pe1038911_s5.jpg'
    },
    {
        name: 'apple',
        finalUrl: 'https://www.apple.com/shop/buy-iphone/iphone-16',
        source: 'jsonld',
        title: 'iPhone 16',
        price: 799,
        currency: 'USD',
        imageCount: 1
    },
    {
        name: 'decathlon',
        finalUrl:
            'https://www.decathlon.pl/p/plecak-turystyczny-quechua-escape-500-23-litry/334344/c382c152c71m8649342',
        source: 'jsonld',
        title: 'Plecak turystyczny Quechua Escape 500 23 litry',
        price: 120,
        currency: 'PLN',
        imageCount: 1,
        firstImage:
            'https://contents.mediadecathlon.com/p2196890/k$4f4dc6b231172445dcb19ce72806b714/picture.jpg'
    },
    {
        name: 'amazon-de',
        finalUrl: 'https://www.amazon.de/echo-dot/dp/B09B9CX8PW',
        source: 'jsonld',
        title: 'Echo Dot (5th Gen, 2022 release) | International Version | smart speaker with Alexa | Charcoal',
        price: null,
        currency: null,
        imageCount: 0
    },
    {
        name: 'zalando',
        finalUrl:
            'https://www.zalando.pl/nike-sportswear-air-force-1-unisex-sneakersy-niskie-black-ni116d0ny-q11.html',
        source: 'jsonld',
        title: 'AIR FORCE 1 UNISEX - Sneakersy niskie',
        price: 377,
        currency: 'PLN',
        imageCount: 8
    },
    {
        name: 'aliexpress',
        finalUrl:
            'https://pl.aliexpress.com/item/1005010207997718.html?gatewayAdapt=glo2pol',
        source: 'og',
        title: 'Bezprzewodowe słuchawki douszne, słuchawki z redukcją szumów ENC i inteligentnym etui dotykowym, zestaw filtrów EQ, stereofoniczny dźwięk basowy, słuchawki Bluetooth 5.4',
        price: null,
        currency: null,
        imageCount: 1,
        firstImage:
            'https://ae-pic-a1.aliexpress-media.com/kf/S198afefb3b5c4a4b84c2c6c0c884e467U.jpg'
    },
    {
        name: 'temu',
        finalUrl:
            'https://www.temu.com/goods.html?_bg_fs=1&goods_id=601099712900528',
        source: 'jsonld',
        title: 'F75 2.4G wireless mechanical keyboard wired gaming RGB',
        price: 90,
        currency: 'PLN',
        imageCount: 0
    }
];

describe('extractProduct on real shop fixtures', () => {
    for (const fixture of FIXTURES) {
        const label =
            fixture.name === 'temu'
                ? 'temu (synthetic signals from the Workers probe)'
                : fixture.name;

        it(`reads ${label}`, () => {
            const product = requireProduct(
                extractProduct(loadSignals(fixture.name), fixture.finalUrl)
            );

            assert.equal(product.source, fixture.source);
            assert.equal(product.title, fixture.title);
            assert.equal(product.price, fixture.price);
            assert.equal(product.currency, fixture.currency);
            assert.equal(product.images.length, fixture.imageCount);
            assert.equal(product.finalUrl, fixture.finalUrl);

            if (fixture.firstImage !== undefined) {
                assert.equal(product.images[0], fixture.firstImage);
            }

            for (const image of product.images) {
                assert.match(image, /^https:\/\//);
                assert.equal(image.includes('&amp;'), false);
            }
        });
    }

    it('rejects the decathlon category page a stale product link redirects to', () => {
        const product = extractProduct(
            loadSignals('decathlon-category'),
            'https://www.decathlon.pl/sporty/turystyka-trekking/plecaki-podrozne'
        );

        assert.equal(product, null);
    });

    it('returns null for the temu bot challenge page', () => {
        const product = extractProduct(
            loadSignals('temu-challenge'),
            'https://www.temu.com/goods.html?goods_id=601099712900528'
        );

        assert.equal(product, null);
    });

    it('picks the decathlon variant whose offer url matches the page', () => {
        const product = requireProduct(
            extractProduct(
                loadSignals('decathlon'),
                'https://www.decathlon.pl/p/plecak-turystyczny-quechua-escape-500-23-l/334344/c271m8844304'
            )
        );

        assert.deepEqual(product.images, [
            'https://contents.mediadecathlon.com/p2629987/k$38c3a71f6f21ffc43960be149530f71e/picture.jpg'
        ]);
        assert.equal(
            product.title,
            'Plecak turystyczny Quechua Escape 500 23 l'
        );
    });

    it('decodes og image entities on apple and keeps the canonical url', () => {
        const product = requireProduct(
            extractProduct(
                loadSignals('apple'),
                'https://www.apple.com/shop/buy-iphone/iphone-16'
            )
        );

        assert.equal(
            product.canonicalUrl,
            'https://www.apple.com/shop/buy-iphone/iphone-16'
        );
        assert.match(product.description ?? '', /^Get \$35 - \$885 off/);
    });

    it('ignores the generic Amazon og block and the duplicate description', () => {
        const product = requireProduct(
            extractProduct(
                loadSignals('amazon-de'),
                'https://www.amazon.de/echo-dot/dp/B09B9CX8PW'
            )
        );

        assert.deepEqual(product.images, []);
        assert.equal(product.description, null);
    });
});

describe('extractProduct JSON-LD shapes', () => {
    it('accepts @type arrays, ImageObject urls and string prices', () => {
        const product = requireProduct(
            extractFromJsonLd({
                '@type': ['Product', 'Thing'],
                name: 'Kettle &amp; Cup',
                image: [{ '@type': 'ImageObject', url: '/img/1.jpg' }],
                offers: { price: '1 299,50', priceCurrency: 'uah' }
            })
        );

        assert.equal(product.title, 'Kettle & Cup');
        assert.equal(product.price, 1300);
        assert.equal(product.currency, 'UAH');
        assert.deepEqual(product.images, [
            'https://shop.example.com/img/1.jpg'
        ]);
    });

    it('skips struck-through and member-tier price specifications', () => {
        const product = requireProduct(
            extractFromJsonLd({
                '@type': 'Product',
                name: 'Kettle',
                offers: {
                    priceSpecification: [
                        {
                            price: 2699,
                            priceCurrency: 'UAH',
                            priceType: 'https://schema.org/StrikethroughPrice'
                        },
                        {
                            price: 1900,
                            priceCurrency: 'UAH',
                            validForMemberTier: { '@id': '#card' }
                        },
                        { price: 2099, priceCurrency: 'UAH' }
                    ]
                }
            })
        );

        assert.equal(product.price, 2099);
    });

    it('rejects a wide AggregateOffer range and falls back to og tags', () => {
        const product = requireProduct(
            extractFromJsonLd(
                {
                    '@type': 'Product',
                    name: 'Kettles',
                    offers: {
                        '@type': 'AggregateOffer',
                        lowPrice: 10,
                        highPrice: 500,
                        priceCurrency: 'PLN'
                    }
                },
                { meta: { 'og:title': ['Kettles - Shop'] } }
            )
        );

        assert.equal(product.source, 'og');
        assert.equal(product.price, null);
    });

    it('uses the lowest variant price when no variant matches the page', () => {
        const product = requireProduct(
            extractFromJsonLd({
                '@type': 'ProductGroup',
                name: 'Sneakers',
                url: SHOP_URL,
                hasVariant: [
                    {
                        '@type': 'Product',
                        offers: { price: 449, priceCurrency: 'PLN' }
                    },
                    {
                        '@type': 'Product',
                        offers: { price: 377, priceCurrency: 'PLN' }
                    }
                ]
            })
        );

        assert.equal(product.title, 'Sneakers');
        assert.equal(product.price, 377);
    });

    it('drops a node whose name shares no word with the page titles', () => {
        const product = extractFromJsonLd(
            {
                '@type': 'Product',
                name: 'Totally unrelated',
                offers: { price: 5 }
            },
            { titleTag: 'Kettle Bronx KI513D10' }
        );

        assert.equal(product, null);
    });

    it('refuses to guess between several unmatched products', () => {
        const product = extractFromJsonLd([
            {
                '@type': 'Product',
                name: 'First',
                url: 'https://shop.example.com/a'
            },
            {
                '@type': 'Product',
                name: 'Second',
                url: 'https://shop.example.com/b'
            }
        ]);

        assert.equal(product, null);
    });

    it('recovers JSON-LD with raw control characters inside strings', () => {
        const product = requireProduct(
            extractProduct(
                emptySignals({
                    jsonLd: ['{"@type":"Product","name":"Line\none"}']
                }),
                SHOP_URL
            )
        );

        assert.equal(product.title, 'Line one');
    });

    it('keeps https images only, resolved against base href, deduplicated and capped', () => {
        const images = [
            'http://cdn.example.com/insecure.jpg',
            '//cdn.example.com/a.jpg',
            '//cdn.example.com/a.jpg',
            'b.jpg',
            ...Array.from({ length: 12 }, (_, index) => {
                return `https://cdn.example.com/${index}.jpg`;
            })
        ];
        const product = requireProduct(
            extractFromJsonLd(
                { '@type': 'Product', name: 'Kettle', image: images },
                { baseHref: '/media/' }
            )
        );

        assert.equal(product.images.length, 9);
        assert.deepEqual(product.images.slice(0, 2), [
            'https://cdn.example.com/a.jpg',
            'https://shop.example.com/media/b.jpg'
        ]);
    });
});

describe('extractProduct fallbacks and helpers', () => {
    it('fills the price from og product tags when JSON-LD has none', () => {
        const product = requireProduct(
            extractFromJsonLd(
                { '@type': 'Product', name: 'Kettle' },
                {
                    meta: {
                        'product:price:amount': ['49.99'],
                        'product:price:currency': ['GBP']
                    }
                }
            )
        );

        assert.equal(product.source, 'jsonld');
        assert.equal(product.price, 50);
        assert.equal(product.currency, 'GBP');
    });

    it('uses twitter images only when og images are missing', () => {
        const product = requireProduct(
            extractProduct(
                emptySignals({
                    meta: {
                        'og:title': ['Kettle'],
                        'twitter:image': ['https://cdn.example.com/t.jpg']
                    }
                }),
                SHOP_URL
            )
        );

        assert.deepEqual(product.images, ['https://cdn.example.com/t.jpg']);
    });

    it('does not use a bare <title> as a product title', () => {
        const product = extractProduct(
            emptySignals({ titleTag: 'Some page' }),
            SHOP_URL
        );

        assert.equal(product, null);
    });

    it('returns null for an unparseable final url', () => {
        assert.equal(extractProduct(emptySignals(), 'not a url'), null);
    });

    it('strips a site suffix only after the first segment', () => {
        assert.equal(
            stripSiteSuffix('Echo Dot | Charcoal : Amazon.de: Devices', [
                'amazon'
            ]),
            'Echo Dot | Charcoal'
        );
        assert.equal(
            stripSiteSuffix('Apple Watch - Apple', ['apple']),
            'Apple Watch'
        );
        assert.equal(
            stripSiteSuffix('Apple iPhone 15', ['apple']),
            'Apple iPhone 15'
        );
    });

    it('decodes named and numeric entities and leaves unknown ones', () => {
        assert.equal(
            decodeHtmlEntities('A &amp; B &#8211; C &#x20AC; &unknown;'),
            'A & B – C € &unknown;'
        );
    });
});
