import {
    WISH_PRIORITY_LEVELS,
    type ContactDisclosureField,
    type WishPriorityLevel
} from '../shared/app-api';
import { CURRENCIES, type Currency } from '../shared/money';
import type {
    AuthType,
    CallbackAction,
    ConfirmableDisclosureField,
    LanguageChoice,
    NavigationScreenId,
    WishField,
    WishFilter
} from './runtime/types';

export const CALLBACK_DATA_MAX_BYTES = 64;

const NAVIGATION_CODES = {
    home: 'home',
    privacy: 'priv',
    auth: 'auth',
    wishlist: 'wl',
    wishAdd: 'add',
    giveList: 'gl',
    findList: 'find',
    feedback: 'fb',
    stats: 'stats',
    donate: 'don',
    payments: 'pay',
    language: 'lang',
    releases: 'rel',
    settings: 'set',
    currency: 'cur',
    delivery: 'dlv',
    disclosure: 'dsc'
} as const satisfies Record<NavigationScreenId, string>;

const WISH_FIELD_CODES = {
    title: 't',
    description: 'd',
    images: 'i',
    link: 'l',
    price: 'p'
} as const satisfies Record<WishField, string>;

const AUTH_TYPE_CODES = {
    username: 'u',
    phone: 'p',
    both: 'b'
} as const satisfies Record<AuthType, string>;

const DISCLOSURE_FIELD_CODES = {
    payments: 'p',
    phone: 'h',
    address: 'a'
} as const satisfies Record<ContactDisclosureField, string>;

const CONFIRM_SUFFIX = 'y';

const LANGUAGE_CHOICES: readonly LanguageChoice[] = ['uk', 'en', 'pl', 'auto'];

const PRIORITY_LEVEL_VALUES: readonly WishPriorityLevel[] =
    Object.values(WISH_PRIORITY_LEVELS);

const LEGACY_NAVIGATION: Readonly<Record<string, NavigationScreenId>> = {
    greeting: 'home',
    privacy: 'privacy',
    auth: 'auth',
    wishlist: 'wishlist',
    wishlist_add: 'wishAdd',
    find_list: 'findList',
    give_list: 'giveList',
    feedback: 'feedback',
    stats: 'stats',
    donate: 'donate',
    payments: 'payments'
};

const invertRecord = <K extends string, V extends string>(
    record: Record<K, V>
): ReadonlyMap<string, K> => {
    return new Map(
        (Object.entries(record) as [K, V][]).map(([key, value]) => {
            return [value, key];
        })
    );
};

const SCREEN_BY_NAVIGATION_CODE = invertRecord(NAVIGATION_CODES);
const FIELD_BY_CODE = invertRecord(WISH_FIELD_CODES);
const AUTH_TYPE_BY_CODE = invertRecord(AUTH_TYPE_CODES);
const DISCLOSURE_FIELD_BY_CODE = invertRecord(DISCLOSURE_FIELD_CODES);

const ENTITY_ID_PATTERN = /^[1-9]\d{0,15}$/;
const OFFSET_PATTERN = /^(0|[1-9]\d{0,8})$/;
const FILTER_PATTERN = /^[0-4]$/;
const FILTER_RESET_CODE = 'x';
const IMAGE_INDEX_PATTERN = /^[0-8]$/;
const IMAGE_HASH_PREFIX_PATTERN = /^[0-9a-f]{8}$/;
export const IMAGE_HASH_PREFIX_LENGTH = 8;

const encodeFilter = (filter: WishFilter | null): string => {
    return filter === null ? FILTER_RESET_CODE : String(filter);
};

const parseEntityId = (raw: string | undefined): number | null => {
    if (raw === undefined || !ENTITY_ID_PATTERN.test(raw)) {
        return null;
    }

    const value = Number(raw);

    return Number.isSafeInteger(value) ? value : null;
};

const parseOffset = (raw: string | undefined): number | null => {
    if (raw === undefined || !OFFSET_PATTERN.test(raw)) {
        return null;
    }

    return Number(raw);
};

