import { MAX_ACTIVE_WISHES_PER_USER, cutTitle } from '../../input/limits';
import {
    LIST_IMPORT_MAX_ITEMS,
    type ListImportCountsDto
} from '../../../shared/app-api';
import { normalizeImportUrl } from '../link-import/normalize-url';
import type { SourceItem } from './types';

export interface DedupeKey {
    title: string;
    link: string | null;
    sourceRef: string | null;
}

export interface ListImportPlan {
    items: SourceItem[];
    counts: ListImportCountsDto;
}

interface SeenKeys {
    titles: Set<string>;
    links: Set<string>;
    refs: Set<string>;
}

export const normalizeTitle = (title: string) => {
    return cutTitle(title)
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
};

const normalizeLink = (link: string | null) => {
    if (link === null || link.trim() === '') {
        return null;
    }

    return normalizeImportUrl(link)?.url ?? null;
};

const isSeen = (seen: SeenKeys, key: DedupeKey) => {
    const title = normalizeTitle(key.title);
    const link = normalizeLink(key.link);

    return (
        (title !== '' && seen.titles.has(title)) ||
        (link !== null && seen.links.has(link)) ||
        (key.sourceRef !== null && seen.refs.has(key.sourceRef))
    );
};

const remember = (seen: SeenKeys, key: DedupeKey) => {
    const title = normalizeTitle(key.title);
    const link = normalizeLink(key.link);

    if (title !== '') {
        seen.titles.add(title);
    }

    if (link !== null) {
        seen.links.add(link);
    }

    if (key.sourceRef !== null) {
        seen.refs.add(key.sourceRef);
    }
};

const countWhere = (
    items: readonly SourceItem[],
    predicate: (item: SourceItem) => boolean
) => {
    return items.filter(predicate).length;
};

/**
 * Decides which source items become wishes. An item is a duplicate when its
 * normalized title, normalized link (never an empty one) or source ref matches
 * any of the owner's wishes, removed and gifted ones included, or an earlier
 * item of the same batch. Active items are limited to the free space under the
 * 500-wish cap; gifted ones do not use that space, but every planned item
 * counts toward the 500-item ceiling of one import. Items past either limit
 * are `overLimit`.
 */
export const buildPlan = (
    items: readonly SourceItem[],
    existing: readonly DedupeKey[],
    activeCount: number
): ListImportPlan => {
    const seen: SeenKeys = {
        titles: new Set(),
        links: new Set(),
        refs: new Set()
    };

    for (const key of existing) {
        remember(seen, key);
    }

    const activeCapacity = Math.max(
        0,
        MAX_ACTIVE_WISHES_PER_USER - activeCount
    );
    const planned: SourceItem[] = [];
    let duplicates = 0;
    let overLimit = 0;
    let plannedActive = 0;

    for (const item of items) {
        if (isSeen(seen, item)) {
            duplicates += 1;
            continue;
        }

        remember(seen, item);

        const fitsImport = planned.length < LIST_IMPORT_MAX_ITEMS;
        const fitsActive = item.gifted || plannedActive < activeCapacity;

        if (!fitsImport || !fitsActive) {
            overLimit += 1;
            continue;
        }

        planned.push(item);

        if (!item.gifted) {
            plannedActive += 1;
        }
    }

    return {
        items: planned,
        counts: {
            found: items.length,
            active: plannedActive,
            gifted: planned.length - plannedActive,
            duplicates,
            overLimit,
            withoutPrice: countWhere(planned, item => {
                return item.foreignPrice;
            }),
            withoutPhoto: countWhere(planned, item => {
                return item.imageUrl === null;
            })
        }
    };
};
