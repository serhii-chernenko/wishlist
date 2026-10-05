import { createRequestLogger, type WideEvent } from 'evlog';
import { createOTLPDrain } from 'evlog/otlp';
import { initWorkersLogger } from 'evlog/workers';

import {
    API_ERROR_CODES,
    APP_API_PREFIX,
    APP_API_ROUTE_TEMPLATES,
    APP_IMAGE_PATH_PREFIX,
    LINK_IMAGE_PATH_PREFIX,
    SHARE_IMAGE_PATH_PREFIX,
    type ApiErrorCode,
    type AppPlatform,
    type AuthRejectReason,
    type AppTheme,
    type ClientEventField,
    type ClientEventKind,
    type ClientScreen,
    type FieldErrorCode,
    type LinkImportOutcome,
    type LinkImportShop,
    type LinkImportSource,
    type ListImportFailure,
    type ListImportKind,
    type ListImportOutcome,
    type ListImportSource,
    type ListImportVisibility,
    type RateLimitBucket
} from '../shared/app-api';
import { APP_SHELL_PATH, type StartKind } from '../shared/app-links';
import type { Currency } from '../shared/money';
import { getTelegramWebhookPath, type WorkerBindings } from './env';

initWorkersLogger({
    env: {
        service: 'wishlist',
        environment: 'cloudflare-workers'
    },
    pretty: false,
    stringify: true,
    redact: true
});

export type TelemetryContext =
    | { waitUntil(promise: Promise<unknown>): void }
    | undefined;

export const TELEGRAM_UPDATE_TYPES = [
    'message',
    'callback_query',
    'my_chat_member',
    'other'
] as const;

export type TelegramUpdateType = (typeof TELEGRAM_UPDATE_TYPES)[number];

export type TelemetryAction =
    | 'user_registered'
    | 'visibility_changed'
    | 'wish_created'
    | 'wish_updated'
    | 'wish_removed'
    | 'wishlist_cleaned'
    | 'wishlist_shared'
    | 'wishlist_share_stopped'
    | 'wishlist_share_rotated'
    | 'wishlist_share_username_toggled'
    | 'wishlist_share_indexing_toggled'
    | 'wishlist_filtered'
    | 'wishlist_searched'
    | 'give_added'
    | 'give_removed'
    | 'give_list_cleaned'
    | 'payments_updated'
    | 'payments_removed'
    | 'feedback_sent'
    | 'language_changed'
    | 'currency_changed'
    | 'wish_priority_set'
    | 'wish_images_reordered'
    | 'contact_disclosure_changed'
    | 'delivery_address_updated'
    | 'delivery_address_removed'
    | 'wish_restored'
    | 'gifted_hidden'
    | 'show_gifted_changed';

export type SharePageCurrencySource = 'cookie' | 'language';

export type TelemetryLocale = 'uk' | 'en' | 'pl' | 'auto';

export const SHARE_PAGE_TELEMETRY_PATH = '/w/:publicId';

export const HOME_PAGE_TELEMETRY_PATH = '/:lang';

export type SharePageResult =
    | 'rendered'
    | 'cached'
    | 'notModified'
    | 'redirected'
    | 'notFound'
    | 'gone'
    | 'error';

export type ShareCacheOutcome = 'hit' | 'miss' | 'bypass';

export type TelemetryChannel = 'bot' | 'app';

export const APP_TELEMETRY_PATH = APP_SHELL_PATH;

export const APP_API_TELEMETRY_PATH = APP_API_PREFIX;

export const APP_IMAGE_TELEMETRY_PATH = APP_IMAGE_PATH_PREFIX;

export const SHARE_IMAGE_TELEMETRY_PATH = SHARE_IMAGE_PATH_PREFIX;

export const LINK_IMAGE_TELEMETRY_PATH = LINK_IMAGE_PATH_PREFIX;

export const TELEGRAM_WEBHOOK_TELEMETRY_PATH = '/telegram/webhook';

export const APP_API_UNMATCHED_ROUTE = `${APP_API_PREFIX}/*`;