type ParsedFilter = { ok: true; filter: WishFilter | null } | { ok: false };

const parseFilter = (raw: string | undefined): ParsedFilter => {
    if (raw === FILTER_RESET_CODE) {
        return { ok: true, filter: null };
    }

    if (raw === undefined || !FILTER_PATTERN.test(raw)) {
        return { ok: false };
    }

    return { ok: true, filter: Number(raw) as WishFilter };
};

const assertCallbackDataSize = (data: string): string => {
    if (new TextEncoder().encode(data).length > CALLBACK_DATA_MAX_BYTES) {
        throw new RangeError(
            `callback_data exceeds ${CALLBACK_DATA_MAX_BYTES} bytes: ${data}`
        );
    }

    return data;
};

export type EncodableCallbackAction = Exclude<
    CallbackAction,
    { type: 'outdated' }
>;

const encodeAction = (action: EncodableCallbackAction): string => {
    switch (action.type) {
        case 'navigate':
            return `n:${NAVIGATION_CODES[action.screen]}`;
        case 'wishlistPage':
            return `wl:p:${action.offset}`;
        case 'wishlistClean':
            return 'wl:clean';
        case 'wishlistCleanConfirm':
            return 'wl:clean:y';
        case 'wishlistShare':
            return 'wl:share';
        case 'wishlistSharePublish':
            return 'wl:share:y';
        case 'wishlistShareStop':
            return 'wl:share:stop';
        case 'wishlistShareStopConfirm':
            return 'wl:share:stop:y';
        case 'wishlistShareRotate':
            return 'wl:share:new';
        case 'wishlistShareRotateConfirm':
            return 'wl:share:new:y';
        case 'wishlistShareUsername':
            return 'wl:share:u';
        case 'wishlistShareIndexing':
            return 'wl:share:idx';
        case 'wishlistFilterMenu':
            return 'wl:f';
        case 'wishlistFilter':
            return `wl:f:${encodeFilter(action.filter)}`;
        case 'wishEdit':
            return `w:e:${action.wishId}`;
        case 'wishRemove':
            return `w:r:${action.wishId}`;
        case 'wishRemoveConfirm':
            return `w:r:${action.done ? 'y' : 'n'}:${action.wishId}`;
        case 'wishPriorityMenu':
            return `w:pm:${action.wishId}`;
        case 'wishPrioritySet':
            return `w:pl:${action.wishId}:${action.level}`;
        case 'wishCurrencySet':
            return `w:cu:${action.wishId}:${action.currency}`;
        case 'wishImagesOrder':
            return `w:io:${action.wishId}`;
        case 'wishImageFirst':
            return `w:if:${action.wishId}:${action.index}:${action.hash8}`;
        case 'wishToggleVisibility':
            return `w:v:${action.wishId}`;
        case 'wishFieldPrompt':
            return `w:f:${WISH_FIELD_CODES[action.field]}:${action.wishId}`;
        case 'wishBack':
            return `w:back:${action.wishId}`;
        case 'wishAdd':
            return 'w:add';
        case 'thirdPage':
            return `t:p:${action.ownerId}:${action.offset}`;
        case 'thirdGive':
            return `t:g:${action.wishId}`;
        case 'thirdTake':
            return `t:t:${action.wishId}`;
        case 'thirdFilterMenu':
            return `t:f:${action.ownerId}`;
        case 'thirdFilter':
            return `t:f:${action.ownerId}:${encodeFilter(action.filter)}`;
        case 'giveListPage':
            return `g:p:${action.offset}`;
        case 'giveRemove':
            return `g:r:${action.wishId}`;
        case 'giveListClean':
            return 'g:clean';
        case 'giveListCleanConfirm':
            return 'g:clean:y';
        case 'authType':
            return `a:${AUTH_TYPE_CODES[action.authType]}`;
        case 'paymentsRemove':
            return 'p:rm';
        case 'currencySet':
            return `cur:${action.currency}`;
        case 'disclosureToggle':
            return `dsc:${DISCLOSURE_FIELD_CODES[action.field]}`;
        case 'disclosureConfirm':
            return `dsc:${DISCLOSURE_FIELD_CODES[action.field]}:${CONFIRM_SUFFIX}`;
        case 'deliveryRemove':
            return 'dlv:rm';
        case 'language':
            return `l:${action.choice}`;
        case 'noop':
            return 'x';
    }
};

