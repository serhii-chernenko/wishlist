import { Effect } from 'effect';
import type { User } from 'telegraf/types';

import type { SeenChannel } from '../../db/repositories';
import { getLatestReleaseVersion } from '../content/releases';
import { getDefaultCurrency, type Currency } from '../../shared/money';
import { resolveAppLocale, type AppLocale } from '../i18n';
import type {
    AuthType,
    LanguageChoice,
    Repositories,
    UserRecord
} from '../runtime/types';
import { stripNonDigits } from '../utils/strings';

export interface VisibilityRequest {
    actor: User;
    user: UserRecord | null;
    sessionLanguage: AppLocale | null;
    authType: AuthType;
    phone: string | null;
}

export interface VisibilityResult {
    user: UserRecord;
    created: boolean;
}

const buildVisibility = (request: VisibilityRequest) => {
    const username = request.actor.username ?? null;
    const usernameSearchable = request.authType !== 'phone';

    if (usernameSearchable && !username) {
        throw new Error('A Telegram username is required for this visibility');
    }

    if (request.authType !== 'username' && !request.phone) {
        throw new Error('A phone number is required for this visibility');
    }

    const phone = request.authType === 'username' ? null : request.phone;

    return {
        usernameSearchable,
        phone,
        phoneDigits: phone === null ? null : stripNonDigits(phone),
        username
    };
};

export const getVisibilityType = (user: UserRecord | null): AuthType | null => {
    if (!user) {
        return null;
    }

    const findableByUsername =
        user.usernameSearchable && Boolean(user.username);
    const findableByPhone = Boolean(user.phone);

    if (findableByUsername && findableByPhone) {
        return 'both';
    }

    if (findableByUsername) {
        return 'username';
    }

    return findableByPhone ? 'phone' : null;
};

export const getStoredLanguageChoice = (
    user: UserRecord | null,
    sessionLanguage: AppLocale | null
): LanguageChoice => {
    const stored = user ? user.language : sessionLanguage;

    return stored ?? 'auto';
};

export const createUserService = (deps: {
    repos: Repositories;
    now?: () => Date;
}) => {
    const { repos } = deps;
    const now = deps.now ?? (() => new Date());

    return {
        async syncProfile(
            user: UserRecord,
            actor: User,
            channel: SeenChannel = 'bot'
        ) {
            const synced = await Effect.runPromise(
                repos.users.syncProfile(user.id, {
                    username: actor.username ?? null,
                    telegramLanguageCode: actor.language_code ?? null,
                    now: now(),
                    channel
                })
            );

            return synced ?? user;
        },
        async saveVisibility(
            request: VisibilityRequest
        ): Promise<VisibilityResult> {
            const visibility = buildVisibility(request);

            if (request.user) {
                const updated = await Effect.runPromise(
                    repos.users.setVisibility(
                        request.user.id,
                        visibility,
                        now()
                    )
                );

                if (!updated) {
                    throw new Error('Failed to update user visibility');
                }

                return { user: updated, created: false };
            }

            const timestamp = now();
            const created = await Effect.runPromise(
                repos.users.create({
                    telegramId: request.actor.id,
                    ...visibility,
                    language: request.sessionLanguage,
                    currency: getDefaultCurrency(
                        resolveAppLocale(
                            request.sessionLanguage,
                            request.actor.language_code
                        )
                    ),
                    telegramLanguageCode: request.actor.language_code ?? null,
                    releaseVersion: getLatestReleaseVersion(),
                    lastSeenAt: timestamp,
                    createdAt: timestamp,
                    updatedAt: timestamp
                })
            );

            if (!created) {
                throw new Error('Failed to register user');
            }

            return { user: created, created: true };
        },
        async setLanguage(input: {
            actor: User;
            user: UserRecord | null;
            choice: LanguageChoice;
        }) {
            const language = input.choice === 'auto' ? null : input.choice;

            if (input.user) {
                await Effect.runPromise(
                    repos.users.setLanguage(input.user.id, language, now())
                );

                return { ...input.user, language };
            }

            await Effect.runPromise(
                repos.sessions.setLanguage(input.actor.id, language, now())
            );

            return null;
        },
        async setCurrency(user: UserRecord, currency: Currency) {
            return Effect.runPromise(
                repos.users.setCurrency(user.id, currency, now())
            );
        },
        async markBlocked(telegramId: number) {
            await Effect.runPromise(
                repos.users.markBlockedByTelegramId(telegramId, now())
            );
        },
        async clearBlockedByTelegramId(telegramId: number) {
            const user = await Effect.runPromise(
                repos.users.findByTelegramId(telegramId)
            );

            if (user?.blockedAt) {
                await Effect.runPromise(repos.users.clearBlocked(user.id));
            }
        }
    };
};

export type UserService = ReturnType<typeof createUserService>;
