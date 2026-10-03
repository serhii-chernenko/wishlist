import { Effect } from 'effect';

import { resolveAppLocale, type AppLocale } from '../../bot/i18n';
import { PAYMENTS_MAX_LENGTH } from '../../bot/input/limits';
import { isValidPayments } from '../../bot/input/payments';
import { decodeSessionLanguage } from '../../bot/runtime/session-store';
import { createUserService } from '../../bot/services/user-service';
import type { UserRecord } from '../../db/repositories';
import type {
    AppLanguageChoice,
    ContactVisibilityType,
    LanguageResultDto
} from '../../shared/app-api';
import { requireUser, type ApiContext, type ApiHandler } from '../context';
import { getAppMessages, resolveRequestLocale, toMeDto } from '../dto';
import { ApiError } from '../errors';
import { emitAppAction } from '../telemetry';
import { createBodyReader, readJsonBody, validationError } from '../validate';

const LANGUAGE_CHOICES: readonly AppLanguageChoice[] = [
    'uk',
    'en',
    'pl',
    'auto'
];

const CONTACT_TYPES: readonly ContactVisibilityType[] = ['phone', 'both'];

export const loadSessionLanguage = async (
    c: ApiContext
): Promise<AppLocale | null> => {
    if (c.var.user !== null) {
        return null;
    }

    const session = await Effect.runPromise(
        c.var.repos.sessions.get(c.var.actor.id)
    );

    return decodeSessionLanguage(session?.language);
};

const respondWithMe = (
    c: ApiContext,
    user: UserRecord | null,
    sessionLanguage: AppLocale | null
) => {
    const { actor } = c.var;
    const locale = resolveRequestLocale(actor, user, sessionLanguage);

    return c.json(toMeDto({ actor, user, sessionLanguage, locale }));
};

const noContent = (c: ApiContext) => {
    return c.body(null, 204);
};

export const getMe: ApiHandler = async c => {
    return respondWithMe(c, c.var.user, await loadSessionLanguage(c));
};

export const setVisibility: ApiHandler = async c => {
    const { actor, deps, repos, user } = c.var;
    const reader = createBodyReader(await readJsonBody(c));

    reader.requiredOneOf('type', ['username']);
    reader.finish();

    if (!actor.username) {
        throw validationError('type', 'usernameRequired');
    }

    const sessionLanguage = await loadSessionLanguage(c);
    const result = await createUserService({
        repos,
        now: deps.now
    }).saveVisibility({
        actor,
        user,
        sessionLanguage,
        authType: 'username',
        phone: null
    });

    emitAppAction(
        c,
        result.created ? 'user_registered' : 'visibility_changed',
        { result: 'username' }
    );

    return respondWithMe(c, result.user, sessionLanguage);
};

export const startContactIntent: ApiHandler = async c => {
    const { actor, deps, repos } = c.var;
    const reader = createBodyReader(await readJsonBody(c));
    const type = reader.requiredOneOf('type', CONTACT_TYPES);

    reader.finish();

    if (type === undefined) {
        throw new ApiError('validation');
    }

    if (type === 'both' && !actor.username) {
        throw validationError('type', 'usernameRequired');
    }

    await Effect.runPromise(
        repos.sessions.setPendingContact(actor.id, type, deps.now())
    );

    return noContent(c);
};

export const cancelContactIntent: ApiHandler = async c => {
    const { actor, deps, repos } = c.var;

    await Effect.runPromise(
        repos.sessions.clearPendingContact(actor.id, deps.now())
    );

    return noContent(c);
};

export const setLanguage: ApiHandler = async c => {
    const { actor, deps, repos, user } = c.var;
    const reader = createBodyReader(await readJsonBody(c));
    const choice = reader.requiredOneOf('choice', LANGUAGE_CHOICES);

    reader.finish();

    if (choice === undefined) {
        throw new ApiError('validation');
    }

    const updatedUser = await createUserService({
        repos,
        now: deps.now
    }).setLanguage({ actor, user, choice });
    const sessionLanguage = user === null && choice !== 'auto' ? choice : null;
    const locale = resolveAppLocale(
        choice === 'auto' ? null : choice,
        actor.language_code ?? user?.telegramLanguageCode ?? null
    );
    const body: LanguageResultDto = {
        me: toMeDto({ actor, user: updatedUser, sessionLanguage, locale }),
        messages: getAppMessages(locale)
    };

    emitAppAction(c, 'language_changed', { result: choice });

    return c.json(body);
};

const readPaymentsText = async (c: ApiContext) => {
    const body = await readJsonBody(c);

    if (typeof body.text === 'string' && body.text.trim().length === 0) {
        throw validationError('text', 'tooShort');
    }

    const reader = createBodyReader(body);
    const text = reader.requiredString('text', {
        maxLength: PAYMENTS_MAX_LENGTH
    });

    reader.finish();

    if (text === undefined || !isValidPayments(text)) {
        throw validationError('text', 'tooShort');
    }

    return text;
};

const savePayments = async (
    c: ApiContext,
    user: UserRecord,
    payments: string | null
) => {
    await Effect.runPromise(
        c.var.repos.users.setPayments(user.id, payments, c.var.deps.now())
    );

    return respondWithMe(c, { ...user, payments }, null);
};

export const setPayments: ApiHandler = async c => {
    const user = requireUser(c);
    const text = await readPaymentsText(c);
    const response = await savePayments(c, user, text);

    emitAppAction(c, 'payments_updated');

    return response;
};

export const removePayments: ApiHandler = async c => {
    const user = requireUser(c);
    const response = await savePayments(c, user, null);

    emitAppAction(c, 'payments_removed');

    return response;
};
