import {
    callbackButton,
    homeButton,
    homeKeyboard,
    navigationButton,
    removeReplyKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { getAllLocaleTexts } from '../content/messages';
import { TITLE_MAX_LENGTH } from '../input/limits';
import { parseTitle } from '../input/title';
import {
    getBareLink,
    getMessageText,
    isLinkImportAvailable,
    takeLinkOffer
} from '../runtime/link-offer';
import type {
    BotRequest,
    CallbackTable,
    PendingInput,
    ScreenModule
} from '../runtime/types';
import {
    createWishScreenServices,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { startLinkImport } from './wish-add-import';
import { screen as wishEditScreen } from './wish-edit';

type WishTitleInput = Extract<PendingInput, { kind: 'wishTitleNew' }>;

const rejectWishLimit = async (req: BotRequest) => {
    updateSession(req, { pendingInput: null });
    await req.send.text(req.LL.wishlist.add.limit(), removeReplyKeyboard());
};

const isWishLimitReached = (req: BotRequest) => {
    return createWishScreenServices(req).wishes.isWishLimitReached(
        requireUser(req).id
    );
};

const isWithoutLinkLabel = (text: string | undefined) => {
    return getAllLocaleTexts(LL => {
        return LL.wishlist.add.import.withoutLink();
    }).includes(text?.trim() ?? '');
};

const sendTitlePrompt = async (req: BotRequest) => {
    updateSession(req, { pendingInput: { kind: 'wishTitleNew' } });
    await req.send.text(
        req.LL.wishlist.add.description(String(TITLE_MAX_LENGTH)),
        singleColumnKeyboard([
            navigationButton(req.LL.actions.back(), 'wishlist'),
            homeButton(req.LL)
        ])
    );
};

const sendLinkPrompt = async (req: BotRequest) => {
    const { LL } = req;

    updateSession(req, { pendingInput: { kind: 'wishTitleNew' } });
    await req.send.text(
        LL.wishlist.add.import.prompt({ max: TITLE_MAX_LENGTH }),
        singleColumnKeyboard([
            callbackButton(LL.wishlist.add.import.withoutLink(), {
                type: 'wishAddNoLink'
            }),
            navigationButton(LL.actions.back(), 'wishlist'),
            homeButton(LL)
        ])
    );
};

const render = async (req: BotRequest) => {
    if (await isWishLimitReached(req)) {
        await rejectWishLimit(req);

        return;
    }

    if (isLinkImportAvailable(req)) {
        await sendLinkPrompt(req);

        return;
    }

    await sendTitlePrompt(req);
};

const beginLinkImport = async (req: BotRequest, url: string) => {
    if (await isWishLimitReached(req)) {
        await rejectWishLimit(req);

        return;
    }

    await startLinkImport(req, url);
};

const createFromTitle = async (
    req: BotRequest,
    input: WishTitleInput,
    text: string | undefined
) => {
    const { LL } = req;
    const user = requireUser(req);
    const parsed = parseTitle(text);

    if (!parsed.ok) {
        await req.send.text(LL.wishlist.add.error(), removeReplyKeyboard());
        await render(req);

        return;
    }

    const { wishes } = createWishScreenServices(req);

    if (await wishes.isWishLimitReached(user.id)) {
        await rejectWishLimit(req);

        return;
    }

    const wish =
        input.link === undefined
            ? await wishes.create(user.id, parsed.value, req.displayCurrency)
            : await wishes.createWithFields(user.id, {
                  title: parsed.value,
                  link: input.link,
                  currency: req.displayCurrency
              });

    if (wish === null) {
        await req.send.text(LL.wishlist.add.error(), removeReplyKeyboard());
        await render(req);

        return;
    }

    req.telemetry.botActionCompleted({ action: 'wish_created' });
    updateSession(req, { pendingInput: null });
    await req.send.text(LL.wishlist.add.success(), removeReplyKeyboard());
    await wishEditScreen.render(req, { wishId: wish.id });
};

export const screen: ScreenModule<undefined> = {
    id: 'wishAdd',
    render,
    onInput: async (req, input, message) => {
        if (input.kind !== 'wishTitleNew') {
            return;
        }

        const text = getMessageText(message);

        if (isLinkImportAvailable(req)) {
            const link = getBareLink(text);

            if (link !== null) {
                await beginLinkImport(req, link);

                return;
            }

            if (isWithoutLinkLabel(text)) {
                await sendTitlePrompt(req);

                return;
            }
        }

        await createFromTitle(req, input, text);
    }
};

export const callbacks: CallbackTable = {
    wishAdd: async req => {
        await render(req);
    },
    wishAddNoLink: async req => {
        if (await isWishLimitReached(req)) {
            await rejectWishLimit(req);

            return;
        }

        await sendTitlePrompt(req);
    },
    linkOfferAccept: async (req, action) => {
        const url = takeLinkOffer(req, action.createdAt);

        if (url === null) {
            await req.send.text(
                req.LL.wishlist.add.import.offer.expired(),
                homeKeyboard(req.LL)
            );

            return;
        }

        if (!isLinkImportAvailable(req)) {
            await render(req);

            return;
        }

        await beginLinkImport(req, url);
    }
};
