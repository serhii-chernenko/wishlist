import { isRenderableLink } from '../../../input/link';
import {
    cutDescription,
    cutTitle,
    LINK_MAX_LENGTH,
    PRICE_MAX_VALUE
} from '../../../input/limits';
import type { Currency } from '../../../../shared/money';
import type { SourceItem } from '../types';
import type { RewishCollection, RewishWish } from './schema';

export const REWISH_IMAGE_HOSTS: readonly string[] = ['storage.rewish.io'];

const GIFTED_STATUS = 3;
const COMPRESSED_SUFFIX = '_compressed';
const WISH_REF_PREFIX = 'rewish:wish:';
const ITEM_REF_PREFIX = 'rewish:item:';
const SECURE_PROTOCOL = 'https:';

const REWISH_CURRENCIES: ReadonlyMap<number, Currency> = new Map([
    [1, 'UAH'],
    [2, 'USD'],
    [3, 'EUR'],
    [5, 'PLN']
]);

interface RawItem {
    sourceRef: string;
    title: string;
    description: string | null;
    link: string | null;
    price: number | null;
    currency: number | null;
    status: number | null;
    position: number | null;
    imageUrl: string | null;
}

type UnorderedItem = Omit<SourceItem, 'order'> & { position: number | null };

interface PriceFields {
    price: number | null;
    currency: Currency | null;
    foreignPrice: boolean;
}

const NO_PRICE: PriceFields = {
    price: null,
    currency: null,
    foreignPrice: false
};

const collapseWhitespace = (value: string) => {
    return value.replace(/\s+/g, ' ').trim();
};

const toTitle = (raw: string) => {
    return cutTitle(collapseWhitespace(raw)).trim();
};

const toDescription = (raw: string | null) => {
    const trimmed = raw?.trim() ?? '';

    return trimmed === '' ? null : cutDescription(trimmed);
};

const toLink = (raw: string | null) => {
    const trimmed = raw?.trim() ?? '';

    return trimmed.length <= LINK_MAX_LENGTH && isRenderableLink(trimmed)
        ? trimmed
        : null;
};

const toPrice = (
    rawPrice: number | null,
    rawCurrency: number | null
): PriceFields => {
    const rounded = rawPrice === null ? 0 : Math.round(rawPrice);

    if (rounded <= 0 || rounded > PRICE_MAX_VALUE) {
        return NO_PRICE;
    }

    const currency =
        rawCurrency === null ? undefined : REWISH_CURRENCIES.get(rawCurrency);

    return currency === undefined
        ? { ...NO_PRICE, foreignPrice: true }
        : { price: rounded, currency, foreignPrice: false };
};

/** Keeps only https image URLs on rewish's storage host; anything else means "no photo". */
export const toRewishImageUrl = (raw: string | null) => {
    const trimmed = raw?.trim() ?? '';

    if (trimmed === '') {
        return null;
    }

    try {
        const url = new URL(trimmed);

        return url.protocol === SECURE_PROTOCOL &&
            REWISH_IMAGE_HOSTS.includes(url.hostname)
            ? url.href
            : null;
    } catch {
        return null;
    }
};

/** The original image first (the list returns the `_compressed` variant), then the URL as given. */
export const rewishPhotoCandidates = (rawImageUrl: string): string[] => {
    const original = rawImageUrl.endsWith(COMPRESSED_SUFFIX)
        ? rawImageUrl.slice(0, -COMPRESSED_SUFFIX.length)
        : rawImageUrl;

    return original === rawImageUrl ? [rawImageUrl] : [original, rawImageUrl];
};

const toUnorderedItem = (raw: RawItem): UnorderedItem | null => {
    const title = toTitle(raw.title);

    if (title === '') {
        return null;
    }

    return {
        sourceRef: raw.sourceRef,
        title,
        description: toDescription(raw.description),
        link: toLink(raw.link),
        ...toPrice(raw.price, raw.currency),
        gifted: raw.status === GIFTED_STATUS,
        imageUrl: toRewishImageUrl(raw.imageUrl),
        position: raw.position
    };
};

const byPosition = (left: UnorderedItem, right: UnorderedItem) => {
    const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;

    return leftPosition - rightPosition;
};

const sortGroup = (items: readonly UnorderedItem[], gifted: boolean) => {
    return items
        .filter(item => {
            return item.gifted === gifted;
        })
        .sort(byPosition);
};

const stripPosition = (item: UnorderedItem, order: number): SourceItem => {
    return {
        sourceRef: item.sourceRef,
        title: item.title,
        description: item.description,
        link: item.link,
        price: item.price,
        currency: item.currency,
        foreignPrice: item.foreignPrice,
        gifted: item.gifted,
        imageUrl: item.imageUrl,
        order
    };
};

/**
 * Orders the items the way rewish shows them: lists in API order, each list's
 * active wishes by position, then every gifted wish in the same list order.
 */
export const orderSourceItems = (
    groups: readonly (readonly UnorderedItem[])[]
): SourceItem[] => {
    const active = groups.flatMap(group => {
        return sortGroup(group, false);
    });
    const gifted = groups.flatMap(group => {
        return sortGroup(group, true);
    });

    return [...active, ...gifted].map(stripPosition);
};

export const mapRewishWishes = (wishes: readonly RewishWish[]) => {
    return wishes.flatMap(wish => {
        const item = toUnorderedItem({
            sourceRef: `${WISH_REF_PREFIX}${wish.id}`,
            title: wish.title,
            description: wish.description,
            link: wish.purchaseLink,
            price: wish.price,
            currency: wish.currency,
            status: wish.status,
            position: wish.position,
            imageUrl: wish.avatarPath
        });

        return item === null ? [] : [item];
    });
};

export const mapRewishCollection = (collection: RewishCollection) => {
    return collection.items.flatMap(collectionItem => {
        const item = toUnorderedItem({
            sourceRef: `${ITEM_REF_PREFIX}${collectionItem.id}`,
            title: collectionItem.title,
            description: collectionItem.description,
            link: collectionItem.externalLink,
            price: collectionItem.price,
            currency: collectionItem.currency,
            status: collectionItem.status,
            position: collectionItem.position,
            imageUrl: collectionItem.mediaUrls[0] ?? collection.picture
        });

        return item === null ? [] : [item];
    });
};
