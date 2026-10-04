import type { AppLanguageChoice, AppLocale } from '../../shared/app-api';

const LANGUAGE_ORDER_BY_LOCALE: Record<AppLocale, readonly AppLocale[]> = {
    uk: ['uk', 'en', 'pl'],
    en: ['en', 'uk', 'pl'],
    pl: ['pl', 'en', 'uk']
};

export const getLanguageChoices = (
    locale: AppLocale
): readonly AppLanguageChoice[] => {
    return [...LANGUAGE_ORDER_BY_LOCALE[locale], 'auto'];
};
