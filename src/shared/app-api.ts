import {
    ADDRESS_MAX_LENGTH,
    ADDRESS_MIN_MEANINGFUL_CHARACTERS,
    DESCRIPTION_MAX_LENGTH,
    FEEDBACK_MAX_LENGTH,
    FIND_QUERY_MAX_LENGTH,
    LINK_MAX_LENGTH,
    PAYMENTS_MAX_LENGTH,
    PRICE_MAX_VALUE,
    TITLE_MAX_LENGTH
} from '../bot/input/limits';
import { PAYMENTS_MIN_MEANINGFUL_CHARACTERS } from '../bot/input/payments';
import type { Translation } from '../i18n/i18n-types';
import type { Currency, ExchangeRates } from './money';

export type AppDictionary = Translation['app'];

export type AppLocale = 'uk' | 'en' | 'pl';

export type AppLanguageChoice = AppLocale | 'auto';

export type VisibilityType = 'username' | 'phone' | 'both';

export type ContactVisibilityType = Exclude<VisibilityType, 'username'>;

export type WishFilterValue = 0 | 1 | 2 | 3 | 4;

export type ReleaseGroupKey =
    | 'added'
    | 'updated'
    | 'fixed'
    | 'removed'
    | 'notes';

export type AppLinkId = 'github' | 'princess' | 'youtube' | 'telegram' | 'x';

export const WISH_PRIORITIES = ['none', 'low', 'medium', 'high'] as const;

export type WishPriority = (typeof WISH_PRIORITIES)[number];

export const WISH_PRIORITY_LEVELS = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3
} as const satisfies Record<WishPriority, number>;

export type WishPriorityLevel = (typeof WISH_PRIORITY_LEVELS)[WishPriority];

export const CONTACT_DISCLOSURE_FIELDS = [
    'payments',
    'phone',
    'address'
] as const;

export type ContactDisclosureField = (typeof CONTACT_DISCLOSURE_FIELDS)[number];

export type ContactDisclosureDto = Record<ContactDisclosureField, boolean>;

export type OwnerContactDto = {
    phone: string | null;
    phoneHref: string | null;
    address: string | null;
};

export const APP_API_PREFIX = '/api/app';
export const APP_AUTH_SCHEME = 'tma';
export const APP_PAGE_SIZE = 20;
export const APP_RELEASES_PAGE_SIZE = 3;
export const APP_RELEASES_MAX_LIMIT = 20;
export const APP_JSON_BODY_MAX_BYTES = 16 * 1024;
export const APP_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const APP_INIT_DATA_MAX_BYTES = 8 * 1024;
export const APP_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
export const APP_INIT_DATA_MAX_FUTURE_SKEW_SECONDS = 5 * 60;
export const APP_MAX_WISH_IMAGES = 9;
export const APP_RETRY_AFTER_SECONDS = 60;
export const APP_OWNER_TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const APP_CONTACT_POLL_INTERVAL_MS = 1000;
export const APP_CONTACT_POLL_TIMEOUT_MS = 15_000;
export const APP_UPLOAD_LONGEST_EDGE_PX = 1600;
export const APP_UPLOAD_JPEG_QUALITY = 0.85;
export const APP_THIRD_PARTY_PAYMENTS_MAX_LENGTH = 1000;
export const APP_THIRD_PARTY_GIFTED_LIMIT = 30;
export const APP_IMAGE_HASH_LENGTH = 16;
export const APP_IMAGE_PATH_PREFIX = '/img/w';
export const SHARE_IMAGE_PATH_PREFIX = '/img/s';

export const APP_UPLOAD_CONTENT_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp'
] as const;

export type AppUploadContentType = (typeof APP_UPLOAD_CONTENT_TYPES)[number];

export interface AppLimits {
    title: number;
    description: number;
    link: number;
    priceMax: number;
    payments: number;
    paymentsMinMeaningful: number;
    address: number;
    addressMinMeaningful: number;
    feedback: number;
    findQuery: number;
    images: number;
    uploadBytes: number;
    pageSize: number;
}