export const encodeCallbackData = (action: EncodableCallbackAction): string => {
    return assertCallbackDataSize(encodeAction(action));
};

const OUTDATED: CallbackAction = { type: 'outdated' };

const withWishId = (
    raw: string | undefined,
    build: (wishId: number) => CallbackAction
): CallbackAction => {
    const wishId = parseEntityId(raw);

    return wishId === null ? OUTDATED : build(wishId);
};

const withOffset = (
    raw: string | undefined,
    build: (offset: number) => CallbackAction
): CallbackAction => {
    const offset = parseOffset(raw);

    return offset === null ? OUTDATED : build(offset);
};

const decodeNavigation = (parts: readonly string[]): CallbackAction => {
    const [, code, ...rest] = parts;
    const screen =
        code === undefined ? undefined : SCREEN_BY_NAVIGATION_CODE.get(code);

    if (screen === undefined || rest.length > 0) {
        return OUTDATED;
    }

    return { type: 'navigate', screen };
};

const SHARE_ACTIONS_BY_SUFFIX: ReadonlyMap<string, CallbackAction> = new Map([
    ['', { type: 'wishlistShare' }],
    ['y', { type: 'wishlistSharePublish' }],
    ['stop', { type: 'wishlistShareStop' }],
    ['stop:y', { type: 'wishlistShareStopConfirm' }],
    ['new', { type: 'wishlistShareRotate' }],
    ['new:y', { type: 'wishlistShareRotateConfirm' }],
    ['u', { type: 'wishlistShareUsername' }],
    ['idx', { type: 'wishlistShareIndexing' }]
]);

const decodeWishlistShare = (suffixParts: readonly string[]) => {
    if (suffixParts.includes('')) {
        return OUTDATED;
    }

    return SHARE_ACTIONS_BY_SUFFIX.get(suffixParts.join(':')) ?? OUTDATED;
};

const decodeWishlist = (parts: readonly string[]): CallbackAction => {
    const [, command, argument, ...rest] = parts;

    if (command === 'share') {
        return decodeWishlistShare(parts.slice(2));
    }

    if (rest.length > 0) {
        return OUTDATED;
    }

    if (command === 'p') {
        return withOffset(argument, offset => {
            return { type: 'wishlistPage', offset };
        });
    }

    if (command === 'clean') {
        if (argument === undefined) {
            return { type: 'wishlistClean' };
        }

        return argument === 'y' ? { type: 'wishlistCleanConfirm' } : OUTDATED;
    }

    if (command === 'f') {
        if (argument === undefined) {
            return { type: 'wishlistFilterMenu' };
        }

        const parsed = parseFilter(argument);

        return parsed.ok
            ? { type: 'wishlistFilter', filter: parsed.filter }
            : OUTDATED;
    }

    return OUTDATED;
};

const decodeWishRemove = (parts: readonly string[]): CallbackAction => {
    const [, , first, second, ...rest] = parts;

    if (rest.length > 0) {
        return OUTDATED;
    }

    if (second === undefined) {
        return withWishId(first, wishId => {
            return { type: 'wishRemove', wishId };
        });
    }

    if (first !== 'y' && first !== 'n') {
        return OUTDATED;
    }

    return withWishId(second, wishId => {
        return { type: 'wishRemoveConfirm', wishId, done: first === 'y' };
    });
};

const findCurrency = (raw: string | undefined): Currency | undefined => {
    return CURRENCIES.find(currency => {
        return currency === raw;
    });
};

