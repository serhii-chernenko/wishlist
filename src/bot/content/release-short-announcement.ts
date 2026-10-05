import shortAnnouncementConfig from '../../../releases.announcements.json';

import {
    getAvailableLanguageCodes,
    getDefaultAppLocale,
    type AppLocale
} from '../i18n';

export const SHORT_ANNOUNCEMENT_MAX_LENGTH = 1000;
export const TELEGRAM_CAPTION_LIMIT = 1024;

export type ShortAnnouncementEntry = Record<AppLocale, string>;

const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const tagPattern = /<(\/?)([a-z]+)>/gi;
const allowedTags: ReadonlySet<string> = new Set(['b', 'i']);
const entityPattern = /&(lt|gt|amp|quot);/g;
const entityCharacters: Record<string, string> = {
    lt: '<',
    gt: '>',
    amp: '&',
    quot: '"'
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const stripTags = (html: string) => {
    return html.replace(tagPattern, '');
};

export const measureCaptionLength = (html: string) => {
    return stripTags(html).replace(entityPattern, (_match, name: string) => {
        return entityCharacters[name] as string;
    }).length;
};

const findMarkupProblems = (html: string) => {
    const problems: string[] = [];
    const openTags: string[] = [];

    for (const [, closing, rawName] of html.matchAll(tagPattern)) {
        const name = (rawName as string).toLowerCase();

        if (!allowedTags.has(name)) {
            problems.push(`the <${name}> tag is not allowed`);
        } else if (!closing) {
            openTags.push(name);
        } else if (openTags.pop() !== name) {
            problems.push(`the </${name}> tag has no matching opening tag`);
        }
    }

    if (openTags.length > 0) {
        problems.push(`unclosed tags: ${openTags.join(', ')}`);
    }

    if (/[<>&]/.test(stripTags(html).replace(entityPattern, ''))) {
        problems.push('raw <, > or & must be written as an HTML entity');
    }

    return problems;
};

const findTextProblems = (text: unknown) => {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return ['the text must be a non-empty string'];
    }

    const length = measureCaptionLength(text);
    const lengthProblems =
        length > SHORT_ANNOUNCEMENT_MAX_LENGTH
            ? [
                  `the caption is ${length} characters, the limit is ${SHORT_ANNOUNCEMENT_MAX_LENGTH}`
              ]
            : [];

    return [...findMarkupProblems(text), ...lengthProblems];
};

const findEntryProblems = (entry: unknown) => {
    if (!isRecord(entry)) {
        return ['expected an object with one text per locale'];
    }

    const locales = getAvailableLanguageCodes();
    const unknownLocales = Object.keys(entry).filter(key => {
        return !locales.some(locale => locale === key);
    });

    return [
        ...unknownLocales.map(key => `unknown locale "${key}"`),
        ...locales.flatMap(locale => {
            return Object.hasOwn(entry, locale)
                ? findTextProblems(entry[locale]).map(problem => {
                      return `${locale}: ${problem}`;
                  })
                : [`${locale}: missing`];
        })
    ];
};

export const findShortAnnouncementProblems = (config: unknown) => {
    if (!isRecord(config)) {
        return ['The short announcement config must be a JSON object'];
    }

    return Object.entries(config).flatMap(([version, entry]) => {
        const versionProblems = releaseVersionPattern.test(version)
            ? []
            : ['the key must be a release version'];

        return [...versionProblems, ...findEntryProblems(entry)].map(
            problem => {
                return `${version}: ${problem}`;
            }
        );
    });
};

export const readShortAnnouncement = (
    config: unknown,
    releaseVersion: string,
    locale: AppLocale
): string | null => {
    if (!isRecord(config) || !Object.hasOwn(config, releaseVersion)) {
        return null;
    }

    const entry = config[releaseVersion];

    if (findEntryProblems(entry).length > 0) {
        return null;
    }

    const texts = entry as ShortAnnouncementEntry;

    return texts[locale] ?? texts[getDefaultAppLocale()];
};

export const getShortAnnouncement = (
    releaseVersion: string,
    locale: AppLocale
) => {
    return readShortAnnouncement(
        shortAnnouncementConfig,
        releaseVersion,
        locale
    );
};
