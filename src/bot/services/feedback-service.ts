import type { User } from 'telegraf/types';

import { getAdminMessages } from '../content/messages';
import { getErrorType } from '../errors';
import { sendWithRetry } from '../runtime/send';
import { escapeHtml } from '../utils/strings';
import {
    isTelegramBadRequest,
    isTelegramForbidden
} from '../utils/telegram-errors';
import { formatUserName } from '../utils/telegram';

export type FeedbackSource = 'bot' | 'app';

export type FeedbackDelivery =
    | { status: 'delivered' }
    | { status: 'skipped' }
    | { status: 'notDelivered'; errorType: string };

export interface FeedbackTransport {
    sendMessage(
        chatId: string,
        html: string,
        extra: { parse_mode: 'HTML' }
    ): Promise<unknown>;
}

const APP_SOURCE_TAG = '#app';

export const formatFeedbackAuthor = (actor: User) => {
    const name = formatUserName(actor, 'name');
    const nick = actor.username ? `@${actor.username}` : null;

    return nick && nick !== name ? `${name} ${nick}` : name;
};

export const renderAdminFeedback = (
    actor: User,
    text: string,
    source: FeedbackSource = 'bot'
) => {
    const message = getAdminMessages().feedback.message(
        escapeHtml(formatFeedbackAuthor(actor)),
        escapeHtml(text)
    );

    return source === 'app' ? `${message}\n\n${APP_SOURCE_TAG}` : message;
};

export const deliver = async (
    transport: FeedbackTransport,
    adminId: string | undefined,
    actor: User,
    text: string,
    source: FeedbackSource
): Promise<FeedbackDelivery> => {
    const target = adminId?.trim();

    if (!target) {
        console.warn(
            JSON.stringify({
                event: 'feedback_admin_missing',
                outcome: 'skipped'
            })
        );
        return { status: 'skipped' };
    }

    try {
        await sendWithRetry(() => {
            return transport.sendMessage(
                target,
                renderAdminFeedback(actor, text, source),
                { parse_mode: 'HTML' }
            );
        });
    } catch (error) {
        if (!isTelegramForbidden(error) && !isTelegramBadRequest(error)) {
            throw error;
        }

        return { status: 'notDelivered', errorType: getErrorType(error) };
    }

    return { status: 'delivered' };
};
