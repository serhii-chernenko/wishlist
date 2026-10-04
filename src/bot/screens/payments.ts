import { Effect } from 'effect';
import type { Message } from 'telegraf/types';

import {
    callbackButton,
    homeButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { PAYMENTS_MAX_LENGTH, truncateWithMark } from '../input/limits';
import { isValidPayments } from '../input/payments';
import { deriveRequest } from '../runtime/context';
import type {
    BotRequest,
    CallbackTable,
    PendingInput,
    ScreenModule
} from '../runtime/types';
import { escapeHtml } from '../utils/strings';
import { getMessageText } from '../utils/telegram';
import { screen as homeScreen } from './home';

const render = async (req: BotRequest) => {
    const { LL, user } = req;

    if (!user) {
        await homeScreen.render(req, undefined);
        return;
    }

    const current = user.payments
        ? `\n\n${LL.payments.description.update(escapeHtml(truncateWithMark(user.payments, PAYMENTS_MAX_LENGTH)))}`
        : '';

    req.setSession({ ...req.session, pendingInput: { kind: 'payments' } });
    await req.send.text(
        LL.payments.description.add({ current }),
        singleColumnKeyboard([
            user.payments
                ? callbackButton(LL.actions.remove(), {
                      type: 'paymentsRemove'
                  })
                : null,
            homeButton(LL)
        ])
    );
};

const onInput = async (
    req: BotRequest,
    _input: PendingInput,
    message: Message
) => {
    const { LL, user } = req;
    const payments = getMessageText(message)?.trim() ?? '';

    if (!user) {
        req.setSession({ ...req.session, pendingInput: null });
        await homeScreen.render(req, undefined);
        return;
    }

    if (Array.from(payments).length > PAYMENTS_MAX_LENGTH) {
        await req.send.text(
            LL.payments.edit.tooLong(String(PAYMENTS_MAX_LENGTH)),
            removeReplyKeyboard()
        );
        await render(req);
        return;
    }

    if (!isValidPayments(payments)) {
        await req.send.text(LL.payments.edit.error(), removeReplyKeyboard());
        await render(req);
        return;
    }

    await Effect.runPromise(req.repos.users.setPayments(user.id, payments));
    req.setSession({ ...req.session, pendingInput: null });
    req.telemetry.botActionCompleted({ action: 'payments_updated' });
    await req.send.text(LL.payments.edit.success(), removeReplyKeyboard());
    await homeScreen.render(
        deriveRequest(req, { user: { ...user, payments } }),
        undefined
    );
};

export const screen: ScreenModule = {
    id: 'payments',
    render,
    onInput
};

export const callbacks: CallbackTable = {
    async paymentsRemove(req) {
        const { LL, user } = req;

        if (!user) {
            await homeScreen.render(req, undefined);
            return;
        }

        await Effect.runPromise(req.repos.users.setPayments(user.id, null));
        req.telemetry.botActionCompleted({ action: 'payments_removed' });
        await req.send.text(
            LL.payments.remove.success(),
            removeReplyKeyboard()
        );
        await homeScreen.render(
            deriveRequest(req, { user: { ...user, payments: null } }),
            undefined
        );
    }
};
