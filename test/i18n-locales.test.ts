import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getAvailableLanguageCodes,
    getDefaultAppLocale,
    getTranslator,
    normalizeLanguageInput,
    resolveAppLocale
} from '../src/bot/i18n';
import en from '../src/i18n/en';
import pl from '../src/i18n/pl';
import uk from '../src/i18n/uk';

type Tree = { [key: string]: string | Tree };

const locales: Record<string, Tree> = {
    uk: uk as unknown as Tree,
    en: en as unknown as Tree,
    pl: pl as unknown as Tree
};
const placeholderPattern = /\{([^{}:|]+)(?::[^{}]*)?\}/g;
const htmlTagPattern = /<\/?([a-z]+)>/g;

const flatten = (tree: Tree, prefix = ''): Map<string, string> => {
    const result = new Map<string, string>();

    for (const [key, value] of Object.entries(tree)) {
        const path = `${prefix}${key}`;

        if (typeof value === 'string') {
            result.set(path, value);
            continue;
        }

        for (const [nestedPath, nested] of flatten(value, `${path}.`)) {
            result.set(nestedPath, nested);
        }
    }

    return result;
};

const placeholders = (text: string) => {
    return [...text.matchAll(placeholderPattern)]
        .map(match => match[1])
        .sort()
        .join(',');
};

const flat = Object.fromEntries(
    Object.entries(locales).map(([locale, tree]) => [locale, flatten(tree)])
);
const ukrainian = flat.uk!;

test('every locale has the same key set as the base locale', () => {
    const baseKeys = [...ukrainian.keys()].sort();

    assert.ok(baseKeys.length > 150);

    for (const locale of ['en', 'pl']) {
        assert.deepEqual([...flat[locale]!.keys()].sort(), baseKeys, locale);
    }
});

test('every locale has the same placeholder signature per key', () => {
    for (const locale of ['en', 'pl']) {
        for (const [key, text] of ukrainian) {
            assert.equal(
                placeholders(flat[locale]!.get(key) ?? ''),
                placeholders(text),
                `${locale}:${key}`
            );
        }
    }
});

test('no locale has empty strings other than intentional ones', () => {
    for (const [locale, entries] of Object.entries(flat)) {
        for (const [key, text] of entries) {
            assert.ok(text.trim().length > 0, `${locale}:${key}`);
        }
    }
});

test('the language screen texts are identical in every locale', () => {
    const languageKeys = [
        'language.title',
        'language.description',
        'language.options.uk',
        'language.options.en',
        'language.options.pl',
        'language.options.auto'
    ];

    for (const key of languageKeys) {
        for (const locale of ['en', 'pl']) {
            assert.equal(
                flat[locale]!.get(key),
                ukrainian.get(key),
                `${locale}:${key}`
            );
        }
    }
});

test('the language screen mentions all three languages', () => {
    const description = ukrainian.get('language.description') ?? '';

    assert.match(description, /Змінити мову/);
    assert.match(description, /Change a language/);
    assert.match(description, /Zmień język/);
});

test('copy uses HTML markup only and no legacy markdown or timer fragments', () => {
    for (const [locale, entries] of Object.entries(flat)) {
        for (const [key, text] of entries) {
            const label = `${locale}:${key}`;

            assert.doesNotMatch(text, /\*/, label);
            assert.doesNotMatch(text, /%[a-z0-9]/i, label);
            assert.doesNotMatch(text, /^> /m, label);
            assert.doesNotMatch(text, /за мить|in a moment/i, label);

            const tags = [...text.matchAll(htmlTagPattern)].map(
                match => match[1]
            );

            for (const tag of new Set(tags)) {
                assert.ok(['b', 'i', 'blockquote'].includes(tag ?? ''), label);
                assert.equal(
                    text.split(`<${tag}>`).length,
                    text.split(`</${tag}>`).length,
                    label
                );
            }
        }
    }
});

test('the approved privacy copy mentions the three languages and Cloudflare', () => {
    const languages = ukrainian.get('privacy.description.languages') ?? '';
    const sensitive = ukrainian.get('privacy.description.sensitive') ?? '';

    assert.match(languages, /українськ.*англійськ.*польськ/s);
    assert.match(sensitive, /Cloudflare/);
    assert.doesNotMatch(sensitive, /приватному сервері/);
    assert.match(
        flat.en!.get('privacy.description.languages') ?? '',
        /Ukrainian, English and Polish/
    );
    assert.match(
        flat.en!.get('privacy.description.sensitive') ?? '',
        /Cloudflare/
    );
});

test('translators resolve for every locale and format placeholders', () => {
    for (const locale of getAvailableLanguageCodes()) {
        const LL = getTranslator(locale);

        assert.equal(getTranslator(locale), LL);
        assert.equal(LL.pagination.range('1', '10', '59').includes('59'), true);
        assert.match(
            LL.releases.announcement.title({ version: '2.0.0' }),
            /2\.0\.0/
        );
        assert.match(LL.wishlist.add.description('200'), /200/);
    }
});

test('available language codes and defaults', () => {
    assert.deepEqual(getAvailableLanguageCodes(), ['uk', 'en', 'pl']);
    assert.equal(getDefaultAppLocale(), 'uk');
});

test('language input is normalized to a locale or auto', () => {
    assert.equal(normalizeLanguageInput('ua'), 'uk');
    assert.equal(normalizeLanguageInput(' UK '), 'uk');
    assert.equal(normalizeLanguageInput('en'), 'en');
    assert.equal(normalizeLanguageInput('PL'), 'pl');
    assert.equal(normalizeLanguageInput('auto'), 'auto');
    assert.equal(normalizeLanguageInput('de'), null);
    assert.equal(normalizeLanguageInput('constructor'), null);
    assert.equal(normalizeLanguageInput(''), null);
    assert.equal(normalizeLanguageInput(null), null);
    assert.equal(normalizeLanguageInput(undefined), null);
});

test('the stored language wins and Telegram codes resolve the rest', () => {
    assert.equal(resolveAppLocale('pl', 'uk'), 'pl');
    assert.equal(resolveAppLocale('en', null), 'en');
    assert.equal(resolveAppLocale(null, 'uk'), 'uk');
    assert.equal(resolveAppLocale(null, 'uk-UA'), 'uk');
    assert.equal(resolveAppLocale(null, 'pl'), 'pl');
    assert.equal(resolveAppLocale(null, 'PL-pl'), 'pl');
    assert.equal(resolveAppLocale(null, 'en-GB'), 'en');
    assert.equal(resolveAppLocale(null, 'de'), 'en');
    assert.equal(resolveAppLocale(null, 'ru'), 'en');
    assert.equal(resolveAppLocale(null, ''), 'uk');
    assert.equal(resolveAppLocale(null, null), 'uk');
    assert.equal(resolveAppLocale(undefined, undefined), 'uk');
});
