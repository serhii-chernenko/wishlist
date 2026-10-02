import { createRequestLogger, type WideEvent } from 'evlog';
import { createOTLPDrain } from 'evlog/otlp';
import { initWorkersLogger } from 'evlog/workers';

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
    | {
          waitUntil(promise: Promise<unknown>): void;
      }
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
    | 'wishlist_filtered'
    | 'wishlist_searched'
    | 'give_added'
    | 'give_removed'
    | 'give_list_cleaned'
    | 'payments_updated'
    | 'payments_removed'
    | 'feedback_sent'
    | 'language_changed';

export type TelemetryLocale = 'uk' | 'en' | 'pl' | 'auto';

type TelemetryFields = {
    event: string;
    method?: string;
    path?: string;
    status?: number;
    durationMs?: number;
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
    errorCode?: number | null;
    delaySeconds?: number;
    attempts?: number;
    reason?: string;
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
    totalWishes?: number;
    activeWishes?: number;
    hiddenWishes?: number;
    priorityWishes?: number;
    doneWishes?: number;
    gives?: number;
    usersWithPayments?: number;
};

const knownPaths = new Set(['/', '/health', '/admin/release-broadcast']);

const commandCategories = new Set(['start', 'lang', 'releases']);

const labelFieldNames = [
    'commandCategory',
    'updateType',
    'callbackCategory',
    'rejectionReason',
    'reason',
    'action',
    'result',
    'field',
    'locale',
    'outcome',
    'idempotencyOutcome'
] as const;

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
    rel: 'releases'
};

const callbackCategoryRules: readonly (readonly [RegExp, string])[] = [
    [/^wl:p:\d{1,9}$/, 'wishlist:page'],
    [/^wl:clean$/, 'wishlist:clean'],
    [/^wl:clean:y$/, 'wishlist:cleanConfirm'],
    [/^wl:share$/, 'wishlist:share'],
    [/^wl:f(?::[0-4x])?$/, 'wishlist:filter'],
    [/^w:e:\d{1,12}$/, 'wish:edit'],
    [/^w:r:\d{1,12}$/, 'wish:remove'],
    [/^w:r:y:\d{1,12}$/, 'wish:removeDone'],
    [/^w:r:n:\d{1,12}$/, 'wish:removeNotDone'],
    [/^w:t:\d{1,12}$/, 'wish:priority'],
    [/^w:v:\d{1,12}$/, 'wish:visibility'],
    [/^w:f:[tdilp]:\d{1,12}$/, 'wish:field'],
    [/^w:back:\d{1,12}$/, 'wish:back'],
    [/^w:add$/, 'wish:add'],
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
    [/^l:(?:uk|en|pl|auto)$/, 'language:set'],
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
        return '/telegram/webhook';
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
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: response.status >= 500 ? 'error' : 'success'
    });
};
