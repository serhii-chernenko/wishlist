import type { Message } from 'telegraf/types';

import type { TranslationFunctions } from '../../i18n/i18n-types';
import {
    callbackButton,
    contactRequestKeyboard,
    homeButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { deriveRequest } from '../runtime/context';
import type {
    AuthType,
    BotRequest,
    CallbackTable,
    PendingInput,
    ScreenModule,
    UserRecord
} from '../runtime/types';
import { getVisibilityType } from '../services/user-service';
import { escapeHtml } from '../utils/strings';
import { getMessageContact } from '../utils/telegram';
import { screen as homeScreen } from './home';

const AUTH_TYPES: readonly AuthType[] = ['username', 'phone', 'both'];

const renderUsernameNote = (LL: TranslationFunctions) => {
    return LL.auth.description.username({
        username: LL.auth.types.username(),
        both: LL.auth.types.both()
    });
};

export const renderAuthDescription = (
    LL: TranslationFunctions,
    user: UserRecord | null
) => {
    const general = LL.auth.description.general();
    const usernameNote = renderUsernameNote(LL);

    if (!user) {
        return general + LL.auth.description.guest() + usernameNote;
    }

    const visibility = getVisibilityType(user);
    const current =
        visibility === null
            ? ''
            : LL.auth.description.user(LL.auth.types[visibility]());

    return `${current}${usernameNote}\n\n${general}`;
};

const render = async (req: BotRequest) => {
    const { LL } = req;

    await req.send.text(
        renderAuthDescription(LL, req.user),
        singleColumnKeyboard([
            ...AUTH_TYPES.map(authType => {
                return callbackButton(LL.auth.types[authType](), {
                    type: 'authType',
                    authType
                });
            }),
            homeButton(LL)
        ])
    );
};

const promptForContact = async (
    req: BotRequest,
    authType: 'phone' | 'both'
) => {
    req.setSession({
        ...req.session,
        pendingInput: { kind: 'contact', authType }
    });
    await req.send.text(
        req.LL.auth.sendNumber.description(),
        contactRequestKeyboard(req.LL.auth.sendNumber.title())
    );
};

const renderMissingUsername = async (req: BotRequest) => {
    req.setSession({ ...req.session, pendingInput: null });
    await req.send.text(req.LL.auth.errors.username(), removeReplyKeyboard());
    await homeScreen.render(req, undefined);
};

const renderSuccessDetails = (
    LL: TranslationFunctions,
    authType: AuthType,
    username: string | null,
    phone: string | null
) => {
    const safeUsername = escapeHtml(username ?? '');
    const safePhone = escapeHtml(phone ?? '');

    switch (authType) {
        case 'username':
            return LL.auth.success.username(safeUsername);
        case 'phone':
            return LL.auth.success.phone(safePhone);
        case 'both':
            return LL.auth.success.both(safeUsername, safePhone);
    }
};

const completeVisibility = async (
    req: BotRequest,
    authType: AuthType,
    phone: string | null,
    via?: 'app'
) => {
    const result = await req.services.users.saveVisibility({
        actor: req.actor,
        user: req.user,
        sessionLanguage: req.sessionLanguage,
        authType,
        phone
    });
    const { LL } = req;

    req.setSession({ ...req.session, pendingInput: null });
    req.telemetry.botActionCompleted({
        action: result.created ? 'user_registered' : 'visibility_changed',
        result: authType
    });

    if (via === 'app') {
        await req.send.text(LL.auth.success.app());
        return;
    }

    const prefix = result.created
        ? LL.auth.success.guest()
        : LL.auth.success.user();

    await req.send.text(
        prefix +
            renderSuccessDetails(
                LL,
                authType,
                req.actor.username ?? null,
                phone
            ),
        removeReplyKeyboard()
    );
    await homeScreen.render(
        deriveRequest(req, { user: result.user }),
        undefined
    );
};

export type ContactCheck =
    | { ok: true; phone: string }
    | { ok: false; reason: 'missing' | 'foreign' };

export const checkOwnContact = (
    message: Message,
    actorId: number
): ContactCheck => {
    const contact = getMessageContact(message);

    if (!contact?.phone_number) {
        return { ok: false, reason: 'missing' };
    }

    if (contact.user_id !== actorId) {
        return { ok: false, reason: 'foreign' };
    }

    return { ok: true, phone: contact.phone_number };
};

const onInput = async (
    req: BotRequest,
    input: PendingInput,
    message: Message
) => {
    if (input.kind !== 'contact') {
        req.setSession({ ...req.session, pendingInput: null });
        await homeScreen.render(req, undefined);
        return;
    }

    const contact = checkOwnContact(message, req.actor.id);

    if (!contact.ok) {
        await req.send.text(
            contact.reason === 'foreign'
                ? req.LL.auth.errors.foreignContact()
                : req.LL.auth.errors.phone()
        );

        if (input.via === 'app') {
            req.setSession({ ...req.session, pendingInput: null });
            return;
        }

        await promptForContact(req, input.authType);
        return;
    }

    if (input.authType === 'both' && !req.actor.username) {
        if (input.via === 'app') {
            req.setSession({ ...req.session, pendingInput: null });
            await req.send.text(
                req.LL.auth.errors.username(),
                removeReplyKeyboard()
            );
            return;
        }

        await renderMissingUsername(req);
        return;
    }

    await completeVisibility(req, input.authType, contact.phone, input.via);
};

export const screen: ScreenModule = {
    id: 'auth',
    render,
    onInput
};

export const callbacks: CallbackTable = {
    async authType(req, action) {
        const { authType } = action;

        if (authType !== 'phone' && !req.actor.username) {
            await renderMissingUsername(req);
            return;
        }

        if (authType === 'username') {
            await completeVisibility(req, authType, null);
            return;
        }

        await promptForContact(req, authType);
    }
};
