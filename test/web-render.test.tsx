import assert from 'node:assert/strict';
import test from 'node:test';

import { renderErrorPage, renderSharePage } from '../src/web/share/render';
import { matchAcceptLanguage } from '../src/web/share/accept-language';
import {
    computeShareFingerprint,
    etagMatches,
    getDeployId,
    resolvePublicUsername
} from '../src/web/share/fingerprint';
import type { PublicShareFingerprint } from '../src/db/repositories';
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
        priority: false,
        createdAt: new Date('2026-01-02T10:00:00Z'),
        updatedAt: new Date('2026-01-02T10:00:00Z'),
        ...overrides
    };
};

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
        currency: 'UAH',
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

    assert.match(html, />View on shop\.test</);
    assert.doesNotMatch(html, />View on www\./);
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

    assert.doesNotMatch(html, /btn-secondary/);
    assert.doesNotMatch(html, /target="_blank"[^>]*>View on/);
    assert.doesNotMatch(html, /ftp:\/\//);
    assert.doesNotMatch(html, /javascript:/);
});

test('priority badge, price chip and dates follow the page language', () => {
    const html = renderSharePage(
        buildModel({
            language: 'uk',
            wishes: [
                buildWish({
                    priority: true,
                    price: 2500,
                    createdAt: new Date('2026-01-02T10:00:00Z'),
                    updatedAt: new Date('2026-02-03T10:00:00Z')
                })
            ]
        })
    );

    assert.match(
        html,
        /class="badge badge-primary h-auto py-1"><span aria-hidden="true">♥<\/span>Дуже хочу</
    );
    assert.match(html, /<article class="card border-2 border-primary/);
    assert.match(html, /Орієнтовна вартість: 2\s?500,00\s?₴/u);
    assert.match(html, /Створено 2 січня 2026/);
    assert.match(html, /Оновлено 3 лютого 2026/);
});

test('the updated date is hidden when it equals the created date', () => {
    const html = renderSharePage(buildModel());

    assert.match(html, /Created 2 January 2026/);
    assert.doesNotMatch(html, /Created 2 January 2026 · Updated/);
});

test('payments are shown once and cut to the payments cap', () => {
    const html = renderSharePage(buildModel({ payments: 'p'.repeat(1500) }));

    assert.match(html, /class="alert alert-info/);
    assert.equal(html.includes('p'.repeat(1000)), false);
    assert.equal(html.includes(`${'p'.repeat(999)}…`), true);
    assert.doesNotMatch(
        renderSharePage(buildModel({ payments: null })),
        /alert-info/
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

    for (const language of ['uk', 'en', 'pl']) {
        assert.match(
            html,
            new RegExp(
                `<link rel="alternate" hreflang="${language}" href="${base}/${language}/w/${PUBLIC_ID}"`
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
    assert.match(html, /<meta property="og:locale:alternate" content="en_GB"/);
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
        /<span class="btn btn-sm btn-primary join-item cursor-default" aria-current="page" lang="en">English<\/span>/
    );
    assert.match(
        html,
        new RegExp(
            `<a class="btn btn-sm join-item border-base-300" href="/uk/w/${PUBLIC_ID}" hreflang="uk" lang="uk">Українська</a>`
        )
    );
    assert.match(
        html,
        new RegExp(
            `<a class="btn btn-sm join-item border-base-300" href="/pl/w/${PUBLIC_ID}" hreflang="pl" lang="pl">Polski</a>`
        )
    );
    assert.doesNotMatch(
        html,
        new RegExp(`href="/en/w/${PUBLIC_ID}"[^>]*lang="en">English`)
    );
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

test('an empty list shows the empty state and a truncated list shows the notice', () => {
    const empty = renderSharePage(
        buildModel({ wishes: [], visibleCount: 0, indexable: false })
    );
    const truncated = renderSharePage(buildModel({ visibleCount: 250 }));

    assert.match(empty, /card-dash[^>]*>Nothing here yet/);
    assert.doesNotMatch(empty, /Showing the first/);
    assert.match(
        truncated,
        /<p class="alert[^>]*>Showing the first 100 wishes/
    );
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
});

test('twenty maximum size wishes stay below 60 KB', () => {
    const wishes = Array.from({ length: 20 }, (_, index) => {
        return buildWish({
            title: `${index} ${'т'.repeat(197)}`,
            description: 'о'.repeat(500),
            link: `https://shop.test/items/${'p'.repeat(200)}${index}`,
            price: 1000 + index,
            priority: index % 2 === 0
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
        />This wish list is no longer shared<\/h1>/
    );
    assert.match(
        renderErrorPage('en', 'notFound', 'https://t.me/x', 'v'),
        />Page not found<\/h1>/
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

const baseFingerprintInput: PublicShareFingerprint = {
    publicId: PUBLIC_ID,
    displayName: 'Alice',
    revokedAt: null,
    shareUpdatedAt: new Date(1_000),
    showUsername: true,
    userId: 1,
    username: 'alice',
    usernameSearchable: true,
    payments: 'pay',
    currency: 'UAH',
    language: 'uk',
    telegramLanguageCode: 'uk',
    visibleCount: 3,
    lastUpdatedAt: new Date(2_000)
};

test('the fingerprint changes for every input that affects the page', async () => {
    const baseline = await computeShareFingerprint(
        'deploy',
        'uk',
        baseFingerprintInput
    );
    const variations: [string, () => Promise<string>][] = [
        [
            'deploy',
            () => {
                return computeShareFingerprint(
                    'other',
                    'uk',
                    baseFingerprintInput
                );
            }
        ],
        [
            'language',
            () => {
                return computeShareFingerprint(
                    'deploy',
                    'en',
                    baseFingerprintInput
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
                ['currency', { currency: 'EUR' }],
                ['visibleCount', { visibleCount: 4 }],
                ['lastUpdatedAt', { lastUpdatedAt: new Date(2_001) }]
            ] as [string, Partial<PublicShareFingerprint>][]
        ).map(([name, patch]): [string, () => Promise<string>] => {
            return [
                name,
                () => {
                    return computeShareFingerprint('deploy', 'uk', {
                        ...baseFingerprintInput,
                        ...patch
                    });
                }
            ];
        })
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
    const first = await computeShareFingerprint('d', 'uk', hiddenUsername);
    const second = await computeShareFingerprint('d', 'uk', {
        ...hiddenUsername,
        username: 'renamed',
        displayName: 'Other',
        language: 'pl',
        userId: 99
    });

    assert.equal(first, second);
});

test('the fingerprint ignores the username while the owner has not enabled it', async () => {
    const notEnabled = { ...baseFingerprintInput, showUsername: false };
    const first = await computeShareFingerprint('d', 'uk', notEnabled);
    const second = await computeShareFingerprint('d', 'uk', {
        ...notEnabled,
        username: 'renamed'
    });

    assert.equal(first, second);
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
