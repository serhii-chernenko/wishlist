import type { TranslationFunctions } from '../../i18n/i18n-types';
import {
    appEntryButton,
    callbackButton,
    navigationButton,
    singleColumnKeyboard
} from '../content/keyboards';
import type {
    BotRequest,
    CallbackTable,
    ScreenModule,
    UserRecord
} from '../runtime/types';

export const getLanguageButtonLabel = (LL: TranslationFunctions) => {
    return `${LL.actions.language()} ${LL.language.title()}`;
};

const guestKeyboard = (req: BotRequest) => {
    const { LL } = req;

    return singleColumnKeyboard([
        appEntryButton(req),
        navigationButton(LL.auth.title.guest(), 'auth'),
        navigationButton(LL.privacy.title(), 'privacy'),
        navigationButton(LL.feedback.title(), 'feedback'),
        navigationButton(LL.stats.action(), 'stats'),
        navigationButton(LL.releases.title(), 'releases'),
        navigationButton(LL.donate.title(), 'donate'),
        navigationButton(getLanguageButtonLabel(LL), 'language')
    ]);
};

const userKeyboard = (req: BotRequest, user: UserRecord) => {
    const { LL } = req;

    return singleColumnKeyboard([
        appEntryButton(req),
        navigationButton(LL.wishlist.title(), 'wishlist'),
        navigationButton(LL.giveList.title(), 'giveList'),
        navigationButton(LL.findList.title(), 'findList'),
        callbackButton(LL.actions.share(), { type: 'wishlistShare' }),
        navigationButton(LL.settings.title(), 'settings'),
        navigationButton(LL.auth.title.user(), 'auth'),
        navigationButton(
            user.payments
                ? LL.payments.title.update()
                : LL.payments.title.add(),
            'payments'
        ),
        navigationButton(
            user.deliveryAddress
                ? LL.delivery.title.update()
                : LL.delivery.title.add(),
            'delivery'
        ),
        navigationButton(LL.privacy.title(), 'privacy'),
        navigationButton(LL.feedback.title(), 'feedback'),
        navigationButton(LL.stats.action(), 'stats'),
        navigationButton(LL.releases.title(), 'releases'),
        navigationButton(LL.donate.title(), 'donate'),
        navigationButton(getLanguageButtonLabel(LL), 'language')
    ]);
};

const render = async (req: BotRequest) => {
    const { LL, user } = req;

    if (!user) {
        await req.send.text(
            `${LL.greeting.general()}\n\n${LL.greeting.guest()}`,
            guestKeyboard(req)
        );
        return;
    }

    await req.send.text(LL.greeting.user(), userKeyboard(req, user));
};

export const screen: ScreenModule = {
    id: 'home',
    render
};

export const callbacks: CallbackTable = {};
