import type { TranslationFunctions } from '../../i18n/i18n-types';
import {
    getAvailableLanguageCodes,
    getDefaultAppLocale,
    getTranslator,
    type AppLocale
} from '../i18n';

export const ADMIN_LOCALE: AppLocale = 'uk';

export const getMessages = (
    locale: AppLocale = getDefaultAppLocale()
): TranslationFunctions => {
    return getTranslator(locale);
};

export const getAdminMessages = () => {
    return getMessages(ADMIN_LOCALE);
};

export const getAllLocaleTexts = (
    select: (LL: TranslationFunctions) => string
) => {
    return getAvailableLanguageCodes().map(locale => {
        return select(getMessages(locale));
    });
};
