import type { Message } from 'telegraf/types';

import { homeKeyboard } from '../content/keyboards';
import { FEEDBACK_MAX_LENGTH } from '../input/limits';
import type {
    BotRequest,
    CallbackTable,
    PendingInput,
    ScreenModule
} from '../runtime/types';
import { deliver } from '../services/feedback-service';
import { getMessageText } from '../utils/telegram';
import { screen as homeScreen } from './home';

const render = async (req: BotRequest) => {
    const { LL } = req;

    req.setSession({ ...req.session, pendingInput: { kind: 'feedback' } });
    await req.send.text(
        LL.feedback.description.title() + LL.feedback.description.points(),
        homeKeyboard(LL)
    );
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

    const delivery = await deliver(
        req.ctx.telegram,
        req.env.ADMIN_ID,
        req.actor,
        text,
        'bot'
    );

    req.setSession({ ...req.session, pendingInput: null });

    if (delivery.status === 'notDelivered') {
        req.telemetry.internalFailure({
            event: 'feedback_delivery_failed',
            errorType: delivery.errorType
        });
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
