import { homeButton, singleColumnKeyboard } from '../content/keyboards';
import { FIND_QUERY_MAX_LENGTH } from '../input/limits';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';
import {
    createWishScreenServices,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { screen as thirdWishlistScreen } from './third-wishlist';

const render = async (req: BotRequest) => {
    const { LL } = req;

    requireUser(req);
    updateSession(req, { pendingInput: { kind: 'findQuery' } });
    await req.send.text(
        LL.findList.description(),
        singleColumnKeyboard([homeButton(LL)])
    );
};

const handleQuery = async (req: BotRequest, rawText: string | undefined) => {
    const { LL } = req;
    const user = requireUser(req);
    const { search } = createWishScreenServices(req);
    const query = rawText?.trim() ?? '';

    if (Array.from(query).length > FIND_QUERY_MAX_LENGTH) {
        await req.send.text(
            LL.findList.errors.tooLong(String(FIND_QUERY_MAX_LENGTH))
        );
        await render(req);

        return;
    }

    const outcome = await search.findByQuery({
        query,
        searcherId: user.id,
        searcherIsAdmin: req.isAdmin
    });

    if (outcome.status === 'notFound') {
        await req.send.text(LL.findList.errors.notFound());
        await render(req);

        return;
    }

    if (outcome.status === 'self') {
        await req.send.text(LL.findList.errors.foundYourself());
        await render(req);

        return;
    }

    const previous = req.session.find;
    const keepsFilter =
        previous !== null &&
        previous.targetUserId === outcome.user.id &&
        previous.query === query;

    updateSession(req, {
        pendingInput: null,
        find: {
            targetUserId: outcome.user.id,
            query,
            filter: keepsFilter ? previous.filter : null
        }
    });
    req.telemetry.botActionCompleted({ action: 'wishlist_searched' });
    await thirdWishlistScreen.render(req, {
        ownerId: outcome.user.id,
        offset: 0
    });
};

export const screen: ScreenModule<undefined> = {
    id: 'findList',
    render,
    onInput: async (req, input, message) => {
        if (input.kind !== 'findQuery') {
            return;
        }

        await handleQuery(req, 'text' in message ? message.text : undefined);
    }
};

export const callbacks: CallbackTable = {};