export type AppAuthRejectionReason =
    | AuthRejectReason
    | 'previewAccessDenied'
    | 'origin';

export type AppRateLimiterGap = 'missing' | 'error';

export type WishImageChangeResult = 'added' | 'removed' | 'cleared';

export type AppPhotoUploadResult =
    | 'appended'
    | 'duplicate'
    | 'full'
    | 'tooLarge'
    | 'unsupported'
    | 'writeAccessRequired'
    | 'telegramError'
    | 'carrierKept';

export type ImageProxyScope = 'app' | 'share' | 'import';

export const LINK_IMPORT_ELAPSED_BUCKETS = [
    'instant',
    'quick',
    'normal',
    'slow',
    'verySlow'
] as const;

export type LinkImportElapsedBucket =
    (typeof LINK_IMPORT_ELAPSED_BUCKETS)[number];

export const LINK_IMPORT_IMAGE_BUCKETS = [
    'none',
    'oneToFour',
    'fivePlus'
] as const;

export type LinkImportImageBucket = (typeof LINK_IMPORT_IMAGE_BUCKETS)[number];

const ELAPSED_BUCKET_UPPER_BOUNDS_MS = [
    [300, 'instant'],
    [1500, 'quick'],
    [3000, 'normal'],
    [6000, 'slow']
] as const satisfies readonly (readonly [number, LinkImportElapsedBucket])[];

const IMAGE_BUCKET_FEW_MAX = 4;

export const toLinkImportElapsedBucket = (
    elapsedMs: number
): LinkImportElapsedBucket => {
    const bucket = ELAPSED_BUCKET_UPPER_BOUNDS_MS.find(([upperBound]) => {
        return elapsedMs < upperBound;
    });

    return bucket === undefined ? 'verySlow' : bucket[1];
};

export const toLinkImportImageBucket = (
    count: number
): LinkImportImageBucket => {
    if (count <= 0) {
        return 'none';
    }

    return count <= IMAGE_BUCKET_FEW_MAX ? 'oneToFour' : 'fivePlus';
};

export const LIST_IMPORT_COUNT_BUCKETS = [
    'none',
    'oneToNine',
    'tenToFortyNine',
    'fiftyToTwoHundred',
    'overTwoHundred'
] as const;

export type ListImportCountBucket = (typeof LIST_IMPORT_COUNT_BUCKETS)[number];

const COUNT_BUCKET_UPPER_BOUNDS = [
    [1, 'none'],
    [10, 'oneToNine'],
    [50, 'tenToFortyNine'],
    [201, 'fiftyToTwoHundred']
] as const satisfies readonly (readonly [number, ListImportCountBucket])[];

export const toListImportCountBucket = (
    count: number
): ListImportCountBucket => {
    const bucket = COUNT_BUCKET_UPPER_BOUNDS.find(([upperBound]) => {
        return count < upperBound;
    });

    return bucket === undefined ? 'overTwoHundred' : bucket[1];
};

export const LIST_IMPORT_DRAIN_OUTCOMES = [
    'drained',
    'budget',
    'rateLimited',
    'idle'
] as const;

export type ListImportDrainOutcome =
    (typeof LIST_IMPORT_DRAIN_OUTCOMES)[number];

export type ListImportDrainTrigger = 'cron' | 'kick';

export type ListImportCommitTrigger = 'request' | 'resume';

export type ImageProxyResult =
    | 'hit'
    | 'miss'
    | 'notFound'
    | 'forbidden'
    | 'expired'
    | 'upstreamError'
    | 'placeholder'
    | 'rateLimited';

export interface SharePageServedInput {
    method: string;
    result: SharePageResult;
    cacheOutcome: ShareCacheOutcome;
    locale?: Exclude<TelemetryLocale, 'auto'>;
    status: number;
    elapsedMs: number;
    visibleWishes?: number;
    displayCurrency?: Currency;
    currencySource?: SharePageCurrencySource;
}

