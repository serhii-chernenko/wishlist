import {
    WISH_PRIORITY_LEVELS,
    type WishPriorityLevel
} from '../../shared/app-api';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createWishScreenServices,
    requireUser
} from '../services/wish-screen-context';
import { screen as homeScreen } from './home';
import { renderStaleWish, screen as wishEditScreen } from './wish-edit';

const applyPriorityLevel = async (
    req: BotRequest,
    wishId: number,
    level: WishPriorityLevel
) => {
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const updated = await wishes.setPriority(wishId, user.id, level);

    if (!updated) {
        await renderStaleWish(req);

        return;
    }

    req.telemetry.botActionCompleted({
        action: 'wish_updated',
        field: 'priority'
    });
    await req.send.text(req.LL.wishlist.edit.success.priority());
    await wishEditScreen.render(req, { wishId });
};

const toggleHighPriority = async (req: BotRequest, wishId: number) => {
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const wish = await wishes.findOwned(wishId, user.id);

    if (wish === null) {
        await renderStaleWish(req);

        return;
    }

    await applyPriorityLevel(
        req,
        wishId,
        wish.priorityLevel === WISH_PRIORITY_LEVELS.high
            ? WISH_PRIORITY_LEVELS.none
            : WISH_PRIORITY_LEVELS.high
    );
};

export const screen: ScreenModule = {
    id: 'wishPriority',
    render: async req => {
        await homeScreen.render(req, undefined);
    }
};

export const callbacks: CallbackTable = {
    wishPriorityMenu: async (req, action) => {
        await toggleHighPriority(req, action.wishId);
    },
    wishPrioritySet: async (req, action) => {
        await applyPriorityLevel(req, action.wishId, action.level);
    }
};
