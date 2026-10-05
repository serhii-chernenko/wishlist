import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
        giftedCount: 0,
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

test('priority badge, price chip and dates follow the page language', () => {
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

    assert.match(html, /<li class="wish"><article class="wish-tag">/);
    assert.match(
        html,
        /<p class="priority-badge" data-level="high">Високий<\/p>/
    );
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
        /<p class="price" title="₴1,000"><span class="sr-only">Estimated price: <\/span>≈ €20<span class="sr-only"> \(listed as ₴1,000\)<\/span><\/p>/u
    );
    assert.doesNotMatch(html, /€1,000/);
    assert.match(
        html,
        /<p class="notice">Prices are approximate, converted to EUR at the official daily rate as of October 4, 2026\.<\/p>/
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
        /według oficjalnego kursu dziennego z 4 października 2026\./
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
    assert.match(converted, /listed as \$100/u);
    assert.doesNotMatch(exact, /≈/);
    assert.doesNotMatch(chosen, /≈/);
    assert.doesNotMatch(chosen, /class="notice"/);
});

test('the badge is the only priority signal: low, medium and high get it, none and every level skip the heart sticker', () => {
    for (const priority of ['none', 'low', 'medium', 'high'] as const) {
        const html = renderSharePage(
            buildModel({ wishes: [buildWish({ priority })] })
        );

        assert.doesNotMatch(html, /wish-heart|wl-sticker/, priority);
        assert.equal(
            html.includes(`class="priority-badge" data-level="${priority}"`),
            priority !== 'none',
            priority
        );
    }
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
    assert.match(
        giftedCard,
        /<div class="wish-photo wish-photo-placeholder" data-band="Подароване">/
    );
    assert.match(giftedCard, /class="price"/);
    assert.doesNotMatch(giftedCard, /priority-badge|wish-link/);
    assert.match(
        giftedCard,
        /<details class="wish-details"><summary>Детальніше<\/summary><p class="wish-dates">Додано [^<]+<\/p><\/details>/
    );
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

test('regular wishes carry no priority badge and free wishes no price chip', () => {
    const html = renderSharePage(buildModel());

    assert.match(html, /<li class="wish">/);
    assert.doesNotMatch(html, /priority-badge|class="price"/);
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

test('wishes without photos show the gift logo placeholder instead of an image or a heart', () => {
    const html = renderSharePage(buildModel());

    assert.match(
        html,
        /<h2 class="wish-title">Coffee machine<\/h2><div class="wish-photo wish-photo-placeholder"><svg class="photo-placeholder" [^>]*aria-hidden="true"[^>]*><use href="#wl-photo-placeholder"><\/use><\/svg><\/div>/
    );
    assert.equal(html.split('id="wl-photo-placeholder"').length, 2);
    assert.doesNotMatch(html, /<img\b|carousel|wish-photo-pending/);
});

test('the placeholder logo is drawn once however many wishes lack photos', () => {
    const wishes = Array.from({ length: 5 }, (_, index) => {
        return buildWish({ title: `Wish ${index}` });
    });
    const html = renderSharePage(buildModel({ wishes, visibleCount: 5 }));

    assert.equal(html.split('id="wl-photo-placeholder"').length, 2);
    assert.equal(html.split('<use href="#wl-photo-placeholder">').length, 6);
});

test('a wish with all photos loaded carries no placeholder logo', () => {
    const html = renderSharePage(
        buildModel({
            wishes: [
                buildWish({
                    photos: [{ url: '/img/s/p0', alt: 'Photo 1 of 1' }]
                })
            ]
        })
    );

    assert.doesNotMatch(html, /wl-photo-placeholder|wish-photo-placeholder/);
});

test('a wish whose imported photo is still pending shows the placeholder with a loading note', () => {
    const html = renderSharePage(
        buildModel({ wishes: [buildWish({ photoPending: true })] })
    );

    assert.match(
        html,
        /<div class="wish-photo wish-photo-placeholder wish-photo-pending"><svg [^>]*><use href="#wl-photo-placeholder"><\/use><\/svg><span class="sr-only">Photo is loading<\/span><\/div>/
    );
    assert.doesNotMatch(
        renderSharePage(
            buildModel({
                language: 'uk',
                wishes: [buildWish({ photoPending: true })]
            })
        ),
        /Photo is loading/
    );
});

test('the header counts active and gifted wishes only when some are gifted', () => {
    const gifted = [buildWish({ title: 'Gifted mug', gifted: true })];
    const withGifted = renderSharePage(
        buildModel({ gifted, giftedCount: 1, visibleCount: 3 })
    );
    const withoutGifted = renderSharePage(buildModel({ visibleCount: 3 }));

    assert.match(
        withGifted,
        /<p class="hero-meta">Active: 3, gifted: 1, updated February 3, 2026<\/p>/
    );
    assert.match(
        withoutGifted,
        /<p class="hero-meta">3 wishes, updated February 3, 2026<\/p>/
    );
    assert.match(
        renderSharePage(
            buildModel({
                gifted,
                giftedCount: 1,
                visibleCount: 3,
                lastUpdatedAt: null
            })
        ),
        /<p class="hero-meta">Active: 3, gifted: 1<\/p>/
    );
});

test('the header gifted count is the real total even above the rendered cap', () => {
    const gifted = Array.from({ length: APP_THIRD_PARTY_GIFTED_LIMIT }, () => {
        return buildWish({ title: 'Gifted mug', gifted: true });
    });
    const totalGifted = APP_THIRD_PARTY_GIFTED_LIMIT + 15;
    const html = renderSharePage(
        buildModel({ gifted, giftedCount: totalGifted, visibleCount: 3 })
    );

    assert.match(html, new RegExp(`Active: 3, gifted: ${totalGifted},`));
});

test('with no active wishes the empty alert needs no gifted wishes either', () => {
    const gifted = [buildWish({ title: 'Gifted mug', gifted: true })];
    const empty = renderSharePage(buildModel({ wishes: [], visibleCount: 0 }));
    const onlyGifted = renderSharePage(
        buildModel({ wishes: [], gifted, giftedCount: 1, visibleCount: 0 })
    );

    assert.match(empty, /<p class="empty">/);
    assert.doesNotMatch(empty, /No active wishes right now/);
    assert.doesNotMatch(onlyGifted, /Nothing here yet/);
    assert.match(
        onlyGifted,
        /<p class="empty">No active wishes right now\. Below are the ones already gifted\.<\/p>/
    );
    assert.match(onlyGifted, /Gifted mug/);
});

const buildPhotos = (count: number, prefix = 'p') => {
    return Array.from({ length: count }, (_, index) => {
        return {
            url: `/img/s/${prefix}${index}`,
            alt: `Photo ${index + 1} of ${count}: "Coffee" <machine>`
        };
    });
};

const readImages = (html: string) => {
    return Array.from(html.matchAll(/<img\b[^>]*>/g), match => {
        return match[0];
    });
};

test('a wish with several photos renders a carousel with static dots and no count chip', () => {
    const html = renderSharePage(
        buildModel({
            wishes: [
                buildWish({ photos: buildPhotos(3) }),
                buildWish({ title: 'Single', photos: buildPhotos(1, 's') })
            ]
        })
    );

    assert.equal(
        html.match(
            /<div class="carousel wish-carousel" role="group" tabindex="0" aria-label="Photos, 3">/g
        )?.length,
        1
    );
    assert.equal(html.match(/<button popovertarget="v0">/g)?.length, 3);
    assert.match(
        html,
        /<img src="\/img\/s\/p0" alt="Photo 1 of 3: &quot;Coffee&quot; &lt;machine&gt;" loading="eager" decoding="async" fetchpriority="high"\/><\/button><button popovertarget="v0"><img src="\/img\/s\/p1"/
    );
    assert.equal(html.match(/<img\b/g)?.length, 4);
    assert.equal(
        html.match(
            /<div class="photo-dots" aria-hidden="true"><i class="photo-dot-active"><\/i><i><\/i><i><\/i><\/div>/g
        )?.length,
        1
    );
    assert.doesNotMatch(html, /data-count|\d+ photos<|<a\b[^>]*href="#/);
    assert.doesNotMatch(html, /\sonscroll=|wish-photo-empty/);
});

test('every photo opens the card viewer through a native popover that works without scripts', () => {
    const html = renderSharePage(
        buildModel({
            wishes: [
                buildWish({ photos: buildPhotos(2) }),
                buildWish({ title: 'Single', photos: buildPhotos(1, 's') }),
                buildWish({ title: 'No photo' })
            ]
        })
    );
    const stages = html.match(
        /<div id="v\d+" class="wish-stage" popover="auto">/g
    );

    assert.deepEqual(stages, [
        '<div id="v0" class="wish-stage" popover="auto">',
        '<div id="v1" class="wish-stage" popover="auto">'
    ]);
    assert.equal(
        html.match(
            /<button class="photo-viewer-close" popovertarget="v\d" popovertargetaction="hide" aria-label="Close">×<\/button>/g
        )?.length,
        2
    );
    assert.match(
        html,
        /<div class="wish-photo"><div id="v1" class="wish-stage" popover="auto"><button class="photo-viewer-close"[^>]*>.*?<\/button><button class="wish-zoom" popovertarget="v1"><img src="\/img\/s\/s0"/
    );
    assert.equal(html.match(/popovertarget="v2"/g), null);
});

test('the close button label is localized', () => {
    const labels = {
        uk: 'aria-label="Закрити"',
        en: 'aria-label="Close"',
        pl: 'aria-label="Zamknij"'
    };

    for (const [language, label] of Object.entries(labels)) {
        const html = renderSharePage(
            buildModel({
                language: language as SharePageModel['language'],
                wishes: [buildWish({ photos: buildPhotos(1) })]
            })
        );

        assert.ok(
            html.includes(`popovertargetaction="hide" ${label}`),
            language
        );
    }
});

test('a single photo has no dots, strip or count chip', () => {
    const html = renderSharePage(
        buildModel({
            wishes: [buildWish({ photos: buildPhotos(1) })]
        })
    );

    assert.match(
        html,
        /<button class="wish-zoom" popovertarget="v0"><img src="\/img\/s\/p0" alt="Photo 1 of 1: &quot;Coffee&quot; &lt;machine&gt;" loading="eager" decoding="async" fetchpriority="high"\/><\/button>/
    );
    assert.doesNotMatch(
        html,
        /class="[^"]*carousel|data-count|tabindex|photo-dots/
    );
});

test('the carousel script and its CSP allowance appear only when a wish has photos', () => {
    const withPhotos = renderSharePage(
        buildModel({ wishes: [buildWish({ photos: buildPhotos(2) })] })
    );
    const withoutPhotos = renderSharePage(
        buildModel({ wishes: [buildWish()] })
    );
    const gifted = renderSharePage(
        buildModel({
            wishes: [],
            gifted: [buildWish({ gifted: true, photos: buildPhotos(2) })]
        })
    );

    assert.deepEqual(withPhotos.match(/<script\b[^>]*>/g), [
        '<script src="/share/carousel.js?v=deploy-1" defer="">'
    ]);
    assert.equal(
        gifted.match(/<script src="\/share\/carousel\.js/g)?.length,
        1
    );
    assert.doesNotMatch(withoutPhotos, /<script/i);
    assert.doesNotMatch(withPhotos, /<script(?![^>]*\ssrc=)/i);
    assert.doesNotMatch(withPhotos, /\son[a-z]+=/i);
});

test('the carousel label is localized', () => {
    const labels = {
        uk: 'aria-label="Фото, 2"',
        en: 'aria-label="Photos, 2"',
        pl: 'aria-label="Zdjęcia, 2"'
    };

    for (const [language, label] of Object.entries(labels)) {
        const html = renderSharePage(
            buildModel({
                language: language as SharePageModel['language'],
                wishes: [buildWish({ photos: buildPhotos(2) })]
            })
        );

        assert.ok(html.includes(label), language);
    }
});

test('only the first photo of the first four cards is eager and only the very first is high priority', () => {
    const wishes = Array.from({ length: 6 }, (_, index) => {
        return buildWish({
            title: `Wish ${index}`,
            photos: buildPhotos(3, `w${index}-`)
        });
    });
    const images = readImages(
        renderSharePage(buildModel({ wishes, visibleCount: 6 }))
    );

    assert.equal(images.length, 18);

    images.forEach((image, position) => {
        const card = Math.floor(position / 3);
        const slide = position % 3;
        const eager = card < 4 && slide === 0;

        assert.match(image, /decoding="async"/);
        assert.match(
            image,
            eager ? /loading="eager"/ : /loading="lazy"/,
            `card ${card} slide ${slide}`
        );
        assert.equal(
            image.includes('fetchpriority="high"'),
            card === 0 && slide === 0,
            `card ${card} slide ${slide}`
        );
    });
});

test('gifted cards continue the card numbering after the open wishes', () => {
    const wishes = Array.from({ length: 4 }, (_, index) => {
        return buildWish({ photos: buildPhotos(1, `o${index}-`) });
    });
    const gifted = [
        buildWish({
            title: 'Gifted',
            gifted: true,
            photos: buildPhotos(2, 'g')
        })
    ];
    const images = readImages(
        renderSharePage(buildModel({ wishes, gifted, visibleCount: 4 }))
    );
    const giftedImages = images.filter(image => {
        return image.includes('/img/s/g');
    });

    assert.equal(giftedImages.length, 2);
    assert.ok(
        giftedImages.every(image => {
            return image.includes('loading="lazy"');
        })
    );
    assert.equal(
        images.filter(image => {
            return image.includes('loading="eager"');
        }).length,
        4
    );
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
        /<h2 class="envelope-title">Prefer to send money\?<\/h2>/
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
    assert.match(
        html,
        /<meta property="og:title" content="Alice – lista życzeń/
    );
    assert.match(
        html,
        /<meta property="og:description" content="Alice – lista życzeń, 1 /
    );
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

const STRESS_PRIORITIES = ['high', 'low', 'high', 'medium'] as const;
const MAX_RAW_SHARE_BYTES = 100_000;
const MAX_GZIP_SHARE_BYTES = 20_000;
const MAX_GZIP_SHARE_CAROUSEL_BYTES = 26_000;
const MAX_WISH_PHOTOS = 9;
const STRESS_ALPHABET = 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя ';

const createStressText = (seed: number) => {
    let state = seed;

    return (length: number) => {
        return Array.from({ length }, () => {
            state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;

            return STRESS_ALPHABET[state % STRESS_ALPHABET.length];
        }).join('');
    };
};

const assertShareBudget = (
    html: string,
    maxGzipBytes: number = MAX_GZIP_SHARE_BYTES
) => {
    const raw = Buffer.byteLength(html);
    const compressed = gzipSync(html).byteLength;

    assert.ok(raw < MAX_RAW_SHARE_BYTES, `raw ${raw}`);
    assert.ok(compressed < maxGzipBytes, `gzip ${compressed}`);
};

const buildImageHash = (wish: number, photo: number) => {
    return createHash('sha256')
        .update(`${wish}:${photo}`)
        .digest('hex')
        .slice(0, 16);
};

test('twenty maximum size wishes stay within the share page budget', () => {
    const stressText = createStressText(7);
    const wishes = Array.from({ length: 20 }, (_, index) => {
        return buildWish({
            title: `${index} ${stressText(197)}`,
            description: stressText(500),
            link: `https://shop.test/items/${stressText(200).replaceAll(' ', '-')}${index}`,
            price: 1000 + index,
            priority:
                STRESS_PRIORITIES[index % STRESS_PRIORITIES.length] ?? 'none'
        });
    });
    const html = renderSharePage(
        buildModel({
            language: 'uk',
            wishes,
            visibleCount: 20,
            payments: stressText(1000)
        })
    );

    assertShareBudget(html);

    const withPhotos = renderSharePage(
        buildModel({
            language: 'uk',
            wishes: wishes.map((wish, index) => {
                return {
                    ...wish,
                    photos: Array.from(
                        { length: MAX_WISH_PHOTOS },
                        (_, photo) => {
                            return {
                                url: buildShareImagePath(
                                    PUBLIC_ID,
                                    100_000 + index,
                                    photo,
                                    buildImageHash(index, photo)
                                ),
                                alt: `Фото ${photo + 1} з ${MAX_WISH_PHOTOS}`
                            };
                        }
                    )
                };
            }),
            visibleCount: 20,
            payments: stressText(1000)
        })
    );

    assertShareBudget(withPhotos, MAX_GZIP_SHARE_CAROUSEL_BYTES);
});

test('the gifted section at its cap stays within the share page budget', () => {
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

    assertShareBudget(html);
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
