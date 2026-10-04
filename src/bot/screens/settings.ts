import {
    homeButton,
    navigationButton,
    singleColumnKeyboard
} from '../content/keyboards';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import { getLanguageButtonLabel, screen as homeScreen } from './home';
import { isListImportAvailable } from './list-import';

const render = async (req: BotRequest) => {
    const { LL, user } = req;

    if (!user) {
        await homeScreen.render(req, undefined);
        return;
    }

    await req.send.text(
        `${LL.settings.title()}\n\n${LL.settings.description()}`,
        singleColumnKeyboard([
            navigationButton(LL.currency.title(), 'currency'),
            navigationButton(
                user.deliveryAddress
                    ? LL.delivery.title.update()
                    : LL.delivery.title.add(),
                'delivery'
            ),
            navigationButton(LL.disclosure.title(), 'disclosure'),
            navigationButton(LL.auth.title.user(), 'auth'),
            navigationButton(
                user.payments
                    ? LL.payments.title.update()
                    : LL.payments.title.add(),
                'payments'
            ),
            isListImportAvailable(req)
                ? navigationButton(LL.listImport.entry(), 'listImport')
                : null,
            navigationButton(getLanguageButtonLabel(LL), 'language'),
            homeButton(LL)
        ])
    );
};

export const screen: ScreenModule = {
    id: 'settings',
    render
};

export const callbacks: CallbackTable = {};