export const APP_LIMITS: AppLimits = {
    title: TITLE_MAX_LENGTH,
    description: DESCRIPTION_MAX_LENGTH,
    link: LINK_MAX_LENGTH,
    priceMax: PRICE_MAX_VALUE,
    payments: PAYMENTS_MAX_LENGTH,
    paymentsMinMeaningful: PAYMENTS_MIN_MEANINGFUL_CHARACTERS,
    address: ADDRESS_MAX_LENGTH,
    addressMinMeaningful: ADDRESS_MIN_MEANINGFUL_CHARACTERS,
    feedback: FEEDBACK_MAX_LENGTH,
    findQuery: FIND_QUERY_MAX_LENGTH,
    images: APP_MAX_WISH_IMAGES,
    uploadBytes: APP_UPLOAD_MAX_BYTES,
    pageSize: APP_PAGE_SIZE
};

export const APP_PLATFORMS = [
    'ios',
    'android',
    'tdesktop',
    'macos',
    'weba',
    'webk',
    'unknown'
] as const;

export type AppPlatform = (typeof APP_PLATFORMS)[number];

export const APP_THEMES = ['light', 'dark', 'unknown'] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export const CLIENT_EVENT_KINDS = [
    'renderError',
    'networkError',
    'sdkUnsupported',
    'uploadFailed',
    'screenView',
    'validationFailed'
] as const;

export const CLIENT_EVENT_FIELDS = [
    'title',
    'description',
    'price',
    'link',
    'query',
    'payments',
    'feedback',
    'address'
] as const;

export type ClientEventField = (typeof CLIENT_EVENT_FIELDS)[number];

export type ClientEventKind = (typeof CLIENT_EVENT_KINDS)[number];

export const CLIENT_SCREENS = [
    'home',
    'onboarding',
    'wishes',
    'wishEditor',
    'gives',
    'find',
    'thirdList',
    'share',
    'payments',
    'visibility',
    'language',
    'feedback',
    'stats',
    'donate',
    'releases',
    'about',
    'settings',
    'currency',
    'delivery',
    'outsideTelegram',
    'sessionExpired',
    'unavailable',
    'previewOnly',
    'unsupported',
    'bootError',
    'unknown'
] as const;

export type ClientScreen = (typeof CLIENT_SCREENS)[number];

export const AUTH_REJECT_REASONS = [
    'missing',
    'malformed',
    'badHash',
    'stale',
    'future'
] as const;

export type AuthRejectReason = (typeof AUTH_REJECT_REASONS)[number];

export const API_ERROR_STATUS = {
    unauthorized: 401,
    forbidden: 403,
    previewAccessDenied: 403,
    registrationRequired: 403,
    tokenInvalid: 403,
    notFound: 404,
    conflict: 409,
    shareEmpty: 409,
    notShared: 409,
    imagesFull: 409,
    wishLimit: 409,
    imageChanged: 409,
    ownWish: 409,
    writeAccessRequired: 409,
    tokenExpired: 410,
    shareGone: 410,
    payloadTooLarge: 413,
    unsupportedMedia: 415,
    validation: 422,
    rateLimited: 429,
    internal: 500,
    notImplemented: 501,
    upstream: 502,
    notDelivered: 502,
    disabled: 503
} as const satisfies Record<string, number>;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export const API_ERROR_CODES = Object.keys(
    API_ERROR_STATUS
) as readonly ApiErrorCode[];

export const FIELD_ERROR_CODES = [
    'required',
    'empty',
    'tooLong',
    'tooShort',
    'containsLink',
    'invalid',
    'usernameRequired',
    'usernameUnavailable',
    'phoneRequired',
    'addressRequired'
] as const;

export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];

export type FieldErrors = Partial<Record<string, FieldErrorCode>>;

export interface ApiErrorPayload {
    code: ApiErrorCode;
    reason?: AuthRejectReason;
    fields?: FieldErrors;
    retryAfter?: number;
}

export interface ApiErrorBody {
    error: ApiErrorPayload;
}

export type ApiImage = { url: string; hash: string };

export type OwnWishDto = {
    id: number;
    title: string;
    description: string | null;
    link: string | null;
    linkHost: string | null;
    price: number;
    currency: Currency;
    priority: WishPriority;
    hidden: boolean;
    images: ApiImage[];
    createdAt: string;
    updatedAt: string;
    gifted?: boolean;
};

