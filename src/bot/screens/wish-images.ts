import { getRuntimeCrypto } from '../../api/auth/crypto';
import { getImageIdentity } from '../../api/photos/image-key';
import { IMAGE_HASH_PREFIX_LENGTH } from '../callback-data';
import {
    callbackButton,
    homeButton,
    singleColumnKeyboard
} from '../content/keyboards';
import { parseWishImages } from '../input/wish-images';
import type {
    BotRequest,
    CallbackActionOf,
    CallbackTable,
    ScreenModule
} from '../runtime/types';
import {
    createWishScreenServices,
    requireUser
} from '../services/wish-screen-context';
import { screen as homeScreen } from './home';
import { renderStaleWish, screen as wishEditScreen } from './wish-edit';

const MINIMUM_IMAGES_TO_ORDER = 2;

const toHashPrefix = async (fileId: string) => {
    const { hash } = await getImageIdentity(getRuntimeCrypto(), fileId);

    return hash.slice(0, IMAGE_HASH_PREFIX_LENGTH);
};

const findOwnedWish = (req: BotRequest, wishId: number) => {
    const { wishes } = createWishScreenServices(req);

    return wishes.findOwned(wishId, requireUser(req).id);
};

const buildOrderKeyboard = async (
    req: BotRequest,
    wishId: number,
    fileIds: readonly string[]
) => {
    const { LL } = req;
    const makeFirstButtons = await Promise.all(
        fileIds.slice(1).map(async (fileId, offset) => {
            const index = offset + 1;

            return callbackButton(
                LL.wishlist.edit.images.order.makeFirst({ n: index + 1 }),
                {
                    type: 'wishImageFirst',
                    wishId,
                    index,
                    hash8: await toHashPrefix(fileId)
                }
            );
        })
    );

    return singleColumnKeyboard([
        ...makeFirstButtons,
        callbackButton(LL.actions.back(), { type: 'wishEdit', wishId }),
        homeButton(LL)
    ]);
};

const renderOrderPicker = async (req: BotRequest, wishId: number) => {
    const wish = await findOwnedWish(req, wishId);

    if (wish === null) {
        await renderStaleWish(req);

        return;
    }

    const fileIds = parseWishImages(wish.images);

    if (fileIds.length < MINIMUM_IMAGES_TO_ORDER) {
        await wishEditScreen.render(req, { wishId });

        return;
    }

    const { order } = req.LL.wishlist.edit.images;

    await req.send.wish(
        {
            html: order.prompt(),
            images: fileIds,
            captions: fileIds.map((_, index) => {
                return order.caption({ n: index + 1 });
            })
        },
        await buildOrderKeyboard(req, wishId, fileIds)
    );
};

const isCurrentImage = async (
    fileId: string | undefined,
    hash8: string
): Promise<boolean> => {
    return fileId !== undefined && (await toHashPrefix(fileId)) === hash8;
};

const reportChangedOrder = async (req: BotRequest, wishId: number) => {
    await req.send.text(req.LL.wishlist.edit.images.order.changed());
    await renderOrderPicker(req, wishId);
};

const makeImageFirst = async (
    req: BotRequest,
    action: CallbackActionOf<'wishImageFirst'>
) => {
    const { wishId, index, hash8 } = action;
    const wish = await findOwnedWish(req, wishId);

    if (wish === null) {
        await renderStaleWish(req);

        return;
    }

    const fileId = parseWishImages(wish.images)[index];

    if (fileId === undefined || !(await isCurrentImage(fileId, hash8))) {
        await reportChangedOrder(req, wishId);

        return;
    }

    const { wishes } = createWishScreenServices(req);
    const updated = await wishes.moveImageToFront(
        wishId,
        requireUser(req).id,
        index,
        fileId
    );

    if (updated === null) {
        await reportChangedOrder(req, wishId);

        return;
    }

    req.telemetry.botActionCompleted({
        action: 'wish_images_reordered',
        result: 'first'
    });
    await req.send.text(req.LL.wishlist.edit.images.order.success());
    await wishEditScreen.render(req, { wishId });
};

export const screen: ScreenModule = {
    id: 'wishImages',
    render: async req => {
        await homeScreen.render(req, undefined);
    }
};

export const callbacks: CallbackTable = {
    wishImagesOrder: async (req, action) => {
        await renderOrderPicker(req, action.wishId);
    },
    wishImageFirst: makeImageFirst
};
