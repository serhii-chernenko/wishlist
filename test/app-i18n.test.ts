import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from 'typesafe-i18n';

import { getAppMessages } from '../src/api/dto';
import { getTranslator } from '../src/bot/i18n';
import type { TranslationFunctions } from '../src/i18n/i18n-types';
import en from '../src/i18n/en';
import pl from '../src/i18n/pl';
import uk from '../src/i18n/uk';

type Tree = { [key: string]: string | Tree };

const LOCALES = ['uk', 'en', 'pl'] as const;

const flatten = (tree: Tree, prefix: string): [string, string][] => {
    return Object.entries(tree).flatMap(([key, value]) => {
        const path = `${prefix}.${key}`;

        return typeof value === 'string'
            ? [[path, value] as [string, string]]
            : flatten(value, path);
    });
};

const appTrees = {
    uk: (uk as unknown as Tree).app as Tree,
    en: (en as unknown as Tree).app as Tree,
    pl: (pl as unknown as Tree).app as Tree
};

test('the app dictionary is plain text in every locale', () => {
    for (const locale of LOCALES) {
        const entries = flatten(appTrees[locale], 'app');

        assert.ok(entries.length > 300, locale);

        for (const [key, text] of entries) {
            const label = `${locale}:${key}`;

            assert.doesNotMatch(text, /<\/?[a-z][^>]*>/i, label);
            assert.doesNotMatch(text, /\n/, label);
            assert.doesNotMatch(text, /→|·/, label);
            assert.equal(text, text.trim(), label);
        }
    }
});

test('the app dictionary covers every API error and field error code', async () => {
    const { API_ERROR_CODES, FIELD_ERROR_CODES } =
        await import('../src/shared/app-api');

    for (const locale of LOCALES) {
        const messages = getAppMessages(locale);

        for (const code of API_ERROR_CODES) {
            assert.ok(messages.errors[code], `${locale}:errors.${code}`);
        }

        for (const code of FIELD_ERROR_CODES) {
            assert.ok(
                messages.fieldErrors[code],
                `${locale}:fieldErrors.${code}`
            );
        }
    }
});

const pluralExpectations = {
    uk: {
        wishes: [
            '1 бажання',
            '2 бажання',
            '5 бажань',
            '21 бажання',
            '22 бажання'
        ],
        gives: [
            '1 подарунок',
            '2 подарунки',
            '5 подарунків',
            '21 подарунок',
            '22 подарунки'
        ],
        seconds: [
            '1 секунду',
            '2 секунди',
            '5 секунд',
            '21 секунду',
            '22 секунди'
        ]
    },
    en: {
        wishes: ['1 wish', '2 wishes', '5 wishes', '21 wishes', '22 wishes'],
        gives: ['1 gift', '2 gifts', '5 gifts', '21 gifts', '22 gifts'],
        seconds: [
            '1 second',
            '2 seconds',
            '5 seconds',
            '21 seconds',
            '22 seconds'
        ]
    },
    pl: {
        wishes: [
            '1 życzenie',
            '2 życzenia',
            '5 życzeń',
            '21 życzeń',
            '22 życzenia'
        ],
        gives: [
            '1 prezent',
            '2 prezenty',
            '5 prezentów',
            '21 prezentów',
            '22 prezenty'
        ],
        seconds: [
            '1 sekundę',
            '2 sekundy',
            '5 sekund',
            '21 sekund',
            '22 sekundy'
        ]
    }
} as const;

const COUNTS = [1, 2, 5, 21, 22];

test('app counts use the right plural forms through the raw dictionary', () => {
    for (const locale of LOCALES) {
        const LL = i18nObject(locale, {
            app: getAppMessages(locale)
        } as unknown as Parameters<typeof i18nObject>[1]) as unknown as Pick<
            TranslationFunctions,
            'app'
        >;
        const expected = pluralExpectations[locale];

        assert.deepEqual(
            COUNTS.map(count => LL.app.wishes.count({ count })),
            [...expected.wishes],
            locale
        );
        assert.deepEqual(
            COUNTS.map(count => LL.app.gives.count({ count })),
            [...expected.gives],
            locale
        );
        assert.deepEqual(
            COUNTS.map(count => {
                return LL.app.errors.rateLimited({ seconds: count });
            }).map(text => {
                return text.match(/\d+ \S+?(?=\.)/)?.[0];
            }),
            [...expected.seconds],
            locale
        );
        assert.equal(
            LL.app.wishes.count({ count: 3 }),
            getTranslator(locale).app.wishes.count({ count: 3 })
        );
    }
});

test('chat-side Mini App keys exist in every locale', () => {
    for (const locale of LOCALES) {
        const LL = getTranslator(locale);

        assert.ok(LL.actions.openApp().length > 0);
        assert.ok(LL.appEntry.text().length > 0);
        assert.ok(LL.commands.app().length > 0);
        assert.ok(LL.auth.success.app().length > 0);
        assert.ok(LL.web.footer.openInApp().length > 0);
        assert.match(LL.web.wish.photo({ index: 2, total: 5 }), /2.*5/);
        assert.match(
            LL.feedback.fromApp('Alice', 'Hello'),
            /Alice[\s\S]*Hello/
        );
    }
});
