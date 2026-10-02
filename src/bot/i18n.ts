import { i18nObject } from '../i18n/i18n-util';
import { loadLocale } from '../i18n/i18n-util.sync';
import type { TranslationFunctions } from '../i18n/i18n-types';

export type AppLocale = 'uk' | 'en' | 'pl';

export type LanguageChoice = AppLocale | 'auto';

const defaultAppLocale: AppLocale = 'uk';
const availableLanguageCodes: readonly AppLocale[] = ['uk', 'en', 'pl'];
const languageAliases = new Map<string, LanguageChoice>([
    ['ua', 'uk'],
    ['uk', 'uk'],
    ['en', 'en'],
    ['pl', 'pl'],
    ['auto', 'auto']
]);
const translatorCache: Partial<Record<AppLocale, TranslationFunctions>> = {};

export const getDefaultAppLocale = (): AppLocale => {
    return defaultAppLocale;
};

export const getAvailableLanguageCodes = (): AppLocale[] => {
    return [...availableLanguageCodes];
};

export const normalizeLanguageInput = (
    value: string | undefined | null
): LanguageChoice | null => {
    if (!value) {
        return null;
    }

    return languageAliases.get(value.trim().toLowerCase()) ?? null;
};

export const resolveAppLocale = (
    stored: AppLocale | null | undefined,
    telegramLanguageCode: string | null | undefined
): AppLocale => {
    if (stored) {
        return stored;
    }

    const code = telegramLanguageCode?.trim().toLowerCase();

    if (!code) {
        return defaultAppLocale;
    }

    if (code.startsWith('uk')) {
        return 'uk';
    }

    if (code.startsWith('pl')) {
        return 'pl';
    }

    return 'en';
};

export const getTranslator = (
    locale: AppLocale = defaultAppLocale
): TranslationFunctions => {
    const cachedTranslator = translatorCache[locale];

    if (cachedTranslator) {
        return cachedTranslator;
    }

    loadLocale(locale);
    const translator = i18nObject(locale);

    translatorCache[locale] = translator;

    return translator;
};