export type GiverSummaryDto = {
    kind: 'none' | 'you' | 'somebodyAndYou' | 'somebody';
    count: number;
};

export type ThirdWishDto = Omit<OwnWishDto, 'hidden'> & {
    givers: GiverSummaryDto;
};

export type OwnerDto = {
    token: string | null;
    label: string;
    payments: string | null;
    contact: OwnerContactDto | null;
    source: 'search' | 'share';
    canGive: boolean;
};

export type GiveEntryDto = {
    wish: Omit<ThirdWishDto, 'givers'>;
    ownerUsername: string | null;
    otherGivers: number;
};

export type MeDto = {
    registered: boolean;
    visibility: VisibilityType | null;
    telegramUsername: string | null;
    phoneMasked: string | null;
    payments: string | null;
    deliveryAddress: string | null;
    disclosure: ContactDisclosureDto;
    currency: Currency;
    languageChoice: AppLanguageChoice;
    locale: AppLocale;
    wishlistFilter: WishFilterValue | null;
    canShowPublicUsername: boolean;
    showGifted: boolean;
};

export type ShareDto = {
    state: 'empty' | 'unshared' | 'shared';
    url: string | null;
    appUrl: string | null;
    showUsername: boolean;
    canShowUsername: boolean;
    allowIndexing: boolean;
    consent: { name: string; host: string };
};

export type PriceFilterDto = {
    filter: WishFilterValue;
    from: number | null;
    to: number | null;
};

export type SupportLinkDto = { id: string; title: string; url: string };

export type BootstrapDto = {
    me: MeDto;
    messages: AppDictionary;
    counts: { wishes: number; gives: number } | null;
    config: {
        botUrl: string;
        limits: AppLimits;
        rates: ExchangeRates;
        priceFilters: Record<Currency, PriceFilterDto[]>;
        supportLinks: SupportLinkDto[];
        links: Record<AppLinkId, string | null>;
    };
};

export type WishDraftInput = {
    title: string;
    description?: string | null;
    link?: string | null;
    price?: string | number | null;
    currency?: Currency;
    priority?: WishPriority | boolean;
    hidden?: boolean;
};

export type WishPatchInput = Partial<WishDraftInput>;

export type PageDto<Item> = {
    items: Item[];
    total: number;
    nextOffset: number | null;
};

export type WishListDto = PageDto<OwnWishDto> & {
    filter: WishFilterValue | null;
    giftedTotal: number;
};

export type WishFilterInput = { filter: WishFilterValue | null };

export type WishFilterDto = { filter: WishFilterValue | null };

export type RemoveWishInput = { done: boolean };

export type RemovedCountDto = { removed: number };

export type GiveListDto = PageDto<GiveEntryDto>;

export type SearchInput = { query: string };

export type SearchResultDto =
    | { status: 'found'; owner: OwnerDto }
    | { status: 'notFound' | 'self' | 'tooLong' };

export type SharedWishDto = Omit<ThirdWishDto, 'givers'>;

export type SharedListDto = {
    owner: OwnerDto;
    preview: PageDto<SharedWishDto> | null;
    gifted?: SharedWishDto[];
};

export type OwnerWishListDto = PageDto<ThirdWishDto> & {
    owner: OwnerDto;
    gifted?: SharedWishDto[];
};

export type VisibilityInput = { type: 'username' };

export type ContactIntentInput = { type: ContactVisibilityType };

export type LanguageInput = { choice: AppLanguageChoice };

export type LanguageResultDto = { me: MeDto; messages: AppDictionary };

export type PaymentsInput = { text: string };

export type CurrencyInput = { currency: Currency };

export type DeliveryAddressInput = { text: string };

export type ContactDisclosureInput = Partial<ContactDisclosureDto>;

export type ReorderImagesInput = { hashes: string[] };

export type ShareUsernameInput = { show: boolean };

export type ShareIndexingInput = { allowIndexing: boolean };

export type ShowGiftedInput = { show: boolean };

export type GiftedHiddenInput = { hidden: boolean };

