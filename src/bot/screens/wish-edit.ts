import type { Message } from 'telegraf/types';

import type { WishRecord } from '../../db/repositories';
import {
    callbackButton,
    homeButton,
    inlineKeyboard,
    removeReplyKeyboard,
    removeValueKeyboard,
    singleColumnKeyboard
} from '../content/keyboards';
import { renderWishHtml, toWishMessage } from '../content/wish-markup';
import { getErrorType } from '../errors';
import { parseDescription } from '../input/description';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '../input/limits';
import { parseLink } from '../input/link';
import { pickLargestPhoto } from '../input/photo';
import { parsePrice } from '../input/price';
import { isRemoveCommand } from '../input/remove-command';
import { parseTitle } from '../input/title';
import { parseWishImages } from '../input/wish-images';
import type {
    BotRequest,
    CallbackTable,
    PendingInput,
    ScreenModule,
    WishField
} from '../runtime/types';
import { getMediaGroupId } from '../runtime/album';
import { runRepository } from '../services/run-repository';
import {
    createWishFormatters,
    createWishScreenServices,
    getRemoveLabels,
    openLinkButton,
    requireUser,
    updateSession
} from '../services/wish-screen-context';
import { screen as wishlistScreen } from './wishlist';

export interface WishEditParams {
    wishId: number;
}

type WishFieldInput = Extract<PendingInput, { kind: 'wishField' }>;

export const ALBUM_DEBOUNCE_MS = 1500;

const renderStaleWish = async (req: BotRequest) => {
    updateSession(req, { pendingInput: null });
    await req.send.text(req.LL.errors.outdatedButton(), removeReplyKeyboard());
    await wishlistScreen.render(req, undefined);
};

const buildEditMenu = (req: BotRequest, wish: WishRecord) => {
    const { LL } = req;
    const actions = LL.wishlist.edit.actions;
    const hasImages = parseWishImages(wish.images).length > 0;
    const promptButton = (label: string, field: WishField) => {
        return callbackButton(label, {
            type: 'wishFieldPrompt',
            wishId: wish.id,
            field
        });
    };

    return singleColumnKeyboard([
        promptButton(actions.title(), 'title'),
        promptButton(
            wish.description
                ? actions.updateDescription()
                : actions.addDescription(),
            'description'
        ),
        promptButton(
            hasImages ? actions.updateImages() : actions.addImages(),
            'images'
        ),
        promptButton(
            wish.link ? actions.updateLink() : actions.addLink(),
            'link'
        ),
        callbackButton(
            wish.priority ? actions.unsetPriority() : actions.setPriority(),
            { type: 'wishTogglePriority', wishId: wish.id }
        ),
        callbackButton(wish.hidden ? actions.show() : actions.hide(), {
            type: 'wishToggleVisibility',
            wishId: wish.id
        }),
        promptButton(
            wish.price > 0 ? actions.updatePrice() : actions.addPrice(),
            'price'
        ),
        callbackButton(LL.wishlist.add.title(), { type: 'wishAdd' }),
        callbackButton(LL.actions.back(), {
            type: 'wishBack',
            wishId: wish.id
        }),
        homeButton(LL)
    ]);
};

const renderEdit = async (req: BotRequest, params: WishEditParams) => {
    const { LL } = req;
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const wish = await wishes.findOwned(params.wishId, user.id);

    if (wish === null) {
        await renderStaleWish(req);

        return;
    }

    updateSession(req, { pendingInput: null });

    const html = renderWishHtml(LL, wish, createWishFormatters(req), {
        audience: 'owner',
        detail: 'full',
        showHidden: true
    });
    const linkRow = openLinkButton(req, wish.link);

    await req.send.wish(
        toWishMessage(html, wish),
        linkRow.length > 0 ? inlineKeyboard([linkRow]) : undefined
    );
    await req.send.text(
        LL.wishlist.edit.description(),
        buildEditMenu(req, wish)
    );
};

const hasFieldValue = (wish: WishRecord, field: WishField) => {
    switch (field) {
        case 'title':
            return false;
        case 'description':
            return Boolean(wish.description);
        case 'images':
            return parseWishImages(wish.images).length > 0;
        case 'link':
            return Boolean(wish.link);
        case 'price':
            return wish.price > 0;
    }
};

const getFieldPromptText = (
    req: BotRequest,
    field: WishField,
    hasValue: boolean
) => {
    const scenes = req.LL.wishlist.edit.scenes;

    switch (field) {
        case 'title':
            return scenes.title(String(TITLE_MAX_LENGTH));
        case 'description':
            return hasValue
                ? scenes.updateDescription(String(DESCRIPTION_MAX_LENGTH))
                : scenes.addDescription(String(DESCRIPTION_MAX_LENGTH));
        case 'images':
            return hasValue ? scenes.updateImages() : scenes.addImages();
        case 'link':
            return hasValue ? scenes.updateLink() : scenes.addLink();
        case 'price':
            return hasValue ? scenes.updatePrice() : scenes.addPrice();
    }
};