const findPriorityLevel = (
    raw: string | undefined
): WishPriorityLevel | undefined => {
    return PRIORITY_LEVEL_VALUES.find(level => {
        return String(level) === raw;
    });
};

const decodeWishPrioritySet = (parts: readonly string[]): CallbackAction => {
    const [, , wishIdPart, levelPart, ...rest] = parts;
    const level = findPriorityLevel(levelPart);

    if (level === undefined || rest.length > 0) {
        return OUTDATED;
    }

    return withWishId(wishIdPart, wishId => {
        return { type: 'wishPrioritySet', wishId, level };
    });
};

const decodeWishCurrencySet = (parts: readonly string[]): CallbackAction => {
    const [, , wishIdPart, currencyPart, ...rest] = parts;
    const currency = findCurrency(currencyPart);

    if (currency === undefined || rest.length > 0) {
        return OUTDATED;
    }

    return withWishId(wishIdPart, wishId => {
        return { type: 'wishCurrencySet', wishId, currency };
    });
};

const decodeWishImageFirst = (parts: readonly string[]): CallbackAction => {
    const [, , wishIdPart, indexPart, hash8, ...rest] = parts;

    if (
        indexPart === undefined ||
        !IMAGE_INDEX_PATTERN.test(indexPart) ||
        hash8 === undefined ||
        !IMAGE_HASH_PREFIX_PATTERN.test(hash8) ||
        rest.length > 0
    ) {
        return OUTDATED;
    }

    return withWishId(wishIdPart, wishId => {
        return {
            type: 'wishImageFirst',
            wishId,
            index: Number(indexPart),
            hash8
        };
    });
};

const WISH_DECODERS_BY_COMMAND: Readonly<
    Record<string, (parts: readonly string[]) => CallbackAction>
> = {
    r: decodeWishRemove,
    pl: decodeWishPrioritySet,
    cu: decodeWishCurrencySet,
    if: decodeWishImageFirst
};

const decodeWish = (parts: readonly string[]): CallbackAction => {
    const [, command, first, second, ...rest] = parts;
    const commandDecoder =
        command === undefined ? undefined : WISH_DECODERS_BY_COMMAND[command];

    if (commandDecoder !== undefined) {
        return commandDecoder(parts);
    }

    if (command === 'add') {
        return first === undefined ? { type: 'wishAdd' } : OUTDATED;
    }

    if (command === 'f') {
        const field =
            first === undefined ? undefined : FIELD_BY_CODE.get(first);

        if (field === undefined || rest.length > 0) {
            return OUTDATED;
        }

        return withWishId(second, wishId => {
            return { type: 'wishFieldPrompt', wishId, field };
        });
    }

    if (second !== undefined) {
        return OUTDATED;
    }

    switch (command) {
        case 'e':
            return withWishId(first, wishId => {
                return { type: 'wishEdit', wishId };
            });
        case 't':
        case 'pm':
            return withWishId(first, wishId => {
                return { type: 'wishPriorityMenu', wishId };
            });
        case 'io':
            return withWishId(first, wishId => {
                return { type: 'wishImagesOrder', wishId };
            });
        case 'v':
            return withWishId(first, wishId => {
                return { type: 'wishToggleVisibility', wishId };
            });
        case 'back':
            return withWishId(first, wishId => {
                return { type: 'wishBack', wishId };
            });
        default:
            return OUTDATED;
    }
};