export type TelemetryFields = {
    event: string;
    method?: string;
    path?: string;
    status?: number;
    elapsedMs?: number;
    outcome?: string;
    errorType?: string;
    cron?: string;
    taskNames?: readonly string[];
    messageCount?: number;
    commandCategory?: string;
    updateType?: TelegramUpdateType;
    callbackCategory?: string;
    idempotencyOutcome?: string;
    rejectionReason?: string;
    candidates?: number;
    inserted?: number;
    enqueued?: number;
    prunedProcessedTelegramUpdates?: number;
    prunedAbandonedTelegramUpdates?: number;
    prunedSessions?: number;
    releaseVersion?: string;
    errorCode?: number | ApiErrorCode | null;
    delaySeconds?: number;
    attempts?: number;
    reason?: string;
    trigger?: string;
    action?: TelemetryAction;
    result?: string;
    field?: string;
    locale?: TelemetryLocale;
    languageCount?: number;
    registeredUsers?: number;
    blockedUsers?: number;
    activeUsers1d?: number;
    activeUsers7d?: number;
    activeUsers30d?: number;
    botOnlyUsers1d?: number;
    botOnlyUsers7d?: number;
    botOnlyUsers30d?: number;
    appOnlyUsers1d?: number;
    appOnlyUsers7d?: number;
    appOnlyUsers30d?: number;
    bothChannelUsers1d?: number;
    bothChannelUsers7d?: number;
    bothChannelUsers30d?: number;
    appUsersTotal?: number;
    totalWishes?: number;
    activeWishes?: number;
    hiddenWishes?: number;
    priorityWishes?: number;
    doneWishes?: number;
    gives?: number;
    usersWithPayments?: number;
    cacheOutcome?: ShareCacheOutcome;
    visibleWishes?: number;
    channel?: TelemetryChannel;
    route?: string;
    bucket?: RateLimitBucket;
    platform?: AppPlatform;
    startKind?: StartKind;
    isGuest?: boolean;
    scope?: ImageProxyScope;
    kind?: ClientEventKind | ListImportKind;
    screen?: ClientScreen;
    code?: FieldErrorCode;
    theme?: AppTheme;
    displayCurrency?: Currency;
    currencySource?: SharePageCurrencySource;
    source?: LinkImportSource | ListImportSource;
    shop?: LinkImportShop;
    imagesStaged?: LinkImportImageBucket;
    imagesSkipped?: LinkImportImageBucket;
    imagesIngested?: LinkImportImageBucket;
    elapsedBucket?: LinkImportElapsedBucket;
    visibility?: ListImportVisibility;
    itemsBucket?: ListImportCountBucket;
    duplicatesBucket?: ListImportCountBucket;
    createdBucket?: ListImportCountBucket;
    giftedBucket?: ListImportCountBucket;
    ingestedBucket?: ListImportCountBucket;
    failedBucket?: ListImportCountBucket;
};

const knownPaths = new Set([
    '/',
    '/status',
    '/health',
    '/admin/release-broadcast',
    '/robots.txt',
    '/sitemap.xml'
]);

const sharePagePathPattern = /^(?:\/(?:ua|uk|en|pl))?\/w(?:\/|$)/;

const homePagePathPattern = /^\/(?:ua|uk|en|pl)\/?$/;

const commandCategories = new Set(['start', 'lang', 'releases', 'app']);

const labelFieldNames = [
    'commandCategory',
    'updateType',
    'callbackCategory',
    'rejectionReason',
    'reason',
    'trigger',
    'action',
    'result',
    'field',
    'locale',
    'outcome',
    'idempotencyOutcome',
    'cacheOutcome',
    'channel',
    'bucket',
    'platform',
    'startKind',
    'scope',
    'kind',
    'screen',
    'code',
    'theme',
    'displayCurrency',
    'currencySource',
    'source',
    'shop',
    'imagesStaged',
    'imagesSkipped',
    'imagesIngested',
    'elapsedBucket',
    'visibility',
    'itemsBucket',
    'duplicatesBucket',
    'createdBucket',
    'giftedBucket',
    'ingestedBucket',
    'failedBucket'
] as const;

