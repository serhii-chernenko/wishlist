import { i18nObject } from 'typesafe-i18n';

import type { TranslationFunctions } from '../../i18n/i18n-types';
import type { AppDictionary, AppLocale } from '../../shared/app-api';

export type AppTranslator = TranslationFunctions['app'];

type AppTranslationRoot = Pick<TranslationFunctions, 'app'>;

export const createTranslator = (
    locale: AppLocale,
    messages: AppDictionary
): AppTranslator => {
    const root = i18nObject(locale, { app: messages } as never, {}) as unknown;

    return (root as AppTranslationRoot).app;
};