const decodeThird = (parts: readonly string[]): CallbackAction => {
    const [, command, first, second, ...rest] = parts;

    if (rest.length > 0) {
        return OUTDATED;
    }

    if (command === 'p') {
        const ownerId = parseEntityId(first);

        if (ownerId === null) {
            return OUTDATED;
        }

        return withOffset(second, offset => {
            return { type: 'thirdPage', ownerId, offset };
        });
    }

    if (command === 'f') {
        const ownerId = parseEntityId(first);

        if (ownerId === null) {
            return OUTDATED;
        }

        if (second === undefined) {
            return { type: 'thirdFilterMenu', ownerId };
        }

        const parsed = parseFilter(second);

        return parsed.ok
            ? { type: 'thirdFilter', ownerId, filter: parsed.filter }
            : OUTDATED;
    }

    if (second !== undefined) {
        return OUTDATED;
    }

    if (command === 'g') {
        return withWishId(first, wishId => {
            return { type: 'thirdGive', wishId };
        });
    }

    if (command === 't') {
        return withWishId(first, wishId => {
            return { type: 'thirdTake', wishId };
        });
    }

    return OUTDATED;
};

const decodeGiveList = (parts: readonly string[]): CallbackAction => {
    const [, command, argument, ...rest] = parts;

    if (rest.length > 0) {
        return OUTDATED;
    }

    if (command === 'p') {
        return withOffset(argument, offset => {
            return { type: 'giveListPage', offset };
        });
    }

    if (command === 'r') {
        return withWishId(argument, wishId => {
            return { type: 'giveRemove', wishId };
        });
    }

    if (command === 'clean') {
        if (argument === undefined) {
            return { type: 'giveListClean' };
        }

        return argument === 'y' ? { type: 'giveListCleanConfirm' } : OUTDATED;
    }

    return OUTDATED;
};

const decodeAuth = (parts: readonly string[]): CallbackAction => {
    const [, code, ...rest] = parts;
    const authType =
        code === undefined ? undefined : AUTH_TYPE_BY_CODE.get(code);

    if (authType === undefined || rest.length > 0) {
        return OUTDATED;
    }

    return { type: 'authType', authType };
};

const decodeLanguage = (parts: readonly string[]): CallbackAction => {
    const [, code, ...rest] = parts;
    const choice = LANGUAGE_CHOICES.find(candidate => {
        return candidate === code;
    });

    if (choice === undefined || rest.length > 0) {
        return OUTDATED;
    }

    return { type: 'language', choice };
};

const decodePayments = (parts: readonly string[]): CallbackAction => {
    return parts.length === 2 && parts[1] === 'rm'
        ? { type: 'paymentsRemove' }
        : OUTDATED;
};

const decodeCurrency = (parts: readonly string[]): CallbackAction => {
    const [, code, ...rest] = parts;
    const currency = findCurrency(code);

    if (currency === undefined || rest.length > 0) {
        return OUTDATED;
    }

    return { type: 'currencySet', currency };
};

const isConfirmableDisclosureField = (
    field: ContactDisclosureField
): field is ConfirmableDisclosureField => {
    return field !== 'payments';
};

const decodeDisclosure = (parts: readonly string[]): CallbackAction => {
    const [, code, suffix, ...rest] = parts;
    const field =
        code === undefined ? undefined : DISCLOSURE_FIELD_BY_CODE.get(code);

    if (field === undefined || rest.length > 0) {
        return OUTDATED;
    }

    if (suffix === undefined) {
        return { type: 'disclosureToggle', field };
    }

    return suffix === CONFIRM_SUFFIX && isConfirmableDisclosureField(field)
        ? { type: 'disclosureConfirm', field }
        : OUTDATED;
};

const decodeDelivery = (parts: readonly string[]): CallbackAction => {
    return parts.length === 2 && parts[1] === 'rm'
        ? { type: 'deliveryRemove' }
        : OUTDATED;
};

const DECODERS_BY_PREFIX: Readonly<
    Record<string, (parts: readonly string[]) => CallbackAction>
> = {
    n: decodeNavigation,
    wl: decodeWishlist,
    w: decodeWish,
    t: decodeThird,
    g: decodeGiveList,
    a: decodeAuth,
    p: decodePayments,
    l: decodeLanguage,
    cur: decodeCurrency,
    dsc: decodeDisclosure,
    dlv: decodeDelivery
};

