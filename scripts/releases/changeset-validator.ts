import {
    releaseGroupOrder,
    TRANSLATION_LOCALES,
    type TranslationLocale
} from '../../src/bot/content/release-format';

export const allowedReleaseGroups = new Set<string>(releaseGroupOrder);

const localeAlternation = TRANSLATION_LOCALES.join('|');
const bulletPattern = /^- \[(added|updated|fixed|removed|notes)\] .+$/;
const nestedTranslationPattern = new RegExp(
    `^\\s+- (${localeAlternation}): (.*)$`
);
const topLevelTranslationPattern = new RegExp(`^- (${localeAlternation}):`);
const malformedTranslationPattern = new RegExp(
    `^\\s+- (${localeAlternation}):`,
    'i'
);

export const validateChangesetBody = (fileName: string, body: string) => {
    if (!body.trim()) {
        throw new Error(`${fileName} must include at least one tagged bullet`);
    }

    let hasOpenBullet = false;
    let seenLocales = new Set<TranslationLocale>();

    const closeBullet = () => {
        const missing = TRANSLATION_LOCALES.filter(locale => {
            return !seenLocales.has(locale);
        });

        if (hasOpenBullet && missing.length > 0) {
            throw new Error(
                `${fileName} has a bullet without a translation for: ${missing.join(', ')}. Add '  - ${missing[0]}: ...' lines under every bullet.`
            );
        }
    };

    for (const line of body.split('\n')) {
        if (!line.trim()) {
            continue;
        }

        const bulletMatch = line.match(bulletPattern);

        if (bulletMatch) {
            const group = bulletMatch[1];

            if (!group || !allowedReleaseGroups.has(group)) {
                throw new Error(
                    `${fileName} uses unsupported release group ${group}`
                );
            }

            closeBullet();
            hasOpenBullet = true;
            seenLocales = new Set();
            continue;
        }

        if (topLevelTranslationPattern.test(line)) {
            throw new Error(
                `${fileName} has a translation line that is not nested under a tagged bullet. Indent it as '  - en: ...'.`
            );
        }

        if (malformedTranslationPattern.test(line)) {
            const translationMatch = line.match(nestedTranslationPattern);
            const locale = translationMatch?.[1] as
                | TranslationLocale
                | undefined;

            if (!locale || !translationMatch?.[2]?.trim()) {
                throw new Error(
                    `${fileName} has a translation line without text. Use '  - en: English text'.`
                );
            }

            if (!hasOpenBullet) {
                throw new Error(
                    `${fileName} has a translation line before any tagged bullet.`
                );
            }

            if (seenLocales.has(locale)) {
                throw new Error(
                    `${fileName} has more than one ${locale} line for a single bullet.`
                );
            }

            seenLocales.add(locale);
            continue;
        }

        if (hasOpenBullet) {
            continue;
        }

        throw new Error(
            `${fileName} has an invalid line. Use '- [added|updated|fixed|removed|notes] ...' bullets.`
        );
    }

    closeBullet();
};
