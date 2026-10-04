import {
    WISH_PRIORITY_LEVELS,
    type WishPriorityLevel
} from '../../shared/app-api';
import { toWishPriority } from '../../shared/priority';
import {
    callbackButton,
    homeButton,
    singleColumnKeyboard
} from '../content/keyboards';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createWishScreenServices,
    requireUser
} from '../services/wish-screen-context';
import { renderStaleWish, screen as wishEditScreen } from './wish-edit';

const CURRENT_LEVEL_MARK = '✅';
const MENU_LEVELS: readonly WishPriorityLevel[] = [
    WISH_PRIORITY_LEVELS.none,
    WISH_PRIORITY_LEVELS.low,
    WISH_PRIORITY_LEVELS.medium,
    WISH_PRIORITY_LEVELS.high
];

export interface WishPriorityParams {
    wishId: number;
}

const render = async (req: BotRequest, params: WishPriorityParams) => {
    const { LL } = req;
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const wish = await wishes.findOwned(params.wishId, user.id);

    if (wish === null) {
        await renderStaleWish(req);

        return;
    }

    await req.send.text(
        `<b>${LL.priority.title()}</b>`,
        singleColumnKeyboard([
            ...MENU_LEVELS.map(level => {
                const label = LL.priority.levels[toWishPriority(level)]();

                return callbackButton(
                    level === wish.priorityLevel
                        ? `${CURRENT_LEVEL_MARK} ${label}`
                        : label,
                    { type: 'wishPrioritySet', wishId: wish.id, level }
                );
            }),
            callbackButton(LL.actions.back(), {
                type: 'wishEdit',
                wishId: wish.id
            }),
            homeButton(LL)
        ])
    );
};

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

    const priority = toWishPriority(level);

    req.telemetry.botActionCompleted({
        action: 'wish_priority_set',
        result: priority
    });
    await req.send.text(
        req.LL.priority.success({ level: req.LL.priority.levels[priority]() })
    );
    await wishEditScreen.render(req, { wishId });
};

export const screen: ScreenModule<WishPriorityParams> = {
    id: 'wishPriority',
    render
};

export const callbacks: CallbackTable = {
    wishPriorityMenu: async (req, action) => {
        await render(req, { wishId: action.wishId });
    },
    wishPrioritySet: async (req, action) => {
        await applyPriorityLevel(req, action.wishId, action.level);
    }
};