const decodeLegacyNavigation = (data: string): CallbackAction | null => {
    const screen = LEGACY_NAVIGATION[data];

    return screen === undefined ? null : { type: 'navigate', screen };
};

/**
 * Decodes any callback_data string, including legacy 1.x buttons still present
 * in chat history. Unknown or malformed data decodes to `{ type: 'outdated' }`.
 */
export const decodeCallbackData = (
    data: string | undefined
): CallbackAction => {
    if (data === undefined || data.length === 0) {
        return OUTDATED;
    }

    if (data === 'x') {
        return { type: 'noop' };
    }

    const legacy = decodeLegacyNavigation(data);

    if (legacy !== null) {
        return legacy;
    }

    const parts = data.split(':');
    const [prefix] = parts;
    const decoder =
        prefix === undefined ? undefined : DECODERS_BY_PREFIX[prefix];

    return decoder === undefined ? OUTDATED : decoder(parts);
};

export const isLegacyCallbackData = (data: string | undefined): boolean => {
    if (data === undefined) {
        return false;
    }

    return decodeLegacyNavigation(data) !== null || !data.includes(':');
};

const CALLBACK_CATEGORY_BY_TYPE = {
    navigate: 'nav',
    wishlistPage: 'wishlist:page',
    wishlistClean: 'wishlist:clean',
    wishlistCleanConfirm: 'wishlist:cleanConfirm',
    wishlistShare: 'wishlist:share',
    wishlistSharePublish: 'wishlist:sharePublish',
    wishlistShareStop: 'wishlist:shareStop',
    wishlistShareStopConfirm: 'wishlist:shareStopConfirm',
    wishlistShareRotate: 'wishlist:shareRotate',
    wishlistShareRotateConfirm: 'wishlist:shareRotateConfirm',
    wishlistShareUsername: 'wishlist:shareUsername',
    wishlistShareIndexing: 'wishlist:shareIndexing',
    wishlistFilterMenu: 'wishlist:filterMenu',
    wishlistFilter: 'wishlist:filter',
    wishEdit: 'wish:edit',
    wishRemove: 'wish:remove',
    wishRemoveConfirm: 'wish:removeConfirm',
    wishPriorityMenu: 'wish:priorityMenu',
    wishPrioritySet: 'wish:prioritySet',
    wishCurrencySet: 'wish:currency',
    wishImagesOrder: 'wish:imagesOrder',
    wishImageFirst: 'wish:imageFirst',
    wishToggleVisibility: 'wish:visibility',
    wishFieldPrompt: 'wish:field',
    wishBack: 'wish:back',
    wishAdd: 'wish:add',
    thirdPage: 'third:page',
    thirdGive: 'third:give',
    thirdTake: 'third:take',
    thirdFilterMenu: 'third:filterMenu',
    thirdFilter: 'third:filter',
    giveListPage: 'giveList:page',
    giveRemove: 'giveList:remove',
    giveListClean: 'giveList:clean',
    giveListCleanConfirm: 'giveList:cleanConfirm',
    authType: 'auth:type',
    paymentsRemove: 'payments:remove',
    currencySet: 'currency',
    disclosureToggle: 'disclosure:toggle',
    disclosureConfirm: 'disclosure:confirm',
    deliveryRemove: 'delivery:remove',
    language: 'language',
    noop: 'noop',
    outdated: 'invalid'
} as const satisfies Record<CallbackAction['type'], string>;

/**
 * Closed, id-free telemetry category for a callback_data string
 * (for example `nav:wishlist`, `wish:edit`, `legacy`, `invalid`).
 */
export const getCallbackCategory = (data: string | undefined): string => {
    const action = decodeCallbackData(data);

    if (action.type === 'navigate') {
        return isLegacyCallbackData(data) ? 'legacy' : `nav:${action.screen}`;
    }

    if (action.type === 'outdated' && isLegacyCallbackData(data)) {
        return 'legacy';
    }

    return CALLBACK_CATEGORY_BY_TYPE[action.type];
};
