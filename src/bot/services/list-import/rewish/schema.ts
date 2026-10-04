import type { ListImportFailure } from '../../../../shared/app-api';

export interface RewishUser {
    id: string;
}

export interface RewishList {
    id: number;
    wishesCount: number | null;
}

export interface RewishWish {
    id: number;
    title: string;
    description: string | null;
    avatarPath: string | null;
    purchaseLink: string | null;
    price: number | null;
    currency: number | null;
    status: number | null;
    position: number | null;
}

export interface RewishCollectionItem {
    id: number;
    title: string;
    description: string | null;
    externalLink: string | null;
    price: number | null;
    currency: number | null;
    status: number | null;
    position: number | null;
    mediaUrls: string[];
}

export interface RewishCollection {
    picture: string | null;
    items: RewishCollectionItem[];
}

export type RewishParsed<Value> =
    | { ok: true; value: Value }
    | { ok: false; outcome: ListImportFailure };

type JsonObject = Record<string, unknown>;

const ENVELOPE_FAILURES: Readonly<Record<string, ListImportFailure>> = {
    '214': 'userNotFound',
    '615': 'privateCollection',
    '0': 'invalidUrl'
};

const SCHEMA_CHANGED = { ok: false, outcome: 'schemaChanged' } as const;
const USER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

const isObject = (value: unknown): value is JsonObject => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isPositiveInteger = (value: unknown): value is number => {
    return Number.isSafeInteger(value) && (value as number) > 0;
};

const readOptionalNumber = (value: unknown): number | null | undefined => {
    if (value === null || value === undefined) {
        return null;
    }

    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined;
};

const readOptionalString = (value: unknown): string | null | undefined => {
    if (value === null || value === undefined) {
        return null;
    }

    return typeof value === 'string' ? value : undefined;
};

const parsed = <Value>(value: Value): RewishParsed<Value> => {
    return { ok: true, value };
};

const readEnvelopeFailure = (errors: unknown): ListImportFailure => {
    const [first] = Array.isArray(errors) ? errors : [];
    const code = isObject(first) ? first.code : undefined;
    const key =
        typeof code === 'string' || typeof code === 'number'
            ? String(code).trim()
            : '';

    return ENVELOPE_FAILURES[key] ?? 'upstream';
};

/**
 * Unwraps rewish's `{ value, is_success, errors }` envelope. Known error codes
 * map to their failures, any other code to `upstream`, and a body that is not
 * an envelope at all to `schemaChanged`.
 */
export const readEnvelope = (body: unknown): RewishParsed<unknown> => {
    if (!isObject(body) || typeof body.is_success !== 'boolean') {
        return SCHEMA_CHANGED;
    }

    if (!body.is_success) {
        return { ok: false, outcome: readEnvelopeFailure(body.errors) };
    }

    return parsed(body.value);
};

export const parseUser = (value: unknown): RewishParsed<RewishUser> => {
    if (
        !isObject(value) ||
        typeof value.id !== 'string' ||
        !USER_ID_PATTERN.test(value.id)
    ) {
        return SCHEMA_CHANGED;
    }

    return parsed({ id: value.id });
};

const toList = (value: unknown): RewishList | null => {
    if (!isObject(value) || !isPositiveInteger(value.id)) {
        return null;
    }

    const wishesCount = readOptionalNumber(value.wishes_count);

    return wishesCount === undefined ? null : { id: value.id, wishesCount };
};

const parseArray = <Item>(
    value: unknown,
    toItem: (entry: unknown) => Item | null
): RewishParsed<Item[]> => {
    if (!Array.isArray(value)) {
        return SCHEMA_CHANGED;
    }

    const items: Item[] = [];

    for (const entry of value) {
        const item = toItem(entry);

        if (item === null) {
            return SCHEMA_CHANGED;
        }

        items.push(item);
    }

    return parsed(items);
};

export const parseLists = (value: unknown): RewishParsed<RewishList[]> => {
    return parseArray(value, toList);
};

interface CommonItemFields {
    id: number;
    title: string;
    description: string | null;
    price: number | null;
    currency: number | null;
    status: number | null;
    position: number | null;
}

const toCommonFields = (value: JsonObject): CommonItemFields | null => {
    const description = readOptionalString(value.description);
    const price = readOptionalNumber(value.price);
    const currency = readOptionalNumber(value.currency);
    const status = readOptionalNumber(value.status);
    const position = readOptionalNumber(value.position);

    if (
        !isPositiveInteger(value.id) ||
        typeof value.title !== 'string' ||
        description === undefined ||
        price === undefined ||
        currency === undefined ||
        status === undefined ||
        position === undefined
    ) {
        return null;
    }

    return {
        id: value.id,
        title: value.title,
        description,
        price,
        currency,
        status,
        position
    };
};

const toWish = (value: unknown): RewishWish | null => {
    if (!isObject(value)) {
        return null;
    }

    const common = toCommonFields(value);
    const avatarPath = readOptionalString(value.avatar_path);
    const purchaseLink = readOptionalString(value.purchase_link);

    if (
        common === null ||
        avatarPath === undefined ||
        purchaseLink === undefined
    ) {
        return null;
    }

    return { ...common, avatarPath, purchaseLink };
};

export const parseWishes = (value: unknown): RewishParsed<RewishWish[]> => {
    return parseArray(value, toWish);
};

const toMediaUrl = (value: unknown): string | null | undefined => {
    if (!isObject(value)) {
        return undefined;
    }

    return readOptionalString(value.content_id);
};

const readMediaUrls = (value: unknown): string[] | null => {
    if (value === null || value === undefined) {
        return [];
    }

    if (!Array.isArray(value)) {
        return null;
    }

    const urls: string[] = [];

    for (const media of value) {
        const url = toMediaUrl(media);

        if (url === undefined) {
            return null;
        }

        if (url !== null) {
            urls.push(url);
        }
    }

    return urls;
};

const toCollectionItem = (value: unknown): RewishCollectionItem | null => {
    if (!isObject(value)) {
        return null;
    }

    const common = toCommonFields(value);
    const externalLink = readOptionalString(value.external_link);
    const mediaUrls = readMediaUrls(value.collection_item_medias);

    if (common === null || externalLink === undefined || mediaUrls === null) {
        return null;
    }

    return { ...common, externalLink, mediaUrls };
};

export const parseCollection = (
    value: unknown
): RewishParsed<RewishCollection> => {
    if (!isObject(value)) {
        return SCHEMA_CHANGED;
    }

    const picture = readOptionalString(value.collection_picture);
    const items = parseArray(value.collection_items, toCollectionItem);

    if (picture === undefined || !items.ok) {
        return SCHEMA_CHANGED;
    }

    return parsed({ picture, items: items.value });
};