const sendFieldPrompt = async (
    req: BotRequest,
    wish: WishRecord,
    field: WishField
) => {
    const hasValue = hasFieldValue(wish, field);

    updateSession(req, {
        pendingInput: { kind: 'wishField', wishId: wish.id, field }
    });
    await req.send.text(
        getFieldPromptText(req, field, hasValue),
        hasValue ? removeValueKeyboard(req.LL) : removeReplyKeyboard()
    );
};

const finishFieldUpdate = async (
    req: BotRequest,
    wishId: number,
    field: WishField,
    successText: string
) => {
    req.telemetry.botActionCompleted({ action: 'wish_updated', field });
    updateSession(req, { pendingInput: null });
    await req.send.text(successText, removeReplyKeyboard());
    await renderEdit(req, { wishId });
};

const rejectFieldInput = async (
    req: BotRequest,
    wish: WishRecord,
    field: WishField,
    errorText: string
) => {
    await req.send.text(errorText, removeReplyKeyboard());
    await sendFieldPrompt(req, wish, field);
};

const handleTitle = async (
    req: BotRequest,
    wish: WishRecord,
    text: string | undefined
) => {
    const { LL } = req;
    const user = requireUser(req);
    const parsed = parseTitle(text);

    if (!parsed.ok) {
        await rejectFieldInput(
            req,
            wish,
            'title',
            parsed.reason === 'containsLink'
                ? LL.wishlist.edit.errors.title.link()
                : LL.wishlist.edit.errors.title.general()
        );

        return;
    }

    const { wishes } = createWishScreenServices(req);
    const updated = await wishes.updateFields(wish.id, user.id, {
        title: parsed.value
    });

    if (!updated) {
        await renderStaleWish(req);

        return;
    }

    await finishFieldUpdate(
        req,
        wish.id,
        'title',
        LL.wishlist.edit.success.title()
    );
};

const handleDescription = async (
    req: BotRequest,
    wish: WishRecord,
    text: string | undefined
) => {
    const { LL } = req;
    const user = requireUser(req);
    const parsed = parseDescription(text, getRemoveLabels());

    if (!parsed.ok) {
        await rejectFieldInput(
            req,
            wish,
            'description',
            LL.wishlist.edit.errors.description()
        );

        return;
    }

    const { wishes } = createWishScreenServices(req);
    const updated = await wishes.updateFields(wish.id, user.id, {
        description: parsed.value
    });

    if (!updated) {
        await renderStaleWish(req);

        return;
    }

    await finishFieldUpdate(
        req,
        wish.id,
        'description',
        parsed.value === null
            ? LL.wishlist.edit.success.removeDescription()
            : LL.wishlist.edit.success.updateDescription()
    );
};

const handleLink = async (
    req: BotRequest,
    wish: WishRecord,
    text: string | undefined
) => {
    const { LL } = req;
    const user = requireUser(req);
    const parsed = parseLink(text, getRemoveLabels());

    if (!parsed.ok) {
        await rejectFieldInput(
            req,
            wish,
            'link',
            LL.wishlist.edit.errors.link()
        );

        return;
    }

    const { wishes } = createWishScreenServices(req);
    const updated = await wishes.updateFields(wish.id, user.id, {
        link: parsed.value
    });

    if (!updated) {
        await renderStaleWish(req);

        return;
    }

    await finishFieldUpdate(
        req,
        wish.id,
        'link',
        parsed.value === null
            ? LL.wishlist.edit.success.removeLink()
            : LL.wishlist.edit.success.updateLink()
    );
};

const handlePrice = async (
    req: BotRequest,
    wish: WishRecord,
    text: string | undefined
) => {
    const { LL } = req;
    const user = requireUser(req);
    const parsed = parsePrice(text, getRemoveLabels());

    if (!parsed.ok) {
        await rejectFieldInput(
            req,
            wish,
            'price',
            LL.wishlist.edit.errors.price()
        );

        return;
    }

    const { wishes } = createWishScreenServices(req);
    const updated = await wishes.updateFields(wish.id, user.id, {
        price: parsed.value
    });

    if (!updated) {
        await renderStaleWish(req);

        return;
    }

    await finishFieldUpdate(
        req,
        wish.id,
        'price',
        parsed.value === 0
            ? LL.wishlist.edit.success.removePrice()
            : LL.wishlist.edit.success.updatePrice()
    );
};

const buildImagesSavedText = (req: BotRequest, capReached: boolean) => {
    const { success } = req.LL.wishlist.edit;

    return capReached
        ? `${success.updateImages()}\n${success.imagesLimit()}`
        : success.updateImages();
};