export type FeedbackInput = { text: string };

export type StatsDto = { users: number; wishes: number; done: number };

export type ReleaseGroupDto = {
    group: ReleaseGroupKey;
    label: string;
    items: string[];
};

export type ReleaseDto = {
    version: string;
    date: string;
    groups: ReleaseGroupDto[];
};

export type ReleasesDto = { items: ReleaseDto[]; total: number };

export type ClientEventInput = {
    kind: ClientEventKind;
    screen: ClientScreen;
    field?: ClientEventField;
    code?: FieldErrorCode;
};

export type BootstrapQuery = {
    platform?: string;
    theme?: string;
    version?: string;
    start?: string;
};

export type OffsetQuery = { offset?: number };

export type OwnerWishesQuery = {
    offset?: number;
    filter?: WishFilterValue;
};

export type ReleasesQuery = { offset?: number; limit?: number };

export type RemoveImageQuery = { hash: string };

export type NoContent = null;

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RateLimitBucket = 'api' | 'sensitive' | 'upload' | 'image';

export type ApiRouteAccess = 'any' | 'user';

export type ApiBodyKind = 'none' | 'json' | 'upload';

export interface ApiRouteSpec {
    method: ApiMethod;
    path: string;
    access: ApiRouteAccess;
    bucket: Exclude<RateLimitBucket, 'image'>;
    body: ApiBodyKind;
    status: 200 | 201 | 204;
}

