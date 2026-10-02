import {
    homeButton,
    optionalUrlButton,
    singleColumnKeyboard
} from '../content/keyboards';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import { escapeHtml } from '../utils/strings';

const render = async (req: BotRequest) => {
    const { LL, env } = req;
    const { services } = LL.donate;

    await req.send.text(
        LL.donate.description({ paypal: escapeHtml(env.PAYPAL_EMAIL) }),
        singleColumnKeyboard([
            optionalUrlButton(
                services.buymeacoffee.title(),
                env.BUYMEACOFFEE_URL
            ),
            optionalUrlButton(services.monobank.title(), env.MONOBANK_URL),
            optionalUrlButton(LL.contacts.telegram(), env.TG_CHANNEL),
            homeButton(LL)
        ])
    );
};

export const screen: ScreenModule = {
    id: 'donate',
    render
};

export const callbacks: CallbackTable = {};
