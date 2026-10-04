import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShareImagePath } from '../src/web/image-proxy/share-photos';
import { renderErrorPage, renderSharePage } from '../src/web/share/render';
import { matchAcceptLanguage } from '../src/web/share/accept-language';
import {
    computeShareFingerprint as computeFingerprint,
    etagMatches,
    getDeployId,
    resolvePublicPayments,
    resolvePublicUsername,
    variantFingerprint,
    type ShareFingerprintInput
} from '../src/web/share/fingerprint';
import type { PublicShareFingerprint } from '../src/db/repositories';
import { APP_THIRD_PARTY_GIFTED_LIMIT } from '../src/shared/app-api';
import { FALLBACK_RATES, getDefaultCurrency } from '../src/shared/money';
import type {
    SharePageModel,
    ShareWishView
} from '../src/web/share/view-model';

const PUBLIC_ID = '01m3yjg16thmzah2dprymwajwj';
const OWNER_LINK_REL = 'rel="nofollow ugc noopener noreferrer"';

const buildWish = (overrides: Partial<ShareWishView> = {}): ShareWishView => {
    return {
        title: 'Coffee machine',
        description: null,
        link: null,
        price: 0,
        currency: 'UAH',
        priority: 'none',
        createdAt: new Date('2026-01-02T10:00:00Z'),
        updatedAt: new Date('2026-01-02T10:00:00Z'),
        ...overrides
    };
};

const buildModel = (
    overrides: Partial<SharePageModel> = {}
): SharePageModel => {
    const language = overrides.language ?? 'en';

    return {
        language,
        publicId: PUBLIC_ID,
        origin: 'https://wishlist.chernenko.dev',
        assetVersion: 'deploy-1',
        displayName: 'Alice',
        username: null,
        payments: null,
        displayCurrency: getDefaultCurrency(language),
        currencyChoice: 'auto',
        deliveryHintShown: false,
        rates: FALLBACK_RATES,
        visibleCount: 1,
        lastUpdatedAt: new Date('2026-02-03T10:00:00Z'),
        wishes: [buildWish()],
        indexable: true,
        botUrl: 'https://t.me/wishlist_ua_bot',
        githubUrl: 'https://github.com/serhii-chernenko/wishlist',
        supportLinks: [
            { id: 'kofi', title: 'Ko-fi', url: 'https://ko-fi.com/example' }
        ],
        ...overrides
    };
};

test('user text is escaped and never produces a script tag', () => {
    const html = renderSharePage(
        buildModel({
            displayName: '<script>alert(1)</script>',
            payments: '<img src=x onerror=alert(1)> *bold*',
            wishes: [
                buildWish({
                    title: '<script>alert("title")</script>',
                    description: '<b>not bold</b> & <i>x</i>'
                })
            ]
        })
    );

    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /<b>not bold/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(
        html,
        /&lt;b&gt;not bold&lt;\/b&gt; &amp; &lt;i&gt;x&lt;\/i&gt;/
    );
    assert.match(html, /<strong>bold<\/strong>/);
    assert.doesNotMatch(html, /javascript:/i);
});

test('attribute values cannot break out of the href', () => {
    const html = renderSharePage(
        buildModel({
            wishes: [
                buildWish({
                    link: 'https://x.test/a"onmouseover="alert(1)',
                    description: 'see https://y.test/b"c'
                })
            ]
        })
    );

    assert.doesNotMatch(html, /href="https:\/\/x\.test\/a"/);
    assert.match(
        html,
        /href="https:\/\/x\.test\/a&quot;onmouseover=&quot;alert\(1\)"/
    );
    assert.doesNotMatch(html, /href="https:\/\/y\.test\/b"/);
});

