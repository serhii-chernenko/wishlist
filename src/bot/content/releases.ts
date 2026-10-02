import releaseManifest from '../../../releases.generated.json';

import { getDefaultAppLocale, getTranslator, type AppLocale } from '../i18n';
import { escapeHtml } from '../utils/strings';
import {
    getReleaseLabels,
    releaseGroupOrder,
    type ReleaseEntry,
    type ReleaseGroup,
    type ReleaseItem
} from './release-format';

export { getReleaseLabels, releaseGroupOrder };
export type { ReleaseGroup, ReleaseItem };

export type ReleaseRecord = ReleaseEntry;

type RawReleaseItem = string | ReleaseItem;

type RawReleaseRecord = {
    version: string;
    date: string;
    groups: Partial<Record<ReleaseGroup, RawReleaseItem[]>>;
};

export const TELEGRAM_MESSAGE_LIMIT = 4096;

const TRUNCATION_MARK = '…';

const MINIMUM_TRUNCATED_LINE_LENGTH = 16;

const normalizeReleaseItem = (item: RawReleaseItem): ReleaseItem => {
    return typeof item === 'string' ? { uk: item } : item;
};

export const normalizeReleaseRecords = (
    records: RawReleaseRecord[]
): ReleaseRecord[] => {
    return records.map(record => {
        const groups: ReleaseRecord['groups'] = {};

        for (const group of releaseGroupOrder) {
            const items = record.groups[group];

            if (items?.length) {
                groups[group] = items.map(normalizeReleaseItem);
            }
        }

        return { version: record.version, date: record.date, groups };
    });
};

const releases = normalizeReleaseRecords(
    releaseManifest as unknown as RawReleaseRecord[]
);

export const getReleases = () => {
    return releases;
};

export const getLatestRelease = () => {
    return releases[0] ?? null;
};

export const getLatestReleaseVersion = () => {
    return releases[0]?.version ?? '0.0.0';
};

export const getReleaseItemText = (item: ReleaseItem, locale: AppLocale) => {
    if (locale === 'uk') {
        return item.uk;
    }

    return item[locale] || item.uk;
};

export const renderReleaseNotes = (
    limit = 0,
    locale: AppLocale = getDefaultAppLocale()
) => {
    const releaseEntries = limit <= 0 ? releases : releases.slice(0, limit);
    const labels = getReleaseLabels(locale);

    if (releaseEntries.length === 0) {
        return escapeHtml(getTranslator(locale).releases.empty());
    }

    return releaseEntries
        .map(release => {
            let result = `🎉 <b>${escapeHtml(release.version)} - ${escapeHtml(release.date)}</b>\n`;

            for (const group of releaseGroupOrder) {
                const features = release.groups[group];

                if (!features?.length) {
                    continue;
                }

                result += `\n<b>${labels[group]}</b>\n\n`;

                for (const feature of features) {
                    const text = escapeHtml(
                        getReleaseItemText(feature, locale)
                    );

                    result += `${features.length > 1 ? '- ' : ''}${text}\n`;
                }
            }

            return result;
        })
        .join('\n');
};

const truncateText = (value: string, maxLength: number) => {
    if (value.length <= maxLength) {
        return value;
    }

    const cut = value
        .slice(0, Math.max(0, maxLength - TRUNCATION_MARK.length))
        .replace(/&[#\w]*$/, '');

    return `${cut}${TRUNCATION_MARK}`;
};

export const renderReleaseAnnouncement = (
    release: ReleaseRecord,
    locale: AppLocale = getDefaultAppLocale(),
    limit = TELEGRAM_MESSAGE_LIMIT
) => {
    const LL = getTranslator(locale);
    const labels = getReleaseLabels(locale);
    const header = `<b>${escapeHtml(LL.releases.announcement.title({ version: release.version }))}</b>\n${escapeHtml(release.date)}\n`;
    const footer = `\n${escapeHtml(LL.releases.announcement.footer())}`;
    let result = header;
    let isTruncated = false;

    for (const group of releaseGroupOrder) {
        const features = release.groups[group];

        if (!features?.length || isTruncated) {
            continue;
        }

        const heading = `\n<b>${labels[group]}</b>\n\n`;
        let section = heading;

        for (const feature of features) {
            const text = escapeHtml(getReleaseItemText(feature, locale));
            const line = `${features.length > 1 ? '- ' : ''}${text}\n`;
            const available =
                limit -
                footer.length -
                TRUNCATION_MARK.length -
                1 -
                result.length -
                section.length;

            if (line.length <= available) {
                section += line;
                continue;
            }

            isTruncated = true;

            if (available > MINIMUM_TRUNCATED_LINE_LENGTH) {
                section += `${truncateText(line.trimEnd(), available - 1)}\n`;
            }

            break;
        }

        if (section !== heading) {
            result += section;
        }
    }

    if (isTruncated) {
        result += `${TRUNCATION_MARK}\n`;
    }

    return `${result}${footer}`;
};
