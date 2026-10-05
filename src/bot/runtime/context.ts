import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';

import {
    FALLBACK_RATES,
    resolveDisplayCurrency,
    type ExchangeRates
} from '../../shared/money';
import type { WorkerBindings } from '../../worker/env';
import { getMessages } from '../content/messages';
import type { AppLocale } from '../i18n';
import { saveSessionIfChanged } from './session-store';
import type {
    BotRequest,
    BotServices,
    Repositories,
    Sender,
    SessionState,
    UserRecord,
    WishlistBotTelemetry
} from './types';

export interface SessionHolder {
    initial: SessionState;
    current: SessionState;
}

export const createSessionHolder = (initial: SessionState): SessionHolder => {
    return { initial, current: initial };
};

export interface RequestSeed {
    ctx: Context;
    env: WorkerBindings;
    locale: AppLocale;
    actor: User;
    user: UserRecord | null;
    sessionLanguage: AppLocale | null;
    publicOrigin?: string | undefined;
    repos: Repositories;
    rates?: ExchangeRates | undefined;
    services: BotServices;
    telemetry: WishlistBotTelemetry;
    send: Sender;
    defer(task: () => Promise<void>, delayMs: number): void;
}

export const isAdminActor = (env: WorkerBindings, actor: User) => {
    const adminId = env.ADMIN_ID?.trim();

    return Boolean(adminId) && String(actor.id) === adminId;
};

export const createBotRequest = (
    seed: RequestSeed,
    holder: SessionHolder
): BotRequest => {
    return {
        ctx: seed.ctx,
        env: seed.env,
        locale: seed.locale,
        LL: getMessages(seed.locale),
        actor: seed.actor,
        user: seed.user,
        sessionLanguage: seed.sessionLanguage,
        ...(seed.publicOrigin === undefined
            ? {}
            : { publicOrigin: seed.publicOrigin }),
        get session() {
            return holder.current;
        },
        isAdmin: isAdminActor(seed.env, seed.actor),
        repos: seed.repos,
        rates: seed.rates ?? FALLBACK_RATES,
        displayCurrency: resolveDisplayCurrency(
            seed.user?.currency,
            seed.locale
        ),
        services: seed.services,
        telemetry: seed.telemetry,
        send: seed.send,
        defer: seed.defer,
        setSession(next) {
            holder.current = next;
        },
        async persistSession(now) {
            const next = holder.current;

            await saveSessionIfChanged(
                seed.repos,
                seed.actor.id,
                holder.initial,
                next,
                now
            );
            holder.initial = next;
        }
    };
};

export type RequestPatch = Partial<
    Pick<BotRequest, 'user' | 'locale' | 'sessionLanguage'>
>;

/**
 * Copies a request with a fresh user, locale or session language while keeping
 * the live session state shared with the original request.
 */
export const deriveRequest = (
    req: BotRequest,
    patch: RequestPatch
): BotRequest => {
    const locale = patch.locale ?? req.locale;
    const user = patch.user === undefined ? req.user : patch.user;
    const derived: BotRequest = {
        ...req,
        ...patch,
        locale,
        LL: locale === req.locale ? req.LL : getMessages(locale),
        displayCurrency: resolveDisplayCurrency(user?.currency, locale)
    };

    return Object.defineProperty(derived, 'session', {
        get() {
            return req.session;
        },
        enumerable: true,
        configurable: true
    });
};

export const clearPendingInput = (req: BotRequest) => {
    if (req.session.pendingInput !== null) {
        req.setSession({ ...req.session, pendingInput: null });
    }
};
