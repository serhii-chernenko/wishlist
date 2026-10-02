import { callbackButton, singleColumnKeyboard } from '../content/keyboards';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createWishScreenServices,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { screen as wishlistScreen } from './wishlist';

export interface WishRemoveParams {
    wishId: number;
}

const renderStaleWish = async (req: BotRequest) => {
    await req.send.text(req.LL.errors.outdatedButton());
    await wishlistScreen.render(req, undefined);
};

const render = async (req: BotRequest, params: WishRemoveParams) => {
    const { LL } = req;
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const wish = await wishes.findOwned(params.wishId, user.id);

    if (wish === null) {
        await renderStaleWish(req);

        return;
    }

    updateSession(req, { pendingInput: null });
    await req.send.text(
        LL.wishlist.remove.confirm(),
        singleColumnKeyboard([
            callbackButton(LL.actions.yes(), {
                type: 'wishRemoveConfirm',
                wishId: wish.id,
                done: true
            }),
            callbackButton(LL.actions.no(), {
                type: 'wishRemoveConfirm',
                wishId: wish.id,
                done: false
            })
        ])
    );
};

export const screen: ScreenModule<WishRemoveParams> = {
    id: 'wishRemove',
    render
};

export const callbacks: CallbackTable = {
    wishRemove: async (req, action) => {
        await render(req, { wishId: action.wishId });
    },
    wishRemoveConfirm: async (req, action) => {
        const user = requireUser(req);
        const { wishes } = createWishScreenServices(req);
        const removed = await wishes.remove(
            action.wishId,
            user.id,
            action.done
        );

        if (!removed) {
            await renderStaleWish(req);

            return;
        }

        req.telemetry.botActionCompleted({
            action: 'wish_removed',
            result: action.done ? 'done' : 'dropped'
        });
        await req.send.text(req.LL.wishlist.remove.success());
        await wishlistScreen.render(req, undefined);
    }
};
