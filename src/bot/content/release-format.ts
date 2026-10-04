import { getTranslator, type AppLocale } from '../i18n';

export const releaseGroupOrder = [
    'added',
    'updated',
    'fixed',
    'removed',
    'notes'
] as const;

export type ReleaseGroup = (typeof releaseGroupOrder)[number];

export const TRANSLATION_LOCALES = ['en', 'pl'] as const;

export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

export type ReleaseItem = { uk: string } & Partial<
    Record<TranslationLocale, string>
>;

export type ReleaseEntry = {
    version: string;
    date: string;
    groups: Partial<Record<ReleaseGroup, ReleaseItem[]>>;
};

export const getReleaseLabels = (
    locale: AppLocale
): Record<ReleaseGroup, string> => {
    const { labels } = getTranslator(locale).releases;

    return {
        added: labels.added(),
        updated: labels.updated(),
        fixed: labels.fixed(),
        removed: labels.removed(),
        notes: labels.notes()
    };
};
