import { Effect } from 'effect';
import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';

import { createDb } from '../../db/client';
import { createRepositories } from '../../db/repositories';
import type { ExchangeRates } from '../../shared/money';
import type { WorkerBindings } from '../../worker/env';
import { decodeCallbackData } from '../callback-data';
import {
    appEntryButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { getMessages } from '../content/messages';
import { getLatestReleaseVersion } from '../content/releases';
import {
    getErrorType,
    isBotBlockedError,
    isBotUserError,
    type BotUserError
} from '../errors';
import {
    normalizeLanguageInput,
    resolveAppLocale,
    type AppLocale
} from '../i18n';
import {
    clearPendingInput,
    createBotRequest,
    createSessionHolder,
    type SessionHolder
} from '../runtime/context';
import {
    createDeferQueue,
    type DeferQueue,
    type Sleep,
    type WaitUntil
} from '../runtime/defer';
import {
    createRouter,
    KEYBOARD_PRESERVING_CALLBACK_TYPES,
    TOAST_CALLBACK_TYPES,
    type Router
} from '../runtime/router';
import { createSender, type RuntimeSender } from '../runtime/send';
import { loadSession, saveSessionIfChanged } from '../runtime/session-store';
import type {
    BotLinkImport,
    BotRequest,
    BotServices,
    CallbackAction,
    Repositories,
    ScreenExports,
    UserRecord,
    WishlistBotTelemetry
} from '../runtime/types';
import * as authScreen from '../screens/auth';
import * as currencyScreen from '../screens/currency';
import * as deliveryScreen from '../screens/delivery';
import * as disclosureScreen from '../screens/disclosure';
import * as donateScreen from '../screens/donate';
import * as feedbackScreen from '../screens/feedback';
import * as findListScreen from '../screens/find-list';
import * as giveListScreen from '../screens/give-list';
import * as homeScreen from '../screens/home';
import { applyLanguageChoice } from '../screens/language';
import * as languageScreen from '../screens/language';
import * as paymentsScreen from '../screens/payments';
import * as privacyScreen from '../screens/privacy';
import * as releasesScreen from '../screens/releases';
import * as settingsScreen from '../screens/settings';
import * as statsScreen from '../screens/stats';
import * as thirdWishlistScreen from '../screens/third-wishlist';
import * as wishAddScreen from '../screens/wish-add';
import * as wishEditScreen from '../screens/wish-edit';
import * as wishImagesScreen from '../screens/wish-images';
import * as wishPriorityScreen from '../screens/wish-priority';
import * as wishRemoveScreen from '../screens/wish-remove';
import * as wishlistScreen from '../screens/wishlist';
import { readExchangeRates } from '../services/exchange-rate-service';
import { createStatsService } from '../services/stats-service';
import { createUserService } from '../services/user-service';
import { escapeHtml } from '../utils/strings';
import { isTelegramForbidden } from '../utils/telegram-errors';
import { parseCommand, type ParsedCommand } from '../utils/telegram';

export type { WishlistBotTelemetry } from '../runtime/types';

export type BotExchangeRatesReader = (
    repository: Repositories['exchangeRates']
) => Promise<ExchangeRates>;

export interface WishlistBotDependencies {
    telemetry?: WishlistBotTelemetry | undefined;
    readExchangeRates?: BotExchangeRatesReader | undefined;
    waitUntil?: WaitUntil | undefined;
    sleep?: Sleep | undefined;
    repositories?: Repositories | undefined;
    publicOrigin?: string | undefined;
    linkImport?: BotLinkImport | undefined;
}

const SCREEN_MODULES: readonly ScreenExports[] = [
    homeScreen,
    privacyScreen,
    authScreen,
    feedbackScreen,
    statsScreen,
    donateScreen,
    paymentsScreen,
    languageScreen,
    releasesScreen,
    wishlistScreen,
    wishAddScreen,
    wishEditScreen,
    wishRemoveScreen,
    findListScreen,
    thirdWishlistScreen,
    giveListScreen,
    settingsScreen,
    currencyScreen,
    deliveryScreen,
    disclosureScreen,
    wishPriorityScreen,
    wishImagesScreen
];

const noopTelemetry: WishlistBotTelemetry = {
    botActionCompleted() {
        return undefined;
    },
    internalFailure() {
        return undefined;
    }
};

const logInternalFailure = (
    telemetry: WishlistBotTelemetry,
    event: 'generic_error_reply_failed' | 'telegraf_middleware_failed',
    error: unknown
) => {
    telemetry.internalFailure({ event, errorType: getErrorType(error) });
    console.error(JSON.stringify({ event, errorType: getErrorType(error) }));
};

interface UpdateRuntime {
    env: WorkerBindings;
    router: Router;
    telemetry: WishlistBotTelemetry;
    deps: WishlistBotDependencies;
}

interface UpdateScope {
    ctx: Context;
    actor: User;
    chatId: number;
    repos: Repositories;
    services: BotServices;
    sender: RuntimeSender;
    action: CallbackAction | null;
    fallbackLocale: AppLocale;
    holder: SessionHolder | null;
    req: BotRequest | null;
    deferQueue: DeferQueue | null;
}

const createServices = (
    repos: Repositories,
    linkImport: BotLinkImport | undefined
): BotServices => {
    return {
        users: createUserService({ repos }),
        stats: createStatsService({ repos }),
        ...(linkImport === undefined ? {} : { linkImport })
    };
};

const readStoredExchangeRates: BotExchangeRatesReader = repository => {
    return readExchangeRates({ repository });
};

const getCallbackData = (ctx: Context) => {
    const query = ctx.callbackQuery;

    return query && 'data' in query ? query.data : undefined;
};

const handleMyChatMember = async (ctx: Context, services: BotServices) => {
    const update = ctx.myChatMember;

    if (!update) {
        return;
    }

    const status = update.new_chat_member.status;

    if (status === 'kicked') {
        await services.users.markBlocked(update.chat.id);
        return;
    }

    if (status === 'member') {
        await services.users.clearBlockedByTelegramId(update.chat.id);
    }
};

const prepareCallback = async (
    sender: RuntimeSender,
    action: CallbackAction
) => {
    if (!TOAST_CALLBACK_TYPES.has(action.type)) {
        await sender.answerCallback();
    }

    if (!KEYBOARD_PRESERVING_CALLBACK_TYPES.has(action.type)) {
        await sender.removeKeyboard();
    }
};

const loadActor = async (
    repos: Repositories,
    services: BotServices,
    actor: User
) => {
    const [found, session] = await Promise.all([
        Effect.runPromise(repos.users.findByTelegramId(actor.id)),
        loadSession(repos, actor.id)
    ]);
    const user: UserRecord | null = found
        ? await services.users.syncProfile(found, actor)
        : null;

    return { user, session };
};

const dispatchCommand = async (
    req: BotRequest,
    router: Router,
    command: ParsedCommand
) => {
    clearPendingInput(req);

    switch (command.name) {
        case 'start':
            req.setSession({ ...req.session, pendingInput: null, find: null });
            await router.renderScreen(req, 'home');
            return;
        case 'lang': {
            const [raw] = command.args;

            if (raw === undefined) {
                await router.renderScreen(req, 'language');
                return;
            }

            const choice = normalizeLanguageInput(raw);

            if (choice === null) {
                await req.send.text(req.LL.language.invalid(escapeHtml(raw)));
                return;
            }

            await applyLanguageChoice(req, choice);
            return;
        }
        case 'releases':
            await router.renderScreen(req, 'releases');
            return;
        case 'app': {
            const appButton = appEntryButton(req);

            if (appButton === null) {
                await router.renderScreen(req, 'home');
                return;
            }

            await req.send.text(
                req.LL.appEntry.text(),
                singleColumnKeyboard([appButton])
            );
            return;
        }
        default:
            await router.renderScreen(req, 'home');
    }
};

const dispatchUpdate = async (scope: UpdateScope, runtime: UpdateRuntime) => {
    const { ctx, actor, repos, services, sender, action } = scope;

    if (action) {
        await prepareCallback(sender, action);
    }

    const readRates = runtime.deps.readExchangeRates ?? readStoredExchangeRates;
    const [{ user, session }, rates] = await Promise.all([
        loadActor(repos, services, actor),
        readRates(repos.exchangeRates)
    ]);
    const locale = resolveAppLocale(
        user ? user.language : session.language,
        actor.language_code ?? user?.telegramLanguageCode ?? null
    );
    const deferQueue = createDeferQueue({
        waitUntil: runtime.deps.waitUntil,
        sleep: runtime.deps.sleep,
        telemetry: runtime.telemetry
    });

    scope.fallbackLocale = locale;
    scope.holder = createSessionHolder(session.state);
    scope.req = createBotRequest(
        {
            ctx,
            env: runtime.env,
            locale,
            actor,
            user,
            sessionLanguage: session.language,
            publicOrigin: runtime.deps.publicOrigin,
            repos,
            rates,
            services,
            telemetry: runtime.telemetry,
            send: sender,
            defer: deferQueue.defer
        },
        scope.holder
    );
    scope.deferQueue = deferQueue;

    const command = parseCommand(ctx.message);

    if (command) {
        await dispatchCommand(scope.req, runtime.router, command);
        return;
    }

    if (action) {
        await runtime.router.dispatchCallback(scope.req, action);
        return;
    }

    if (ctx.message) {
        await runtime.router.dispatchInput(scope.req, ctx.message);
    }
};

const replyWithUserError = async (
    sender: RuntimeSender,
    error: BotUserError
) => {
    if (error.silent) {
        return;
    }

    await sender.text(error.html ? error.message : escapeHtml(error.message));
};

const replyWithUnknownError = async (
    scope: UpdateScope,
    runtime: UpdateRuntime
) => {
    const LL = scope.req?.LL ?? getMessages(scope.fallbackLocale);

    try {
        if (scope.req) {
            clearPendingInput(scope.req);
        }

        await scope.sender.text(LL.errors.unknown(), removeReplyKeyboard());

        if (scope.req) {
            await runtime.router.renderScreen(scope.req, 'home');
        }
    } catch (replyError) {
        logInternalFailure(
            runtime.telemetry,
            'generic_error_reply_failed',
            replyError
        );
    }
};

/**
 * Applies the C1 error policy and returns the error that must be rethrown
 * (so the route records a dispatch failure), or null when it was handled.
 */
const handleDispatchError = async (
    scope: UpdateScope,
    runtime: UpdateRuntime,
    error: unknown
): Promise<unknown> => {
    if (isBotBlockedError(error)) {
        return null;
    }

    if (isTelegramForbidden(error)) {
        await scope.services.users.markBlocked(scope.actor.id);
        return null;
    }

    if (isBotUserError(error)) {
        await replyWithUserError(scope.sender, error);
        return null;
    }

    await replyWithUnknownError(scope, runtime);

    return error;
};

const finalizeUpdate = async (scope: UpdateScope, runtime: UpdateRuntime) => {
    await scope.sender.answerCallback();

    if (scope.holder) {
        await saveSessionIfChanged(
            scope.repos,
            scope.actor.id,
            scope.holder.initial,
            scope.holder.current,
            new Date()
        );
    }

    if (!runtime.deps.waitUntil) {
        await scope.deferQueue?.flush();
    }
};

const handlePrivateUpdate = async (ctx: Context, runtime: UpdateRuntime) => {
    if (ctx.chat?.type !== 'private') {
        return;
    }

    const repos =
        runtime.deps.repositories ??
        createRepositories(createDb({ DB: runtime.env.DB }));
    const services = createServices(repos, runtime.deps.linkImport);

    if (ctx.myChatMember) {
        await handleMyChatMember(ctx, services);
        return;
    }

    const actor = ctx.from;

    if (!actor || actor.is_bot || (!ctx.message && !ctx.callbackQuery)) {
        return;
    }

    const scope: UpdateScope = {
        ctx,
        actor,
        chatId: ctx.chat.id,
        repos,
        services,
        sender: createSender({
            ctx,
            chatId: ctx.chat.id,
            sleep: runtime.deps.sleep,
            telemetry: runtime.telemetry,
            onForbidden: () => {
                return services.users.markBlocked(actor.id);
            }
        }),
        action: ctx.callbackQuery
            ? decodeCallbackData(getCallbackData(ctx))
            : null,
        fallbackLocale: resolveAppLocale(null, actor.language_code),
        holder: null,
        req: null,
        deferQueue: null
    };
    let failure: unknown = null;

    try {
        await dispatchUpdate(scope, runtime);
    } catch (error) {
        failure = await handleDispatchError(scope, runtime, error);
    }

    try {
        await finalizeUpdate(scope, runtime);
    } catch (finalizeError) {
        if (failure === null) {
            throw finalizeError;
        }

        console.error(
            JSON.stringify({
                event: 'update_finalize_failed',
                errorType: getErrorType(finalizeError)
            })
        );
    }

    if (failure !== null) {
        throw failure;
    }
};

export const createWishlistBot = (
    env: WorkerBindings,
    deps: WishlistBotDependencies = {}
) => {
    if (!env.BOT_TOKEN) {
        throw new Error('BOT_TOKEN is required to create the Telegram bot');
    }

    const bot = new Telegraf<Context>(env.BOT_TOKEN);
    const runtime: UpdateRuntime = {
        env,
        router: createRouter(SCREEN_MODULES),
        telemetry: deps.telemetry ?? noopTelemetry,
        deps
    };

    bot.catch(error => {
        logInternalFailure(
            runtime.telemetry,
            'telegraf_middleware_failed',
            error
        );
        throw error;
    });

    bot.use(ctx => {
        return handlePrivateUpdate(ctx, runtime);
    });

    return bot;
};

export const getCurrentReleaseVersion = () => {
    return getLatestReleaseVersion();
};
