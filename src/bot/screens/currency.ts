import {
    CURRENCIES,
    getCurrencySymbol,
    toWishCurrency
} from '../../shared/money';
import {
    callbackButton,
    homeButton,
    singleColumnKeyboard
} from '../content/keyboards';
import { deriveRequest } from '../runtime/context';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createWishScreenServices,
    requireUser
} from '../services/wish-screen-context';
import { escapeHtml } from '../utils/strings';
import { screen as homeScreen } from './home';
import { screen as settingsScreen } from './settings';
import { renderStaleWish, sendFieldPrompt } from './wish-edit';

const CURRENT_MARK = '✅';

const render = async (req: BotRequest) => {
    const { LL, user } = req;

    if (!user) {
        await homeScreen.render(req, undefined);
        return;
    }

    const current = req.displayCurrency;

    await req.send.text(
        `<b>${LL.currency.title()}</b>\n\n${LL.currency.description({
            current: escapeHtml(LL.currency.options[current]())
        })}`,
        singleColumnKeyboard([
            ...CURRENCIES.map(currency => {
                const label = LL.currency.options[currency]();

                return callbackButton(
                    currency === current ? `${CURRENT_MARK} ${label}` : label,
                    { type: 'currencySet', currency }
                );
            }),
            homeButton(LL)
        ])
    );
};

export const screen: ScreenModule = {
    id: 'currency',
    render
};

export const callbacks: CallbackTable = {
    currencySet: async (req, action) => {
        const user = requireUser(req);
        const updated = await req.services.users.setCurrency(
            user,
            action.currency
        );

        if (updated === null) {
            await homeScreen.render(req, undefined);

            return;
        }

        const nextReq = deriveRequest(req, { user: updated });

        req.telemetry.botActionCompleted({
            action: 'currency_changed',
            result: action.currency
        });
        await nextReq.send.text(
            nextReq.LL.currency.success({
                currency: escapeHtml(
                    nextReq.LL.currency.options[action.currency]()
                )
            })
        );
        await settingsScreen.render(nextReq, undefined);
    },
    wishCurrencySet: async (req, action) => {
        const user = requireUser(req);
        const { wishes } = createWishScreenServices(req);
        const wish = await wishes.findOwned(action.wishId, user.id);

        if (wish === null) {
            await renderStaleWish(req);

            return;
        }

        if (toWishCurrency(wish.currency) !== action.currency) {
            const updated = await wishes.updateFields(wish.id, user.id, {
                currency: action.currency
            });

            if (!updated) {
                await renderStaleWish(req);

                return;
            }
        }

        req.telemetry.botActionCompleted({
            action: 'wish_updated',
            field: 'currency'
        });
        await req.send.text(
            req.LL.wishlist.edit.currency.success({
                currency: getCurrencySymbol(req.locale, action.currency)
            })
        );
        await sendFieldPrompt(
            req,
            { ...wish, currency: action.currency },
            'price'
        );
    }
};