const knownApiRoutes: ReadonlySet<string> = new Set([
    ...APP_API_ROUTE_TEMPLATES,
    APP_API_UNMATCHED_ROUTE
]);

const knownApiErrorCodes: ReadonlySet<string> = new Set(API_ERROR_CODES);

const DEFAULT_ACTION_CHANNEL: TelemetryChannel = 'bot';

const safeLabelPattern = /^[A-Za-z][A-Za-z_:.-]{0,63}$/;
const invalidLabel = 'invalid';

const navigationScreens: Readonly<Record<string, string>> = {
    home: 'home',
    priv: 'privacy',
    auth: 'auth',
    wl: 'wishlist',
    add: 'wishAdd',
    gl: 'giveList',
    find: 'findList',
    fb: 'feedback',
    stats: 'stats',
    don: 'donate',
    pay: 'payments',
    lang: 'language',
    rel: 'releases',
    set: 'settings',
    cur: 'currency',
    dlv: 'delivery',
    dsc: 'disclosure',
    imp: 'listImport'
};

const callbackCategoryRules: readonly (readonly [RegExp, string])[] = [
    [/^wl:p:\d{1,9}$/, 'wishlist:page'],
    [/^wl:clean$/, 'wishlist:clean'],
    [/^wl:clean:y$/, 'wishlist:cleanConfirm'],
    [/^wl:share$/, 'wishlist:share'],
    [/^wl:share:y$/, 'wishlist:sharePublish'],
    [/^wl:share:stop$/, 'wishlist:shareStop'],
    [/^wl:share:stop:y$/, 'wishlist:shareStopConfirm'],
    [/^wl:share:new$/, 'wishlist:shareRotate'],
    [/^wl:share:new:y$/, 'wishlist:shareRotateConfirm'],
    [/^wl:share:u$/, 'wishlist:shareUsername'],
    [/^wl:share:idx$/, 'wishlist:shareIndexing'],
    [/^wl:share:g$/, 'wishlist:shareGifted'],
    [/^wl:f(?::[0-4x])?$/, 'wishlist:filter'],
    [/^w:e:\d{1,12}$/, 'wish:edit'],
    [/^w:r:\d{1,12}$/, 'wish:remove'],
    [/^w:r:y:\d{1,12}$/, 'wish:removeDone'],
    [/^w:r:n:\d{1,12}$/, 'wish:removeNotDone'],
    [/^w:(?:t|pm):\d{1,12}$/, 'wish:priorityMenu'],
    [/^w:pl:\d{1,12}:[0-3]$/, 'wish:prioritySet'],
    [/^w:cu:\d{1,12}:[A-Z]{3}$/, 'wish:currency'],
    [/^w:io:\d{1,12}$/, 'wish:imagesOrder'],
    [/^w:if:\d{1,12}:[0-8]:[0-9a-f]{8}$/, 'wish:imageFirst'],
    [/^w:v:\d{1,12}$/, 'wish:visibility'],
    [/^w:f:[tdilp]:\d{1,12}$/, 'wish:field'],
    [/^w:back:\d{1,12}$/, 'wish:back'],
    [/^w:add$/, 'wish:add'],
    [/^w:add:nl$/, 'wish:addNoLink'],
    [/^w:add:lk:\d{1,16}$/, 'wish:linkOffer'],
    [/^t:p:\d{1,12}:\d{1,9}$/, 'third:page'],
    [/^t:g:\d{1,12}$/, 'third:give'],
    [/^t:t:\d{1,12}$/, 'third:take'],
    [/^t:f:\d{1,12}(?::[0-4x])?$/, 'third:filter'],
    [/^g:p:\d{1,9}$/, 'give:page'],
    [/^g:r:\d{1,12}$/, 'give:remove'],
    [/^g:clean$/, 'give:clean'],
    [/^g:clean:y$/, 'give:cleanConfirm'],
    [/^a:[upb]$/, 'auth:type'],
    [/^p:rm$/, 'payments:remove'],
    [/^cur:[A-Z]{3}$/, 'currency'],
    [/^dsc:[pha]$/, 'disclosure:toggle'],
    [/^dsc:[ha]:y$/, 'disclosure:confirm'],
    [/^dlv:rm$/, 'delivery:remove'],
    [/^l:(?:uk|en|pl|auto)$/, 'language:set'],
    [/^imp:s:rw$/, 'import:source'],
    [/^imp:v:[hp]:\d{1,12}$/, 'import:visibility'],
    [/^imp:go:\d{1,12}$/, 'import:commit'],
    [/^imp:x:\d{1,12}$/, 'import:cancel'],
    [/^imp:r:\d{1,12}$/, 'import:refresh'],
    [/^x$/, 'noop']
];

