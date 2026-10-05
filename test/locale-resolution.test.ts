import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getAvailableLanguageCodes,
    getDefaultAppLocale,
    normalizeLanguageInput,
    resolveAppLocale
} from '../src/bot/i18n';
import { getStoredLanguageChoice } from '../src/bot/services/user-service';
import type { UserRecord } from '../src/bot/runtime/types';

test('resolveAppLocale truth table', () => {
    const cases: [Parameters<typeof resolveAppLocale>, string][] = [
        [[null, 'uk'], 'uk'],
        [[null, 'uk-UA'], 'uk'],
        [[null, 'pl'], 'pl'],
        [[null, 'pl-PL'], 'pl'],
        [[null, 'en'], 'en'],
        [[null, 'en-US'], 'en'],
        [[null, 'ru'], 'en'],
        [[null, 'de'], 'en'],
        [[null, ''], 'uk'],
        [[null, null], 'uk'],
        [[null, undefined], 'uk'],
        [['pl', 'uk'], 'pl'],
        [['en', null], 'en'],
        [['uk', 'pl'], 'uk']
    ];

    for (const [args, expected] of cases) {
        assert.equal(resolveAppLocale(...args), expected, JSON.stringify(args));
    }
});

test('language input accepts ua/uk/en/pl/auto only', () => {
    assert.equal(normalizeLanguageInput('ua'), 'uk');
    assert.equal(normalizeLanguageInput('UK'), 'uk');
    assert.equal(normalizeLanguageInput(' en '), 'en');
    assert.equal(normalizeLanguageInput('pl'), 'pl');
    assert.equal(normalizeLanguageInput('auto'), 'auto');
    assert.equal(normalizeLanguageInput('ru'), null);
    assert.equal(normalizeLanguageInput(''), null);
    assert.equal(normalizeLanguageInput(undefined), null);
});

test('defaults and available languages', () => {
    assert.equal(getDefaultAppLocale(), 'uk');
    assert.deepEqual(getAvailableLanguageCodes(), ['uk', 'en', 'pl']);
});

test('registered users use users.language, guests use sessions.language', () => {
    const autoUser = { language: null } as UserRecord;
    const polishUser = { language: 'pl' } as UserRecord;

    assert.equal(getStoredLanguageChoice(autoUser, 'en'), 'auto');
    assert.equal(getStoredLanguageChoice(polishUser, null), 'pl');
    assert.equal(getStoredLanguageChoice(null, 'en'), 'en');
    assert.equal(getStoredLanguageChoice(null, null), 'auto');
    assert.equal(
        resolveAppLocale(autoUser.language, 'pl-PL'),
        'pl',
        'Auto follows the Telegram language even when a guest choice exists'
    );
});
