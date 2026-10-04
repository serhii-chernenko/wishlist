import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getTranslator } from '../src/bot/i18n';
import type { PublicShareFingerprint } from '../src/db/repositories';
import { FALLBACK_RATES, getDefaultCurrency } from '../src/shared/money';
import {
    isDeliveryHintShown,
    resolvePublicPayments
} from '../src/web/share/fingerprint';
import { renderSharePage } from '../src/web/share/render';
import type { SharePageModel } from '../src/web/share/view-model';

const PUBLIC_ID = '01m3yjg16thmzah2dprymwajwj';
const APP_LINK = `https://t.me/wishlist_ua_bot?startapp=s_${PUBLIC_ID}`;
const PAYMENTS = 'Monobank jar 4441';

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
        visibleCount: 0,
        lastUpdatedAt: null,
        wishes: [],
        indexable: false,
        botUrl: 'https://t.me/wishlist_ua_bot',
        githubUrl: 'https://github.com/serhii-chernenko/wishlist',
        supportLinks: [],
        ...overrides
    };
};

const countOccurrences = (html: string, needle: string) => {
    return html.split(needle).length - 1;
};

describe('share page delivery hint', () => {
    for (const language of ['uk', 'en', 'pl'] as const) {
        it(`adds the Telegram hint inside the payments envelope (${language})`, () => {
            const LL = getTranslator(language);
            const html = renderSharePage(
                buildModel({
                    language,
                    payments: PAYMENTS,
                    deliveryHintShown: true
                })
            );
            const envelope = html.slice(
                html.indexOf('<section class="envelope">'),
                html.indexOf('</section>')
            );

            assert.match(envelope, new RegExp(PAYMENTS));
            assert.ok(envelope.includes(LL.web.delivery.inTelegram()));
            assert.ok(envelope.includes(`href="${APP_LINK}"`));
            assert.ok(envelope.includes(LL.web.delivery.cta()));
        });
    }

    it('shows the hint on its own when payments are hidden', () => {
        const LL = getTranslator('en');
        const html = renderSharePage(buildModel({ deliveryHintShown: true }));

        assert.doesNotMatch(html, /class="envelope"/);
        assert.ok(html.includes(LL.web.delivery.inTelegram()));
        assert.equal(countOccurrences(html, `href="${APP_LINK}"`), 1);
    });

    it('leaves the hint out when no delivery detail is visible', () => {
        const LL = getTranslator('en');
        const withPayments = renderSharePage(
            buildModel({ payments: PAYMENTS })
        );
        const empty = renderSharePage(buildModel());

        assert.ok(!withPayments.includes(LL.web.delivery.inTelegram()));
        assert.ok(!empty.includes(LL.web.delivery.inTelegram()));
        assert.doesNotMatch(empty, /class="envelope"/);
    });

    it('drops the link but keeps the hint without a bot url', () => {
        const LL = getTranslator('en');
        const html = renderSharePage(
            buildModel({ deliveryHintShown: true, botUrl: '' })
        );

        assert.ok(html.includes(LL.web.delivery.inTelegram()));
        assert.doesNotMatch(html, /startapp=/);
    });
});

describe('share page disclosure inputs', () => {
    const share = (
        overrides: Partial<PublicShareFingerprint>
    ): PublicShareFingerprint => {
        return {
            publicId: PUBLIC_ID,
            displayName: 'Alice',
            revokedAt: null,
            shareUpdatedAt: new Date(0),
            showUsername: false,
            allowIndexing: true,
            userId: 1,
            username: null,
            usernameSearchable: false,
            payments: PAYMENTS,
            showPayments: true,
            showPhone: false,
            showAddress: false,
            hasPhone: true,
            hasDeliveryAddress: true,
            language: 'en',
            telegramLanguageCode: null,
            visibleCount: 1,
            lastUpdatedAt: null,
            showGifted: false,
            giftedCount: 0,
            giftedLastUpdatedAt: null,
            ...overrides
        };
    };

    it('serves payments only while they are shown', () => {
        assert.equal(resolvePublicPayments(share({})), PAYMENTS);
        assert.equal(
            resolvePublicPayments(share({ showPayments: false })),
            null
        );
    });

    it('derives the hint from a visible, stored phone only', () => {
        assert.equal(isDeliveryHintShown(share({ showPhone: true })), true);
        assert.equal(isDeliveryHintShown(share({})), false);
        assert.equal(
            isDeliveryHintShown(share({ showPhone: true, hasPhone: false })),
            false
        );
        assert.equal(
            isDeliveryHintShown(share({ showAddress: true, showPhone: false })),
            false
        );
    });
});