const legacyCallbackPattern = /^[a-z]+(?:_[a-z0-9]+)*$/;
const navigationCallbackPattern = /^n:([a-z]+)$/;

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

export const normalizeTelemetryPath = (
    path: string,
    telegramWebhookPath: string | null
) => {
    if (
        path === telegramWebhookPath ||
        path.startsWith('/telegram/') ||
        path === '/telegram'
    ) {
        return TELEGRAM_WEBHOOK_TELEMETRY_PATH;
    }

    if (sharePagePathPattern.test(path)) {
        return SHARE_PAGE_TELEMETRY_PATH;
    }

    if (homePagePathPattern.test(path)) {
        return HOME_PAGE_TELEMETRY_PATH;
    }

    if (path === APP_TELEMETRY_PATH || path === `${APP_TELEMETRY_PATH}/`) {
        return APP_TELEMETRY_PATH;
    }

    for (const prefix of [
        APP_API_TELEMETRY_PATH,
        APP_IMAGE_TELEMETRY_PATH,
        SHARE_IMAGE_TELEMETRY_PATH,
        LINK_IMAGE_TELEMETRY_PATH
    ]) {
        if (path === prefix || path.startsWith(`${prefix}/`)) {
            return prefix;
        }
    }

    return knownPaths.has(path) ? path : '/unknown';
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const getTelegramUpdateType = (payload: unknown): TelegramUpdateType => {
    if (!isRecord(payload)) {
        return 'other';
    }

    if (isRecord(payload.message)) {
        return 'message';
    }

    if (isRecord(payload.callback_query)) {
        return 'callback_query';
    }

    if (isRecord(payload.my_chat_member)) {
        return 'my_chat_member';
    }

    return 'other';
};

export const getTelegramCommandCategory = (payload: unknown) => {
    if (!isRecord(payload) || !isRecord(payload.message)) {
        return 'nonCommand';
    }

    const { message } = payload;

    if (typeof message.text !== 'string') {
        if (isRecord(message.contact)) {
            return 'contact';
        }

        return Array.isArray(message.photo) ? 'photo' : 'nonCommand';
    }

    const match = /^\/([a-z]+)(?:@[^\s]+)?(?:\s|$)/i.exec(message.text.trim());

    if (!match?.[1]) {
        return 'message';
    }

    const command = match[1].toLowerCase();

    return commandCategories.has(command) ? command : 'otherCommand';
};

export const getCallbackDataCategory = (data: unknown) => {
    if (typeof data !== 'string' || data.length === 0 || data.length > 64) {
        return invalidLabel;
    }

    const navigationScreen = navigationCallbackPattern.exec(data)?.[1];

    if (navigationScreen !== undefined) {
        const screen = navigationScreens[navigationScreen];

        return screen === undefined ? invalidLabel : `nav:${screen}`;
    }

    const rule = callbackCategoryRules.find(([pattern]) => {
        return pattern.test(data);
    });

    if (rule) {
        return rule[1];
    }

    return legacyCallbackPattern.test(data) ? 'legacy' : invalidLabel;
};

export const getTelegramCallbackCategory = (payload: unknown) => {
    if (!isRecord(payload) || !isRecord(payload.callback_query)) {
        return undefined;
    }

    return getCallbackDataCategory(payload.callback_query.data);
};

const shipToNewRelic = (
    event: WideEvent,
    env: Pick<WorkerBindings, 'BOT_ENVIRONMENT' | 'NEW_RELIC_LICENSE_KEY'>,
    context: TelemetryContext
) => {
    const licenseKey = env.NEW_RELIC_LICENSE_KEY;

    if (env.BOT_ENVIRONMENT !== 'production' || !licenseKey) {
        return;
    }

    const delivery = Promise.resolve()
        .then(() => {
            const drain = createOTLPDrain({
                endpoint: 'https://otlp.eu01.nr-data.net',
                serviceName: 'wishlist',
                headers: { 'api-key': licenseKey },
                resourceAttributes: {
                    'deployment.environment.name': 'production'
                }
            });

            return drain({ event });
        })
        .catch(error => {
            console.warn(
                JSON.stringify({
                    event: 'new_relic_drain_failed',
                    errorType: getErrorType(error)
                })
            );
        });

    if (context) {
        context.waitUntil(delivery);
        return;
    }

    void delivery;
};

const toSafeLabel = (value: unknown) => {
    return typeof value === 'string' && safeLabelPattern.test(value)
        ? value
        : invalidLabel;
};

export const toWishlistAttributes = (
    fields: TelemetryFields,
    botEnvironment: WorkerBindings['BOT_ENVIRONMENT']
): Record<string, unknown> => {
    const { event, taskNames, ...rest } = fields;
    const attributes: Record<string, unknown> = { ...rest };

    for (const name of labelFieldNames) {
        if (attributes[name] !== undefined) {
            attributes[name] = toSafeLabel(attributes[name]);
        }
    }

    if (attributes.route !== undefined) {
        attributes.route = knownApiRoutes.has(String(attributes.route))
            ? attributes.route
            : invalidLabel;
    }

    if (typeof attributes.errorCode === 'string') {
        attributes.errorCode = knownApiErrorCodes.has(attributes.errorCode)
            ? attributes.errorCode
            : invalidLabel;
    }

    if (event === 'bot_action_completed' && attributes.channel === undefined) {
        attributes.channel = DEFAULT_ACTION_CHANNEL;
    }

    return {
        eventName: event,
        ...attributes,
        ...(taskNames === undefined ? {} : { taskNames: taskNames.join(',') }),
        botEnvironment
    };
};

export const emitTelemetryEvent = (
    env: WorkerBindings,
    context: TelemetryContext,
    fields: TelemetryFields
) => {
    try {
        const loggerOptions = {
            method: fields.method ?? 'WORKER',
            path: fields.path ?? '/internal/worker'
        };
        const logger = context
            ? createRequestLogger({
                  ...loggerOptions,
                  waitUntil: context.waitUntil.bind(context)
              })
            : createRequestLogger(loggerOptions);
        logger.set(toWishlistAttributes(fields, env.BOT_ENVIRONMENT));
        const event = logger.emit({
            environment: env.BOT_ENVIRONMENT,
            ...(fields.status === undefined ? {} : { status: fields.status })
        });

        if (event) {
            shipToNewRelic(event, env, context);
        }
    } catch (error) {
        console.warn(
            JSON.stringify({
                event: 'telemetry_emit_failed',
                errorType: getErrorType(error)
            })
        );
    }
};

export const emitSharePageServedTelemetry = (
    env: WorkerBindings,
    context: TelemetryContext,
    input: SharePageServedInput
) => {
    emitTelemetryEvent(env, context, {
        event: 'share_page_served',
        path: SHARE_PAGE_TELEMETRY_PATH,
        outcome: input.status >= 500 ? 'error' : 'success',
        ...input
    });
};

export const emitHttpRequestTelemetry = (
    request: Request,
    response: Response,
    env: WorkerBindings,
    context: ExecutionContext,
    startedAt: number
) => {
    const pathname = new URL(request.url).pathname;

    emitTelemetryEvent(env, context, {
        event: 'http_request_completed',
        method: request.method,
        path: normalizeTelemetryPath(pathname, getTelegramWebhookPath(env)),
        status: response.status,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        outcome: response.status >= 500 ? 'error' : 'success'
    });
};

export const appApiCompletedEvent = (input: {
    route: string;
    method: string;
    status: number;
    errorCode: ApiErrorCode | null;
    elapsedMs: number;
}): TelemetryFields => {
    return {
        event: 'app_api_completed',
        path: APP_API_TELEMETRY_PATH,
        route: input.route,
        method: input.method,
        status: input.status,
        outcome: input.status >= 500 ? 'error' : 'success',
        errorCode: input.errorCode,
        elapsedMs: input.elapsedMs
    };
};

export const appSessionStartedEvent = (input: {
    platform: AppPlatform;
    startKind: StartKind;
    isGuest: boolean;
    locale: Exclude<TelemetryLocale, 'auto'>;
    theme: AppTheme;
}): TelemetryFields => {
    return {
        event: 'app_session_started',
        path: APP_API_TELEMETRY_PATH,
        outcome: 'success',
        ...input
    };
};

export const appAuthRejectedEvent = (
    reason: AppAuthRejectionReason
): TelemetryFields => {
    return {
        event: 'app_auth_rejected',
        path: APP_API_TELEMETRY_PATH,
        outcome: 'rejected',
        reason
    };
};

export const appRateLimitedEvent = (
    bucket: RateLimitBucket
): TelemetryFields => {
    return {
        event: 'app_rate_limited',
        path: APP_API_TELEMETRY_PATH,
        outcome: 'rejected',
        bucket
    };
};

export const appRateLimiterMissingEvent = (
    bucket: RateLimitBucket,
    result: AppRateLimiterGap
): TelemetryFields => {
    return {
        event: 'app_rate_limiter_missing',
        path: APP_API_TELEMETRY_PATH,
        outcome: 'allowed',
        bucket,
        result
    };
};

export const appPhotoUploadedEvent = (
    result: AppPhotoUploadResult
): TelemetryFields => {
    return {
        event: 'app_photo_uploaded',
        path: APP_API_TELEMETRY_PATH,
        outcome:
            result === 'appended' || result === 'duplicate'
                ? 'success'
                : 'rejected',
        result
    };
};

const IMAGE_PROXY_TELEMETRY_PATHS = {
    app: APP_IMAGE_TELEMETRY_PATH,
    share: SHARE_IMAGE_TELEMETRY_PATH,
    import: LINK_IMAGE_TELEMETRY_PATH
} as const satisfies Record<ImageProxyScope, string>;

export const imageProxyServedEvent = (input: {
    scope: ImageProxyScope;
    result: ImageProxyResult;
    status: number;
    elapsedMs: number;
}): TelemetryFields => {
    return {
        event: 'image_proxy_served',
        path: IMAGE_PROXY_TELEMETRY_PATHS[input.scope],
        outcome: input.status >= 500 ? 'error' : 'success',
        ...input
    };
};

export const appClientEvent = (input: {
    kind: ClientEventKind;
    screen: ClientScreen;
    field?: ClientEventField;
    code?: FieldErrorCode;
}): TelemetryFields => {
    return {
        event: 'app_client_event',
        path: APP_API_TELEMETRY_PATH,
        outcome: 'success',
        ...input
    };
};

const LINK_IMPORT_OUTCOME_LABELS = {
    ok: 'success',
    partial: 'success',
    blocked: 'rejected',
    notProduct: 'rejected',
    invalidUrl: 'rejected',
    rateLimited: 'rejected',
    timeout: 'error'
} as const satisfies Record<LinkImportOutcome, string>;

export interface LinkImportCompletedInput {
    result: LinkImportOutcome;
    source: LinkImportSource | null;
    shop: LinkImportShop;
    cacheOutcome: Extract<ShareCacheOutcome, 'hit' | 'miss'>;
    imagesStaged: number;
    imagesSkipped: number;
    imagesIngested: number;
    elapsedMs: number;
}

export const linkImportCompletedEvent = (
    input: LinkImportCompletedInput & { channel: TelemetryChannel }
): TelemetryFields => {
    return {
        event: 'link_import_completed',
        path:
            input.channel === 'app'
                ? APP_API_TELEMETRY_PATH
                : TELEGRAM_WEBHOOK_TELEMETRY_PATH,
        outcome: LINK_IMPORT_OUTCOME_LABELS[input.result],
        channel: input.channel,
        result: input.result,
        ...(input.source === null ? {} : { source: input.source }),
        shop: input.shop,
        cacheOutcome: input.cacheOutcome,
        imagesStaged: toLinkImportImageBucket(input.imagesStaged),
        imagesSkipped: toLinkImportImageBucket(input.imagesSkipped),
        imagesIngested: toLinkImportImageBucket(input.imagesIngested),
        elapsedBucket: toLinkImportElapsedBucket(input.elapsedMs)
    };
};

const LIST_IMPORT_OUTCOME_LABELS = {
    ok: 'success',
    invalidUrl: 'rejected',
    userNotFound: 'rejected',
    privateCollection: 'rejected',
    schemaChanged: 'error',
    upstream: 'error',
    timeout: 'error',
    rateLimited: 'rejected',
    empty: 'rejected',
    busy: 'rejected',
    limitReached: 'rejected',
    expired: 'rejected'
} as const satisfies Record<ListImportOutcome, string>;

const LIST_IMPORT_DRAIN_OUTCOME_LABELS = {
    drained: 'success',
    budget: 'success',
    idle: 'success',
    rateLimited: 'rejected'
} as const satisfies Record<ListImportDrainOutcome, string>;

const toChannelPath = (channel: TelemetryChannel) => {
    return channel === 'app'
        ? APP_API_TELEMETRY_PATH
        : TELEGRAM_WEBHOOK_TELEMETRY_PATH;
};

export interface ListImportPreviewedInput {
    source: ListImportSource;
    kind: ListImportKind | null;
    result: ListImportOutcome;
    items: number;
    duplicates: number;
    elapsedMs: number;
}

export const listImportPreviewedEvent = (
    input: ListImportPreviewedInput & { channel: TelemetryChannel }
): TelemetryFields => {
    return {
        event: 'list_import_previewed',
        path: toChannelPath(input.channel),
        outcome: LIST_IMPORT_OUTCOME_LABELS[input.result],
        channel: input.channel,
        result: input.result,
        source: input.source,
        ...(input.kind === null ? {} : { kind: input.kind }),
        itemsBucket: toListImportCountBucket(input.items),
        duplicatesBucket: toListImportCountBucket(input.duplicates),
        elapsedBucket: toLinkImportElapsedBucket(input.elapsedMs)
    };
};

export interface ListImportCompletedInput {
    source: ListImportSource;
    kind: ListImportKind;
    visibility: ListImportVisibility;
    trigger: ListImportCommitTrigger;
    failure: ListImportFailure | null;
    created: number;
    gifted: number;
}

export const listImportCompletedEvent = (
    input: ListImportCompletedInput & { channel: TelemetryChannel }
): TelemetryFields => {
    const failed = input.failure !== null;

    return {
        event: 'list_import_completed',
        path: toChannelPath(input.channel),
        outcome: failed ? 'error' : 'success',
        channel: input.channel,
        result: failed ? 'failed' : 'success',
        ...(input.failure === null ? {} : { reason: input.failure }),
        source: input.source,
        kind: input.kind,
        visibility: input.visibility,
        trigger: input.trigger,
        createdBucket: toListImportCountBucket(input.created),
        giftedBucket: toListImportCountBucket(input.gifted)
    };
};

export interface ListImportPhotosDrainedInput {
    trigger: ListImportDrainTrigger;
    result: ListImportDrainOutcome;
    ingested: number;
    failed: number;
}

export const listImportPhotosDrainedEvent = (
    input: ListImportPhotosDrainedInput
): TelemetryFields => {
    return {
        event: 'list_import_photos_drained',
        outcome: LIST_IMPORT_DRAIN_OUTCOME_LABELS[input.result],
        trigger: input.trigger,
        result: input.result,
        ingestedBucket: toListImportCountBucket(input.ingested),
        failedBucket: toListImportCountBucket(input.failed)
    };
};
