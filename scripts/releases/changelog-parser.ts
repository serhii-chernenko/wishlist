import {
    releaseGroupOrder,
    TRANSLATION_LOCALES,
    type ReleaseEntry,
    type ReleaseGroup,
    type ReleaseItem,
    type TranslationLocale
} from '../../src/bot/content/release-format';

export { releaseGroupOrder };
export type { ReleaseEntry, ReleaseGroup, ReleaseItem };

type PendingItem = {
    uk: string;
    translations: Partial<Record<TranslationLocale, string>>;
    target: 'uk' | TranslationLocale;
};

const releaseHeadingPattern = /^## (\d+\.\d+\.\d+)(?: - (.+))?$/;
const taggedItemPattern =
    /^\s*-\s+(?:[0-9a-f]{7,40}:\s+(?:-\s+)?)?\[(added|updated|fixed|removed|notes)\] (.+)$/;
const localeAlternation = TRANSLATION_LOCALES.join('|');
const translationLinePattern = new RegExp(
    `^\\s*-\\s+(${localeAlternation}): (.+)$`
);
const inlineTranslationSeparator = new RegExp(
    ` - (?=(?:${localeAlternation}): )`
);
const inlineTranslationPattern = new RegExp(`^(${localeAlternation}): (.*)$`);

const parseTaggedItemText = (text: string): PendingItem => {
    const [ukrainianText = '', ...inlineTranslations] = text.split(
        inlineTranslationSeparator
    );
    const item: PendingItem = {
        uk: ukrainianText,
        translations: {},
        target: 'uk'
    };

    for (const inlineTranslation of inlineTranslations) {
        const match = inlineTranslation.match(inlineTranslationPattern);
        const locale = match?.[1] as TranslationLocale | undefined;

        if (locale && item.translations[locale] === undefined) {
            item.translations[locale] = match?.[2] ?? '';
            item.target = locale;
        }
    }

    return item;
};

export const parseChangelog = (changelog: string) => {
    const releases: ReleaseEntry[] = [];
    let currentRelease: ReleaseEntry | null = null;
    let currentGroup: ReleaseGroup | null = null;
    let currentItem: PendingItem | null = null;

    const flushItem = () => {
        if (currentRelease && currentGroup && currentItem) {
            const item: ReleaseItem = { uk: currentItem.uk.trimEnd() };

            for (const locale of TRANSLATION_LOCALES) {
                const translation = currentItem.translations[locale];

                if (translation !== undefined) {
                    item[locale] = translation.trimEnd();
                }
            }

            const groups = currentRelease.groups;

            groups[currentGroup] = [...(groups[currentGroup] ?? []), item];
        }

        currentItem = null;
    };

    const flushRelease = () => {
        flushItem();

        if (!currentRelease) {
            return;
        }

        const release: ReleaseEntry = currentRelease;
        const orderedGroups = releaseGroupOrder.reduce<ReleaseEntry['groups']>(
            (accumulator, group) => {
                const items = release.groups[group];

                if (items?.length) {
                    accumulator[group] = items;
                }

                return accumulator;
            },
            {}
        );

        releases.push({
            version: release.version,
            date: release.date,
            groups: orderedGroups
        });
        currentRelease = null;
        currentGroup = null;
    };

    for (const line of changelog.split('\n')) {
        const releaseHeading = line.match(releaseHeadingPattern);

        if (releaseHeading) {
            flushRelease();

            const version = releaseHeading[1];
            const date = releaseHeading[2];

            if (!version || !date) {
                throw new Error(
                    `Missing release date for version ${version} in CHANGELOG.md`
                );
            }

            currentRelease = { version, date, groups: {} };
            continue;
        }

        if (!currentRelease) {
            continue;
        }

        const taggedItem = line.match(taggedItemPattern);

        if (taggedItem) {
            flushItem();
            currentGroup = taggedItem[1] as ReleaseGroup;
            currentItem = parseTaggedItemText(taggedItem[2] ?? '');
            continue;
        }

        if (line.startsWith('## ')) {
            flushRelease();
            continue;
        }

        if (line.startsWith('### ')) {
            continue;
        }

        if (currentItem === null) {
            continue;
        }

        const translationLine = line.match(translationLinePattern);
        const translationLocale = translationLine?.[1] as
            | TranslationLocale
            | undefined;

        if (
            translationLocale &&
            currentItem.translations[translationLocale] === undefined
        ) {
            currentItem.translations[translationLocale] =
                translationLine?.[2] ?? '';
            currentItem.target = translationLocale;
            continue;
        }

        if (currentItem.target === 'uk') {
            currentItem.uk = `${currentItem.uk}\n${line.replace(/^ {1,4}/, '')}`;
            continue;
        }

        const previous = currentItem.translations[currentItem.target] ?? '';

        currentItem.translations[currentItem.target] =
            `${previous}\n${line.replace(/^ {1,6}/, '')}`;
    }

    flushRelease();

    return releases;
};