export const APP_API_ROUTES = {
    bootstrap: {
        method: 'GET',
        path: '/bootstrap',
        access: 'any',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    getMe: {
        method: 'GET',
        path: '/me',
        access: 'any',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    setVisibility: {
        method: 'PUT',
        path: '/me/visibility',
        access: 'any',
        bucket: 'sensitive',
        body: 'json',
        status: 200
    },
    startContactIntent: {
        method: 'POST',
        path: '/me/visibility/contact-intent',
        access: 'any',
        bucket: 'sensitive',
        body: 'json',
        status: 204
    },
    cancelContactIntent: {
        method: 'DELETE',
        path: '/me/visibility/contact-intent',
        access: 'any',
        bucket: 'api',
        body: 'none',
        status: 204
    },
    setLanguage: {
        method: 'PUT',
        path: '/me/language',
        access: 'any',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    setPayments: {
        method: 'PUT',
        path: '/me/payments',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    removePayments: {
        method: 'DELETE',
        path: '/me/payments',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    setCurrency: {
        method: 'PUT',
        path: '/me/currency',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    setDeliveryAddress: {
        method: 'PUT',
        path: '/me/address',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    removeDeliveryAddress: {
        method: 'DELETE',
        path: '/me/address',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    setContactDisclosure: {
        method: 'PUT',
        path: '/me/disclosure',
        access: 'user',
        bucket: 'sensitive',
        body: 'json',
        status: 200
    },
    setShowGifted: {
        method: 'PUT',
        path: '/me/show-gifted',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    listWishes: {
        method: 'GET',
        path: '/wishes',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    setWishFilter: {
        method: 'PUT',
        path: '/wishes/filter',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    createWish: {
        method: 'POST',
        path: '/wishes',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 201
    },
    getWish: {
        method: 'GET',
        path: '/wishes/:id',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    updateWish: {
        method: 'PATCH',
        path: '/wishes/:id',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    removeWish: {
        method: 'POST',
        path: '/wishes/:id/remove',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 204
    },
    cleanWishes: {
        method: 'POST',
        path: '/wishes/clean',
        access: 'user',
        bucket: 'sensitive',
        body: 'none',
        status: 200
    },
    restoreWish: {
        method: 'POST',
        path: '/wishes/:id/restore',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    hideGiftedWish: {
        method: 'PUT',
        path: '/wishes/:id/gifted-hidden',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 204
    },
    uploadWishImage: {
        method: 'POST',
        path: '/wishes/:id/images',
        access: 'user',
        bucket: 'upload',
        body: 'upload',
        status: 200
    },
    removeWishImage: {
        method: 'DELETE',
        path: '/wishes/:id/images/:index',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    clearWishImages: {
        method: 'DELETE',
        path: '/wishes/:id/images',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    reorderWishImages: {
        method: 'PUT',
        path: '/wishes/:id/images/order',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    startImageChatIntent: {
        method: 'POST',
        path: '/wishes/:id/images/chat-intent',
        access: 'user',
        bucket: 'sensitive',
        body: 'none',
        status: 204
    },
    listGives: {
        method: 'GET',
        path: '/gives',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    removeGive: {
        method: 'DELETE',
        path: '/gives/:wishId',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 204
    },
    cleanGives: {
        method: 'POST',
        path: '/gives/clean',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    search: {
        method: 'POST',
        path: '/search',
        access: 'user',
        bucket: 'sensitive',
        body: 'json',
        status: 200
    },
    openSharedList: {
        method: 'GET',
        path: '/shared/:publicId',
        access: 'user',
        bucket: 'sensitive',
        body: 'none',
        status: 200
    },
    listOwnerWishes: {
        method: 'GET',
        path: '/lists/:token/wishes',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    giveWish: {
        method: 'POST',
        path: '/lists/:token/wishes/:wishId/give',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    getShare: {
        method: 'GET',
        path: '/share',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    publishShare: {
        method: 'POST',
        path: '/share/publish',
        access: 'user',
        bucket: 'sensitive',
        body: 'none',
        status: 200
    },
    setShareUsername: {
        method: 'PUT',
        path: '/share/username',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    setShareIndexing: {
        method: 'PUT',
        path: '/share/indexing',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    },
    rotateShare: {
        method: 'POST',
        path: '/share/rotate',
        access: 'user',
        bucket: 'sensitive',
        body: 'none',
        status: 200
    },
    stopShare: {
        method: 'POST',
        path: '/share/stop',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    sendFeedback: {
        method: 'POST',
        path: '/feedback',
        access: 'any',
        bucket: 'sensitive',
        body: 'json',
        status: 204
    },
    getStats: {
        method: 'GET',
        path: '/stats',
        access: 'any',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    listReleases: {
        method: 'GET',
        path: '/releases',
        access: 'any',
        bucket: 'api',
        body: 'none',
        status: 200
    },
    reportClientEvent: {
        method: 'POST',
        path: '/client-events',
        access: 'any',
        bucket: 'api',
        body: 'json',
        status: 204
    }
} as const satisfies Record<string, ApiRouteSpec>;

export type AppApiRouteKey = keyof typeof APP_API_ROUTES;

export type AppApiRoutePath = (typeof APP_API_ROUTES)[AppApiRouteKey]['path'];

export interface AppApiEndpoints {
    bootstrap: { query: BootstrapQuery; body: null; response: BootstrapDto };
    getMe: { query: null; body: null; response: MeDto };
    setVisibility: { query: null; body: VisibilityInput; response: MeDto };
    startContactIntent: {
        query: null;
        body: ContactIntentInput;
        response: NoContent;
    };
    cancelContactIntent: { query: null; body: null; response: NoContent };
    setLanguage: {
        query: null;
        body: LanguageInput;
        response: LanguageResultDto;
    };
    setPayments: { query: null; body: PaymentsInput; response: MeDto };
    removePayments: { query: null; body: null; response: MeDto };
    setCurrency: { query: null; body: CurrencyInput; response: MeDto };
    setDeliveryAddress: {
        query: null;
        body: DeliveryAddressInput;
        response: MeDto;
    };
    removeDeliveryAddress: { query: null; body: null; response: MeDto };
    setContactDisclosure: {
        query: null;
        body: ContactDisclosureInput;
        response: MeDto;
    };
    setShowGifted: { query: null; body: ShowGiftedInput; response: MeDto };
    listWishes: { query: OffsetQuery; body: null; response: WishListDto };
    setWishFilter: {
        query: null;
        body: WishFilterInput;
        response: WishFilterDto;
    };
    createWish: { query: null; body: WishDraftInput; response: OwnWishDto };
    getWish: { query: null; body: null; response: OwnWishDto };
    updateWish: { query: null; body: WishPatchInput; response: OwnWishDto };
    removeWish: { query: null; body: RemoveWishInput; response: NoContent };
    cleanWishes: { query: null; body: null; response: RemovedCountDto };
    restoreWish: { query: null; body: null; response: OwnWishDto };
    hideGiftedWish: {
        query: null;
        body: GiftedHiddenInput;
        response: NoContent;
    };
    uploadWishImage: { query: null; body: Blob; response: OwnWishDto };
    removeWishImage: {
        query: RemoveImageQuery;
        body: null;
        response: OwnWishDto;
    };
    clearWishImages: { query: null; body: null; response: OwnWishDto };
    reorderWishImages: {
        query: null;
        body: ReorderImagesInput;
        response: OwnWishDto;
    };
    startImageChatIntent: { query: null; body: null; response: NoContent };
    listGives: { query: OffsetQuery; body: null; response: GiveListDto };
    removeGive: { query: null; body: null; response: NoContent };
    cleanGives: { query: null; body: null; response: RemovedCountDto };
    search: { query: null; body: SearchInput; response: SearchResultDto };
    openSharedList: {
        query: OffsetQuery;
        body: null;
        response: SharedListDto;
    };
    listOwnerWishes: {
        query: OwnerWishesQuery;
        body: null;
        response: OwnerWishListDto;
    };
    giveWish: { query: null; body: null; response: ThirdWishDto };
    getShare: { query: null; body: null; response: ShareDto };
    publishShare: { query: null; body: null; response: ShareDto };
    setShareUsername: {
        query: null;
        body: ShareUsernameInput;
        response: ShareDto;
    };
    setShareIndexing: {
        query: null;
        body: ShareIndexingInput;
        response: ShareDto;
    };
    rotateShare: { query: null; body: null; response: ShareDto };
    stopShare: { query: null; body: null; response: ShareDto };
    sendFeedback: { query: null; body: FeedbackInput; response: NoContent };
    getStats: { query: null; body: null; response: StatsDto };
    listReleases: { query: ReleasesQuery; body: null; response: ReleasesDto };
    reportClientEvent: {
        query: null;
        body: ClientEventInput;
        response: NoContent;
    };
}

type PathParamNames<Path extends string> =
    Path extends `${string}:${infer Name}/${infer Rest}`
        ? Name | PathParamNames<`/${Rest}`>
        : Path extends `${string}:${infer Name}`
          ? Name
          : never;

export type AppApiPathParams<Key extends AppApiRouteKey> = Record<
    PathParamNames<(typeof APP_API_ROUTES)[Key]['path']>,
    string | number
>;

export const APP_API_ROUTE_TEMPLATES: readonly string[] = Object.values(
    APP_API_ROUTES
).map(route => {
    return `${APP_API_PREFIX}${route.path}`;
});

const pathParamPattern = /:([A-Za-z]+)/g;

export const buildAppApiPath = <Key extends AppApiRouteKey>(
    key: Key,
    params: AppApiPathParams<Key>,
    query: Readonly<Record<string, string | number | undefined>> = {}
) => {
    const values = params as Readonly<Record<string, string | number>>;
    const path = APP_API_ROUTES[key].path.replace(
        pathParamPattern,
        (_match, name: string) => {
            return encodeURIComponent(String(values[name] ?? ''));
        }
    );
    const search = new URLSearchParams();

    for (const [name, value] of Object.entries(query)) {
        if (value !== undefined) {
            search.set(name, String(value));
        }
    }

    const queryString = search.toString();

    return `${APP_API_PREFIX}${path}${queryString ? `?${queryString}` : ''}`;
};

export const toAppPlatform = (
    value: string | null | undefined
): AppPlatform => {
    if (value === 'android_x') {
        return 'android';
    }

    return APP_PLATFORMS.find(platform => platform === value) ?? 'unknown';
};

export const toAppTheme = (value: string | null | undefined): AppTheme => {
    return APP_THEMES.find(theme => theme === value) ?? 'unknown';
};

export const isApiErrorBody = (value: unknown): value is ApiErrorBody => {
    if (typeof value !== 'object' || value === null || !('error' in value)) {
        return false;
    }

    const { error } = value as { error: unknown };

    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        API_ERROR_CODES.some(code => code === (error as { code: unknown }).code)
    );
};
