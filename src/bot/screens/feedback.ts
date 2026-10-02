import type { Message, User } from 'telegraf/types';

import { getAdminMessages } from '../content/messages';
import { homeKeyboard } from '../content/keyboards';
import { FEEDBACK_MAX_LENGTH } from '../input/limits';
import { sendWithRetry } from '../runtime/send';
import type {
    BotRequest,
    CallbackTable,
    PendingInput,
    ScreenModule
} from '../runtime/types';
import { getErrorType } from '../errors';
import { escapeHtml } from '../utils/strings';
import {
    isTelegramBadRequest,
    isTelegramForbidden
} from '../utils/telegram-errors';
import { formatUserName, getMessageText } from '../utils/telegram';
import { screen as homeScreen } from './home';

export const formatFeedbackAuthor = (actor: User) => {
    const name = formatUserName(actor, 'name');
    const nick = actor.username ? `@${actor.username}` : null;

    return nick && nick !== name ? `${name} ${nick}` : name;
};

export const renderAdminFeedback = (actor: User, text: string) => {
    return getAdminMessages().feedback.message(
        escapeHtml(formatFeedbackAuthor(actor)),
        escapeHtml(text)
    );
};

const render = async (req: BotRequest) => {
    const { LL } = req;

    req.setSession({ ...req.session, pendingInput: { kind: 'feedback' } });
    await req.send.text(
        LL.feedback.description.title() + LL.feedback.description.points(),
        homeKeyboard(LL)
    );
};

const deliverToAdmin = async (req: BotRequest, html: string) => {
    const adminId = req.env.ADMIN_ID?.trim();

    if (!adminId) {
        console.warn(
            JSON.stringify({
                event: 'feedback_admin_missing',
                outcome: 'skipped'
            })
        );
        return true;
    }

    try {
        await sendWithRetry(() => {
            return req.ctx.telegram.sendMessage(adminId, html, {
                parse_mode: 'HTML'
            });
        });
    } catch (error) {
        if (!isTelegramForbidden(error) && !isTelegramBadRequest(error)) {
            throw error;
        }

        req.telemetry.internalFailure({
            event: 'feedback_delivery_failed',
            errorType: getErrorType(error)
        });

        return false;
    }

    return true;
};

const onInput = async (
    req: BotRequest,
    _input: PendingInput,
    message: Message
) => {
    const text = getMessageText(message)?.trim();

    if (!text) {
        await render(req);
        return;
    }

    if (Array.from(text).length > FEEDBACK_MAX_LENGTH) {
        await req.send.text(
            req.LL.feedback.errors.tooLong(String(FEEDBACK_MAX_LENGTH))
        );
        await render(req);
        return;
    }

    const delivered = await deliverToAdmin(
        req,
        renderAdminFeedback(req.actor, text)
    );

    req.setSession({ ...req.session, pendingInput: null });

    if (!delivered) {
        await req.send.text(req.LL.errors.unknown());
        await homeScreen.render(req, undefined);
        return;
    }

    req.telemetry.botActionCompleted({ action: 'feedback_sent' });
    await req.send.text(req.LL.feedback.success());
    await homeScreen.render(req, undefined);
};

export const screen: ScreenModule = {
    id: 'feedback',
    render,
    onInput
};

export const callbacks: CallbackTable = {};