test('every owner supplied link opens safely in a new tab', () => {
    const html = renderSharePage(
        buildModel({
            payments: 'Pay https://pay.test/me or www.bank.test/jar',
            wishes: [
                buildWish({
                    link: 'https://www.shop.test/item?id=1',
                    description: 'Details at https://docs.test/page.'
                })
            ]
        })
    );
    const ownerAnchors = html.match(/<a [^>]*>/g)?.filter(anchor => {
        return /pay\.test|bank\.test|shop\.test|docs\.test/.test(anchor);
    });

    assert.equal(ownerAnchors?.length, 4);

    for (const anchor of ownerAnchors ?? []) {
        assert.match(anchor, new RegExp(OWNER_LINK_REL));
        assert.match(anchor, /target="_blank"/);
    }

    assert.match(html, />Open on shop\.test</);
    assert.doesNotMatch(html, />Open on www\./);
});

test('wishes without a renderable link get no link button', () => {
    const html = renderSharePage(
        buildModel({
            wishes: [
                buildWish({ link: 'ftp://shop.test/file' }),
                buildWish({ link: 'https://shop.test/a b' }),
                buildWish({ link: 'javascript:alert(1)' })
            ]
        })
    );

    assert.doesNotMatch(html, /wish-link/);
    assert.doesNotMatch(html, /target="_blank"[^>]*>Open on/);
    assert.doesNotMatch(html, /ftp:\/\//);
    assert.doesNotMatch(html, /javascript:/);
});

test('priority sticker, price chip and dates follow the page language', () => {
    const html = renderSharePage(
        buildModel({
            language: 'uk',
            wishes: [
                buildWish({
                    priority: 'high',
                    price: 2500,
                    createdAt: new Date('2026-01-02T10:00:00Z'),
                    updatedAt: new Date('2026-02-03T10:00:00Z')
                })
            ]
        })
    );

    assert.match(
        html,
        /<li class="wish"><svg class="wish-heart"[^>]*aria-hidden="true">/
    );
    assert.match(html, /<p class="sr-only">Дуже хоче<\/p>/);
    assert.match(
        html,
        /<p class="price"><span class="sr-only">Орієнтовна вартість: <\/span>2\s?500\s?₴<\/p>/u
    );
    assert.match(html, /Додано 2 січня 2026 р\., оновлено 3 лютого 2026 р\./);
});

test('an English page converts hryvnia prices to approximate euros', () => {
    const html = renderSharePage(
        buildModel({ wishes: [buildWish({ price: 1000 })] })
    );

    assert.match(
        html,
        /<p class="price" title="₴1,000"><span class="sr-only">Approximate price: <\/span>≈ €20<span class="sr-only"> \(original price ₴1,000\)<\/span><\/p>/u
    );
    assert.doesNotMatch(html, /€1,000/);
    assert.match(
        html,
        /<p class="notice">Prices in other currencies are approximate, converted to EUR at the National Bank of Ukraine rate for October 5, 2026<\/p>/
    );
});

test('a Polish page converts to złoty and dates the note the Polish way', () => {
    const html = renderSharePage(
        buildModel({
            language: 'pl',
            wishes: [buildWish({ price: 1000 })]
        })
    );

    assert.match(html, />≈ 87\s?zł</u);
    assert.match(
        html,
        /według kursu Narodowego Banku Ukrainy z 5 października 2026/
    );
});

test('wish prices follow the wish currency and the display currency of the page', () => {
    const converted = renderSharePage(
        buildModel({
            wishes: [buildWish({ price: 100, currency: 'USD' })]
        })
    );
    const exact = renderSharePage(
        buildModel({
            wishes: [buildWish({ price: 100, currency: 'EUR' })]
        })
    );
    const chosen = renderSharePage(
        buildModel({
            displayCurrency: 'USD',
            wishes: [buildWish({ price: 100, currency: 'USD' })]
        })
    );

    assert.match(converted, /≈ €89/u);
    assert.match(converted, /original price \$100/u);
    assert.doesNotMatch(exact, /≈/);
    assert.doesNotMatch(chosen, /≈/);
    assert.doesNotMatch(chosen, /class="notice"/);
});

test('only the high priority shows the heart sticker', () => {
    for (const priority of ['none', 'low', 'medium'] as const) {
        assert.doesNotMatch(
            renderSharePage(buildModel({ wishes: [buildWish({ priority })] })),
            /wish-heart/,
            priority
        );
    }

    assert.match(
        renderSharePage(
            buildModel({ wishes: [buildWish({ priority: 'high' })] })
        ),
        /wish-heart/
    );
});

test('gifted wishes follow active ones as compact cards with the gifted band', () => {
    const html = renderSharePage(
        buildModel({
            language: 'uk',
            wishes: [buildWish({ title: 'Active kettle' })],
            gifted: [
                buildWish({
                    title: 'Gifted mug',
                    priority: 'high',
                    description: 'Gifted description',
                    link: 'https://shop.test/mug',
                    price: 300,
                    gifted: true
                })
            ]
        })
    );
    const giftedCard = html.slice(
        html.indexOf('<li class="wish wish-gifted">')
    );

    assert.ok(html.indexOf('Active kettle') < html.indexOf('Gifted mug'));
    assert.match(giftedCard, /<div class="wish-photo" data-band="Подароване">/);
    assert.match(giftedCard, /class="price"/);
    assert.doesNotMatch(giftedCard, /wish-heart|wish-link|wish-details/);
    assert.doesNotMatch(html, /Gifted description/);
    assert.doesNotMatch(renderSharePage(buildModel()), /data-band|wish-gifted/);
});

test('an empty active list still shows gifted wishes after the empty note', () => {
    const html = renderSharePage(
        buildModel({
            wishes: [],
            visibleCount: 0,
            gifted: [buildWish({ title: 'Old gift', gifted: true })]
        })
    );

    assert.ok(html.indexOf('class="empty"') < html.indexOf('Old gift'));
});

test('a Ukrainian page keeps exact hryvnia prices without the rates note', () => {
    const html = renderSharePage(
        buildModel({
            language: 'uk',
            wishes: [buildWish({ price: 1000 })]
        })
    );

    assert.doesNotMatch(html, /≈/);
    assert.doesNotMatch(html, /class="notice"/);
});

test('free wishes never show the rates note', () => {
    const html = renderSharePage(buildModel());

    assert.doesNotMatch(html, /class="notice"/);
});

test('regular wishes carry no priority sticker and free wishes no price chip', () => {
    const html = renderSharePage(buildModel());

    assert.match(html, /<li class="wish">/);
    assert.doesNotMatch(html, /wish-heart|class="price"/);
    assert.match(
        renderSharePage(buildModel({ wishes: [buildWish({ price: 99.5 })] })),
        /99\.50/
    );
});

test('the updated date is hidden when it equals the created date', () => {
    const html = renderSharePage(buildModel());

    assert.match(html, /<p class="wish-dates">Added January 2, 2026<\/p>/);
    assert.doesNotMatch(html, /updated January 2, 2026/);
});

test('wishes without photos show the heart placeholder instead of an image', () => {
    const html = renderSharePage(buildModel());

    assert.match(
        html,
        /<h2 class="wish-title">Coffee machine<\/h2><div class="wish-photo"><\/div>/
    );
    assert.doesNotMatch(html, /<img\b|wish-photo-count/);
});

test('the first photo is a lazy cover and the rest are counted on a badge', () => {
    const photos = ['a', 'b', 'c'].map((hash, index) => {
        return {
            url: `/img/s/${hash}`,
            alt: `Photo ${index + 1} of 3: "Coffee" <machine>`
        };
    });
    const html = renderSharePage(
        buildModel({
            wishes: [
                buildWish({ photos }),
                buildWish({ title: 'Single', photos: photos.slice(0, 1) })
            ]
        })
    );

    assert.equal(html.match(/<img\b/g)?.length, 2);
    assert.match(
        html,
        /<div class="wish-photo"><img src="\/img\/s\/a" alt="Photo 1 of 3: &quot;Coffee&quot; &lt;machine&gt;" loading="lazy"\/><span class="wish-photo-count" aria-hidden="true">\+2<\/span><\/div>/
    );
    assert.equal(html.match(/wish-photo-count/g)?.length, 1);
    assert.doesNotMatch(html, /\/img\/s\/[bc]|wish-photo-empty/);
});

test('description and dates fold into a localized details disclosure', () => {
    const labels = { uk: 'Детальніше', en: 'More details', pl: 'Szczegóły' };

    for (const [language, label] of Object.entries(labels)) {
        const html = renderSharePage(
            buildModel({
                language: language as keyof typeof labels,
                wishes: [buildWish({ description: 'Blue one' })]
            })
        );

        assert.match(
            html,
            new RegExp(
                `<details class="wish-details"><summary>${label}</summary><p class="wish-text">Blue one</p><p class="wish-dates">[^<]+</p></details>`
            )
        );
    }

    assert.match(
        renderSharePage(buildModel()),
        /<details class="wish-details"><summary>More details<\/summary><p class="wish-dates">/
    );
});

test('payments are shown once and cut to the payments cap', () => {
    const html = renderSharePage(buildModel({ payments: 'p'.repeat(1500) }));

    assert.match(html, /<section class="envelope">/);
    assert.match(
        html,
        /<h2 class="envelope-title">You can also give money<\/h2>/
    );
    assert.equal(html.includes('p'.repeat(1000)), false);
    assert.equal(html.includes(`${'p'.repeat(999)}…`), true);
    assert.doesNotMatch(
        renderSharePage(buildModel({ payments: null })),
        /class="envelope"/
    );
});

test('hreflang, canonical, open graph and twitter tags describe the page', () => {
    const html = renderSharePage(buildModel({ language: 'pl' }));
    const base = `https://wishlist.chernenko.dev`;

    assert.match(html, /<html lang="pl">/);
    assert.match(
        html,
        new RegExp(`<link rel="canonical" href="${base}/pl/w/${PUBLIC_ID}"`)
    );

    for (const [language, segment] of [
        ['uk', 'ua'],
        ['en', 'en'],
        ['pl', 'pl']
    ]) {
        assert.match(
            html,
            new RegExp(
                `<link rel="alternate" hreflang="${language}" href="${base}/${segment}/w/${PUBLIC_ID}"`
            )
        );
    }

    assert.match(
        html,
        new RegExp(
            `<link rel="alternate" hreflang="x-default" href="${base}/w/${PUBLIC_ID}"`
        )
    );
    assert.match(html, /<meta property="og:title" content="Lista życzeń/);
    assert.match(html, /<meta property="og:description" content="Alice: 1 /);
    assert.match(
        html,
        new RegExp(
            `<meta property="og:url" content="${base}/pl/w/${PUBLIC_ID}"`
        )
    );
    assert.match(
        html,
        new RegExp(`<meta property="og:image" content="${base}/og-image.png"`)
    );
    assert.match(html, /<meta property="og:locale" content="pl_PL"/);
    assert.match(html, /<meta property="og:locale:alternate" content="uk_UA"/);
    assert.match(html, /<meta property="og:locale:alternate" content="en_US"/);
    assert.match(
        html,
        /<meta name="twitter:card" content="summary_large_image"/
    );
    assert.match(html, /<meta name="twitter:image" content="/);
});

test('robots meta is index only for indexable pages', () => {
    assert.match(
        renderSharePage(buildModel()),
        /<meta name="robots" content="index, follow"/
    );
    assert.match(
        renderSharePage(buildModel({ indexable: false })),
        /<meta name="robots" content="noindex"/
    );
    assert.match(
        renderSharePage(
            buildModel({ wishes: [], visibleCount: 0, indexable: false })
        ),
        /<meta name="robots" content="noindex"/
    );
});

test('the language switcher links to the other languages and marks the current one', () => {
    const html = renderSharePage(buildModel({ language: 'en' }));

    assert.match(
        html,
        /<span aria-current="page" aria-label="English \(EN\)" lang="en">EN<\/span>/
    );
    assert.match(
        html,
        new RegExp(
            `<a href="/ua/w/${PUBLIC_ID}" hreflang="uk" lang="uk" aria-label="Українська \\(UA\\)">UA</a>`
        )
    );
    assert.match(
        html,
        new RegExp(
            `<a href="/pl/w/${PUBLIC_ID}" hreflang="pl" lang="pl" aria-label="Polski \\(PL\\)">PL</a>`
        )
    );
    assert.doesNotMatch(html, new RegExp(`href="/en/w/${PUBLIC_ID}"`));
});

test('the phone number, gives and hidden data never reach the page model', () => {
    const html = renderSharePage(buildModel({ username: 'alice_ua' }));

    assert.doesNotMatch(html, /phone|\+380|tel:/i);
    assert.match(html, /href="https:\/\/t\.me\/alice_ua"/);
    assert.match(html, /Telegram: @alice_ua|@alice_ua/);
});

test('an unsafe username is not turned into a link', () => {
    const html = renderSharePage(buildModel({ username: 'a"><script>' }));

    assert.doesNotMatch(html, /t\.me\/a/);
    assert.doesNotMatch(html, /<script/i);
});

test('the footer has the bot call to action, support links and the source link', () => {
    const html = renderSharePage(buildModel());

    assert.match(html, /href="https:\/\/t\.me\/wishlist_ua_bot"/);
    assert.match(html, /href="https:\/\/ko-fi\.com\/example"/);
    assert.match(
        html,
        /href="https:\/\/github\.com\/serhii-chernenko\/wishlist"/
    );
    assert.doesNotMatch(
        renderSharePage(buildModel({ supportLinks: [] })),
        /Support the author|ko-fi\.com/
    );
});

test('a non-empty list puts the Telegram app button with the share start parameter in the hero', () => {
    const html = renderSharePage(buildModel());
    const empty = renderSharePage(
        buildModel({ wishes: [], visibleCount: 0, indexable: false })
    );
    const hero = html.slice(
        html.indexOf('<header class="hero">'),
        html.indexOf('</header>')
    );
    const label = 'Open in Telegram and reserve a wish';

    assert.match(
        hero,
        new RegExp(
            `<a class="cta cta-text" href="https://t\\.me/wishlist_ua_bot\\?startapp=s_${PUBLIC_ID}"[^>]*>${label}</a>`
        )
    );
    assert.equal(html.split(label).length - 1, 1);
    assert.equal(html.split('startapp=').length - 1, 1);
    assert.doesNotMatch(empty, /startapp=/);
});

test('an empty list shows the empty state and a truncated list shows the notice', () => {
    const empty = renderSharePage(
        buildModel({ wishes: [], visibleCount: 0, indexable: false })
    );
    const truncated = renderSharePage(buildModel({ visibleCount: 250 }));

    assert.match(empty, /<p class="empty">Nothing here yet/);
    assert.doesNotMatch(empty, /Showing the first/);
    assert.match(truncated, /<p class="notice">Showing the first 100 wishes/);
    assert.doesNotMatch(truncated, /Nothing here yet/);
});

test('the page has a doctype, no scripts and no external resources', () => {
    const html = renderSharePage(buildModel({ payments: 'x' }));

    assert.ok(html.startsWith('<!DOCTYPE html><html lang="en">'));
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /<style/i);
    assert.deepEqual(html.match(/<link[^>]+rel="stylesheet"[^>]*>/g), [
        '<link rel="stylesheet" href="/styles/share.css?v=deploy-1"/>'
    ]);
    assert.doesNotMatch(html, /<(?:iframe|object|embed|form|img)\b/i);
    assert.deepEqual(html.match(/<link[^>]+rel="preload"[^>]*>/g), [
        '<link rel="preload" href="/fonts/unbounded-cyrillic-wght-normal.woff2?v=5.3.0" as="font" type="font/woff2" crossorigin="anonymous"/>'
    ]);
    assert.doesNotMatch(html, /\bstyle="/);
    const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), match => {
        return match[1];
    });

    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('wl-hero-heart'));
});

test('twenty maximum size wishes stay below 60 KB', () => {
    const wishes = Array.from({ length: 20 }, (_, index) => {
        return buildWish({
            title: `${index} ${'т'.repeat(197)}`,
            description: 'о'.repeat(500),
            link: `https://shop.test/items/${'p'.repeat(200)}${index}`,
            price: 1000 + index,
            priority: index % 2 === 0 ? 'high' : 'none'
        });
    });
    const html = renderSharePage(
        buildModel({
            language: 'uk',
            wishes,
            visibleCount: 20,
            payments: 'р'.repeat(1000)
        })
    );

    assert.ok(Buffer.byteLength(html) < 60_000, `${Buffer.byteLength(html)}`);

    const withPhotos = renderSharePage(
        buildModel({
            language: 'uk',
            wishes: wishes.map((wish, index) => {
                return {
                    ...wish,
                    photos: Array.from({ length: 9 }, (_, photo) => {
                        return {
                            url: buildShareImagePath(
                                PUBLIC_ID,
                                100_000 + index,
                                photo,
                                'f'.repeat(16)
                            ),
                            alt: `Фото ${photo + 1} з 9, ${index}`
                        };
                    })
                };
            }),
            visibleCount: 20,
            payments: 'р'.repeat(1000)
        })
    );

    assert.ok(
        Buffer.byteLength(withPhotos) < 60_000,
        `${Buffer.byteLength(withPhotos)}`
    );
});

test('the gifted section at its cap stays below 60 KB', () => {
    const gifted = Array.from(
        { length: APP_THIRD_PARTY_GIFTED_LIMIT },
        (_, index) => {
            return buildWish({
                title: `${index} ${'т'.repeat(197)}`,
                description: 'о'.repeat(500),
                link: `https://shop.test/items/${'p'.repeat(200)}${index}`,
                price: 1000 + index,
                gifted: true,
                photos: Array.from({ length: 9 }, (_, photo) => {
                    return {
                        url: buildShareImagePath(
                            PUBLIC_ID,
                            100_000 + index,
                            photo,
                            'f'.repeat(16)
                        ),
                        alt: `Фото ${photo + 1} з 9, ${index}`
                    };
                })
            });
        }
    );
    const html = renderSharePage(
        buildModel({
            language: 'uk',
            wishes: [],
            gifted,
            visibleCount: 0,
            payments: 'р'.repeat(1000)
        })
    );

    assert.ok(Buffer.byteLength(html) < 60_000, `${Buffer.byteLength(html)}`);
});

test('error pages are noindex, localized and carry no list data', () => {
    for (const kind of ['notFound', 'gone'] as const) {
        for (const language of ['uk', 'en', 'pl'] as const) {
            const html = renderErrorPage(
                language,
                kind,
                'https://t.me/wishlist_ua_bot',
                'deploy-1'
            );
            assert.match(
                html,
                /<link rel="stylesheet" href="\/styles\/share\.css\?v=deploy-1"/
            );

            assert.ok(html.startsWith('<!DOCTYPE html>'));
            assert.match(html, new RegExp(`<html lang="${language}">`));
            assert.match(html, /<meta name="robots" content="noindex"/);
            assert.doesNotMatch(html, /rel="canonical"|hreflang|og:/);
            assert.doesNotMatch(html, /<script/i);
            assert.match(html, /href="https:\/\/t\.me\/wishlist_ua_bot"/);
        }
    }

    assert.match(
        renderErrorPage('en', 'gone', 'https://t.me/x', 'v'),
        />This wish list is no longer shared<\/span><\/h1>/
    );
    assert.match(
        renderErrorPage('en', 'notFound', 'https://t.me/x', 'v'),
        />Page not found<\/span><\/h1>/
    );
});

test('Accept-Language matching honours quality values and ignores unsupported tags', () => {
    assert.equal(matchAcceptLanguage('pl-PL,pl;q=0.9,en;q=0.8'), 'pl');
    assert.equal(matchAcceptLanguage('de;q=0.9, en;q=0.5, uk;q=0.7'), 'uk');
    assert.equal(matchAcceptLanguage('en-US'), 'en');
    assert.equal(matchAcceptLanguage('UK'), 'uk');
    assert.equal(matchAcceptLanguage('de, fr;q=0.8'), null);
    assert.equal(matchAcceptLanguage('uk;q=0, en;q=0.1'), 'en');
    assert.equal(matchAcceptLanguage('*'), null);
    assert.equal(matchAcceptLanguage(''), null);
    assert.equal(matchAcceptLanguage(null), null);
    assert.equal(matchAcceptLanguage('uk;q=abc'), null);
    assert.equal(matchAcceptLanguage('en, uk'), 'en');
});

const baseDisplayInput: ShareFingerprintInput = {
    displayCurrency: 'UAH',
    showPayments: true,
    deliveryHintShown: false
};

const computeShareFingerprint = (
    deployId: string,
    language: Parameters<typeof computeFingerprint>[1],
    share: PublicShareFingerprint,
    rates: Parameters<typeof computeFingerprint>[3],
    input: ShareFingerprintInput = baseDisplayInput
) => {
    return computeFingerprint(deployId, language, share, rates, input);
};

const baseFingerprintInput: PublicShareFingerprint = {
    publicId: PUBLIC_ID,
    displayName: 'Alice',
    revokedAt: null,
    shareUpdatedAt: new Date(1_000),
    showUsername: true,
    allowIndexing: true,
    userId: 1,
    username: 'alice',
    usernameSearchable: true,
    payments: 'pay',
    showPayments: true,
    showPhone: false,
    showAddress: false,
    hasPhone: true,
    hasDeliveryAddress: true,
    language: 'uk',
    telegramLanguageCode: 'uk',
    visibleCount: 3,
    lastUpdatedAt: new Date(2_000),
    showGifted: true,
    giftedCount: 2,
    giftedLastUpdatedAt: new Date(1_500)
};

test('the fingerprint changes for every input that affects the page', async () => {
    const baseline = await computeShareFingerprint(
        'deploy',
        'uk',
        baseFingerprintInput,
        FALLBACK_RATES
    );
    const variations: [string, () => Promise<string>][] = [
        [
            'deploy',
            () => {
                return computeShareFingerprint(
                    'other',
                    'uk',
                    baseFingerprintInput,
                    FALLBACK_RATES
                );
            }
        ],
        [
            'language',
            () => {
                return computeShareFingerprint(
                    'deploy',
                    'en',
                    baseFingerprintInput,
                    FALLBACK_RATES
                );
            }
        ],
        ...(
            [
                ['publicId', { publicId: '0'.repeat(26) }],
                ['shareUpdatedAt', { shareUpdatedAt: new Date(1_001) }],
                ['username', { username: 'bob' }],
                ['showUsername', { showUsername: false }],
                ['payments', { payments: 'other' }],
                ['allowIndexing', { allowIndexing: false }],
                ['visibleCount', { visibleCount: 4 }],
                ['lastUpdatedAt', { lastUpdatedAt: new Date(2_001) }],
                ['showGifted', { showGifted: false }],
                ['giftedCount', { giftedCount: 1 }],
                [
                    'giftedLastUpdatedAt',
                    { giftedLastUpdatedAt: new Date(1_501) }
                ]
            ] as [string, Partial<PublicShareFingerprint>][]
        ).map(([name, patch]): [string, () => Promise<string>] => {
            return [
                name,
                () => {
                    return computeShareFingerprint(
                        'deploy',
                        'uk',
                        {
                            ...baseFingerprintInput,
                            ...patch
                        },
                        FALLBACK_RATES
                    );
                }
            ];
        }),
        [
            'display currency',
            () => {
                return computeShareFingerprint(
                    'deploy',
                    'uk',
                    baseFingerprintInput,
                    FALLBACK_RATES,
                    { ...baseDisplayInput, displayCurrency: 'EUR' }
                );
            }
        ],
        [
            'show payments',
            () => {
                return computeShareFingerprint(
                    'deploy',
                    'uk',
                    baseFingerprintInput,
                    FALLBACK_RATES,
                    { ...baseDisplayInput, showPayments: false }
                );
            }
        ],
        [
            'delivery hint',
            () => {
                return computeShareFingerprint(
                    'deploy',
                    'uk',
                    baseFingerprintInput,
                    FALLBACK_RATES,
                    { ...baseDisplayInput, deliveryHintShown: true }
                );
            }
        ],
        [
            'rates date',
            () => {
                return computeShareFingerprint(
                    'deploy',
                    'uk',
                    baseFingerprintInput,
                    {
                        ...FALLBACK_RATES,
                        date: '2026-10-06'
                    }
                );
            }
        ],
        [
            'rate value',
            () => {
                return computeShareFingerprint(
                    'deploy',
                    'uk',
                    baseFingerprintInput,
                    {
                        ...FALLBACK_RATES,
                        perUnit: { ...FALLBACK_RATES.perUnit, EUR: 51 }
                    }
                );
            }
        ]
    ];

    assert.match(baseline, /^[0-9a-f]{32}$/);

    for (const [name, compute] of variations) {
        assert.notEqual(await compute(), baseline, name);
    }
});

test('the fingerprint ignores a hidden username and unrelated fields', async () => {
    const hiddenUsername = {
        ...baseFingerprintInput,
        usernameSearchable: false
    };
    const first = await computeShareFingerprint(
        'd',
        'uk',
        hiddenUsername,
        FALLBACK_RATES
    );
    const second = await computeShareFingerprint(
        'd',
        'uk',
        {
            ...hiddenUsername,
            username: 'renamed',
            displayName: 'Other',
            language: 'pl',
            userId: 99
        },
        FALLBACK_RATES
    );

    assert.equal(first, second);
});

test('the fingerprint ignores the username while the owner has not enabled it', async () => {
    const notEnabled = { ...baseFingerprintInput, showUsername: false };
    const first = await computeShareFingerprint(
        'd',
        'uk',
        notEnabled,
        FALLBACK_RATES
    );
    const second = await computeShareFingerprint(
        'd',
        'uk',
        {
            ...notEnabled,
            username: 'renamed'
        },
        FALLBACK_RATES
    );

    assert.equal(first, second);
});

test('the fingerprint ignores payments the owner does not show', async () => {
    const hidden = { ...baseFingerprintInput, showPayments: false };
    const hiddenInput = { ...baseDisplayInput, showPayments: false };
    const first = await computeShareFingerprint(
        'd',
        'uk',
        hidden,
        FALLBACK_RATES,
        hiddenInput
    );
    const second = await computeShareFingerprint(
        'd',
        'uk',
        { ...hidden, payments: 'changed' },
        FALLBACK_RATES,
        hiddenInput
    );

    assert.equal(first, second);
});

test('payments are public only while the owner shows them', () => {
    const owner = { payments: 'pay', showPayments: true };

    assert.equal(resolvePublicPayments(owner), 'pay');
    assert.equal(
        resolvePublicPayments({ ...owner, showPayments: false }),
        null
    );
});

test('the variant fingerprint adds the theme and a chosen currency only', () => {
    assert.equal(variantFingerprint('abc', 'system', 'auto'), 'abc');
    assert.equal(variantFingerprint('abc', 'dark', 'auto'), 'abc-dark');
    assert.equal(variantFingerprint('abc', 'system', 'USD'), 'abc-usd');
    assert.equal(variantFingerprint('abc', 'light', 'PLN'), 'abc-light-pln');
});

test('the public username needs both the owner choice and searchability', () => {
    const owner = {
        username: 'alice',
        usernameSearchable: true,
        showUsername: true
    };

    assert.equal(resolvePublicUsername(owner), 'alice');
    assert.equal(
        resolvePublicUsername({ ...owner, showUsername: false }),
        null
    );
    assert.equal(
        resolvePublicUsername({ ...owner, usernameSearchable: false }),
        null
    );
    assert.equal(resolvePublicUsername({ ...owner, username: null }), null);
});

test('etagMatches understands strong, weak, list and wildcard validators', () => {
    assert.equal(etagMatches('"abc"', 'abc'), true);
    assert.equal(etagMatches('W/"abc"', 'abc'), true);
    assert.equal(etagMatches('"x", "abc"', 'abc'), true);
    assert.equal(etagMatches('*', 'abc'), true);
    assert.equal(etagMatches('"abd"', 'abc'), false);
    assert.equal(etagMatches(null, 'abc'), false);
    assert.equal(etagMatches('', 'abc'), false);
});

test('the deploy id falls back to dev when version metadata is missing', () => {
    assert.equal(getDeployId({}), 'dev');
    assert.equal(getDeployId({ CF_VERSION_METADATA: {} }), 'dev');
    assert.equal(
        getDeployId({
            CF_VERSION_METADATA: {
                id: 'abc-123',
                tag: '',
                timestamp: ''
            }
        }),
        'abc-123'
    );
});
