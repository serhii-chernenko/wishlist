import {
    homeButton,
    optionalUrlButton,
    singleColumnKeyboard,
    urlButton
} from '../content/keyboards';
import { getSupportLinks } from '../content/support-links';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import { escapeHtml } from '../utils/strings';

const render = async (req: BotRequest) => {
    const { LL, env } = req;
    const supportButtons = getSupportLinks(env, LL).map(link => {
        return urlButton(link.title, link.url);
    });

    await req.send.text(
        LL.donate.description({ paypal: escapeHtml(env.PAYPAL_URL) }),
        singleColumnKeyboard([
            ...supportButtons,
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
