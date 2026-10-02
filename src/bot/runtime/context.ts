import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';

import type { WorkerBindings } from '../../worker/env';
import { getMessages } from '../content/messages';
import type { AppLocale } from '../i18n';
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
    readonly initial: SessionState;
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
    repos: Repositories;
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
        get session() {
            return holder.current;
        },
        isAdmin: isAdminActor(seed.env, seed.actor),
        repos: seed.repos,
        services: seed.services,
        telemetry: seed.telemetry,
        send: seed.send,
        defer: seed.defer,
        setSession(next) {
            holder.current = next;
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
    const derived: BotRequest = {
        ...req,
        ...patch,
        locale,
        LL: locale === req.locale ? req.LL : getMessages(locale)
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