const scheduleAlbumCompletion = (
    req: BotRequest,
    wishId: number,
    mediaGroupId: string,
    marker: number,
    capReached: boolean
) => {
    const telegramUserId = req.actor.id;

    req.defer(async () => {
        try {
            const claimed = await runRepository(
                req.repos.sessions.clearMediaGroup(telegramUserId, marker)
            );

            if (!claimed) {
                return;
            }

            req.telemetry.botActionCompleted({
                action: 'wish_updated',
                field: 'images'
            });

            await runRepository(
                req.repos.sessions.saveState(
                    telegramUserId,
                    {
                        ...req.session,
                        pendingInput: null,
                        album: { mediaGroupId, wishId }
                    },
                    new Date()
                )
            );
            await req.send.text(
                buildImagesSavedText(req, capReached),
                removeReplyKeyboard()
            );
            await renderEdit(req, { wishId });
        } catch (error) {
            req.telemetry.internalFailure({
                event: 'deferred_render_failed',
                errorType: getErrorType(error)
            });
        }
    }, ALBUM_DEBOUNCE_MS);
};

const handleClearImages = async (req: BotRequest, wish: WishRecord) => {
    const { LL } = req;
    const user = requireUser(req);

    if (parseWishImages(wish.images).length === 0) {
        await rejectFieldInput(
            req,
            wish,
            'images',
            LL.wishlist.edit.errors.removeImages()
        );

        return;
    }

    const { wishes } = createWishScreenServices(req);

    await req.send.deleteIncoming();

    if (!(await wishes.clearImages(wish.id, user.id))) {
        await renderStaleWish(req);

        return;
    }

    await finishFieldUpdate(
        req,
        wish.id,
        'images',
        LL.wishlist.edit.success.removeImages()
    );
};

const handleImages = async (
    req: BotRequest,
    wish: WishRecord,
    message: Message
) => {
    const user = requireUser(req);
    const text = 'text' in message ? message.text : undefined;

    if (isRemoveCommand(text, getRemoveLabels())) {
        await handleClearImages(req, wish);

        return;
    }

    const photo = pickLargestPhoto('photo' in message ? message.photo : []);

    if (photo === null) {
        await rejectFieldInput(
            req,
            wish,
            'images',
            req.LL.wishlist.edit.errors.updateImages()
        );

        return;
    }

    const { wishes } = createWishScreenServices(req);
    const appended = await wishes.appendImage(wish.id, user.id, photo.file_id);

    if (appended.outcome === 'missing') {
        await renderStaleWish(req);

        return;
    }

    const capReached = appended.outcome === 'full';
    const mediaGroupId = getMediaGroupId(message);

    if (mediaGroupId === undefined) {
        await finishFieldUpdate(
            req,
            wish.id,
            'images',
            buildImagesSavedText(req, capReached)
        );

        return;
    }

    const marker = req.ctx.update.update_id;

    await runRepository(
        req.repos.sessions.markMediaGroup(
            req.actor.id,
            mediaGroupId,
            marker,
            new Date()
        )
    );
    scheduleAlbumCompletion(req, wish.id, mediaGroupId, marker, capReached);
};

const handleWishFieldInput = async (
    req: BotRequest,
    input: WishFieldInput,
    message: Message
) => {
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const wish = await wishes.findOwned(input.wishId, user.id);

    if (wish === null) {
        await renderStaleWish(req);

        return;
    }

    const text = 'text' in message ? message.text : undefined;

    switch (input.field) {
        case 'title':
            return handleTitle(req, wish, text);
        case 'description':
            return handleDescription(req, wish, text);
        case 'link':
            return handleLink(req, wish, text);
        case 'price':
            return handlePrice(req, wish, text);
        case 'images':
            return handleImages(req, wish, message);
    }
};

export const screen: ScreenModule<WishEditParams> = {
    id: 'wishEdit',
    render: renderEdit,
    onInput: async (req, input, message) => {
        if (input.kind !== 'wishField') {
            return;
        }

        await handleWishFieldInput(req, input, message);
    }
};

const toggleWish = async (
    req: BotRequest,
    wishId: number,
    kind: 'priority' | 'visibility'
) => {
    const { LL } = req;
    const user = requireUser(req);
    const { wishes } = createWishScreenServices(req);
    const toggled =
        kind === 'priority'
            ? await wishes.togglePriority(wishId, user.id)
            : await wishes.toggleHidden(wishId, user.id);

    if (!toggled) {
        await renderStaleWish(req);

        return;
    }

    req.telemetry.botActionCompleted({
        action: 'wish_updated',
        field: kind
    });
    await req.send.text(
        kind === 'priority'
            ? LL.wishlist.edit.success.priority()
            : LL.wishlist.edit.success.visibility()
    );
    await renderEdit(req, { wishId });
};

export const callbacks: CallbackTable = {
    wishEdit: async (req, action) => {
        await renderEdit(req, { wishId: action.wishId });
    },
    wishFieldPrompt: async (req, action) => {
        const user = requireUser(req);
        const { wishes } = createWishScreenServices(req);
        const wish = await wishes.findOwned(action.wishId, user.id);

        if (wish === null) {
            await renderStaleWish(req);

            return;
        }

        await sendFieldPrompt(req, wish, action.field);
    },
    wishTogglePriority: async (req, action) => {
        await toggleWish(req, action.wishId, 'priority');
    },
    wishToggleVisibility: async (req, action) => {
        await toggleWish(req, action.wishId, 'visibility');
    },
    wishBack: async req => {
        await wishlistScreen.render(req, undefined);
    }
};
