import {
    homeButton,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { TITLE_MAX_LENGTH } from '../input/limits';
import { parseTitle } from '../input/title';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createWishScreenServices,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { screen as wishEditScreen } from './wish-edit';

const render = async (req: BotRequest) => {
    const { LL } = req;

    requireUser(req);
    updateSession(req, { pendingInput: { kind: 'wishTitleNew' } });
    await req.send.text(
        LL.wishlist.add.description(String(TITLE_MAX_LENGTH)),
        singleColumnKeyboard([
            navigationButton(LL.actions.back(), 'wishlist'),
            homeButton(LL)
        ])
    );
};

export const screen: ScreenModule<undefined> = {
    id: 'wishAdd',
    render,
    onInput: async (req, input, message) => {
        if (input.kind !== 'wishTitleNew') {
            return;
        }

        const { LL } = req;
        const user = requireUser(req);
        const parsed = parseTitle('text' in message ? message.text : undefined);

        if (!parsed.ok) {
            await req.send.text(LL.wishlist.add.error(), removeReplyKeyboard());
            await render(req);

            return;
        }

        const { wishes } = createWishScreenServices(req);
        const wish = await wishes.create(user.id, parsed.value);

        if (wish === null) {
            await req.send.text(LL.wishlist.add.error(), removeReplyKeyboard());
            await render(req);

            return;
        }

        req.telemetry.botActionCompleted({ action: 'wish_created' });
        updateSession(req, { pendingInput: null });
        await req.send.text(LL.wishlist.add.success(), removeReplyKeyboard());
        await wishEditScreen.render(req, { wishId: wish.id });
    }
};

export const callbacks: CallbackTable = {
    wishAdd: async req => {
        await render(req);
    }
};
