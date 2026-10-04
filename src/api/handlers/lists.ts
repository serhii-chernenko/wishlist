import { Effect } from 'effect';

import { toWishFilter } from '../../bot/content/filters';
import { parseWishImages } from '../../bot/input/wish-images';
import { isAdminActor } from '../../bot/runtime/context';
import {
    createGiveService,
    summarizeGivers
} from '../../bot/services/give-service';
import { resolveOwnerContact } from '../../bot/services/contact-service';
import { createGiftedService } from '../../bot/services/gifted-service';
import { createWishService } from '../../bot/services/wish-service';
import { isFindableOwner } from '../../bot/services/wish-screen-context';
import type { UserRecord, WishRecord } from '../../db/repositories';
import {
    APP_PAGE_SIZE,
    type PageDto,
    type OwnerWishListDto,
    type SharedListDto,
    type SharedWishDto,
    type ThirdWishDto
} from '../../shared/app-api';
import { buildShareImagePath } from '../../web/image-proxy/share-photos';
import { normalizeSharePublicId } from '../../web/share/public-id';
import {
    resolveDisplayCurrency,
    resolvePriceBounds,
    type PriceBoundsByCurrency
} from '../../shared/money';
import {
    getSigner,
    readExchangeRates,
    requireUser,
    type ApiContext,
    type ApiHandler
} from '../context';
import {
    mintWishImages,
    resolveViewerLocale,
    toOwnerDto,
    toImageHash,
    toPageDto,
    toThirdWishDto,
    toVisibleWishDto,
    type ImageMintingContext
} from '../dto';
import { ApiError } from '../errors';
import { kickPhotoDrainOnLoad } from '../photo-drain';
import { readIdParam, readOffset, readOptionalQueryInteger } from '../validate';
import { emitAppAction } from '../telemetry';
import {
    getViewerImageMintingContext,
    getPublicOwnerUsername,
    loadGivers
} from './gives';

const MIN_WISH_FILTER = 0;
const MAX_WISH_FILTER = 4;

export const isOwnerAvailableTo = (
    c: ApiContext,
    viewer: Pick<UserRecord, 'id'>,
    owner: UserRecord
) => {
    return (
        isFindableOwner(owner) &&
        (owner.id !== viewer.id || isAdminActor(c.env, c.var.actor))
    );
};

export const mintOwnerToken = (
    c: ApiContext,
    viewer: Pick<UserRecord, 'id'>,
    owner: Pick<UserRecord, 'id'>
) => {
    return getSigner(c).mintOwnerToken({
        ownerId: owner.id,
        viewerUserId: viewer.id,
        now: c.var.deps.now()
    });
};

const readOwnerIdFromToken = async (c: ApiContext, viewer: UserRecord) => {
    const verification = await getSigner(c).verifyOwnerToken(
        c.req.param('token') ?? '',
        { viewerUserId: viewer.id, now: c.var.deps.now() }
    );

    if (!verification.ok) {
        throw new ApiError(
            verification.reason === 'expired' ? 'tokenExpired' : 'tokenInvalid'
        );
    }

    return verification.ownerId;
};

const loadAvailableOwner = async (
    c: ApiContext,
    viewer: UserRecord,
    ownerId: number
) => {
    const owner = await Effect.runPromise(c.var.repos.users.findById(ownerId));

    if (owner === null || !isOwnerAvailableTo(c, viewer, owner)) {
        throw new ApiError('notFound');
    }

    return owner;
};

const loadGiftedOnLastPage = async (
    c: ApiContext,
    owner: UserRecord,
    page: Pick<PageDto<unknown>, 'nextOffset'>,
    priceBounds: PriceBoundsByCurrency | null
): Promise<WishRecord[]> => {
    if (page.nextOffset !== null) {
        return [];
    }

    return createGiftedService(c.var.repos).listVisibleOf(owner, priceBounds);
};

const countGiftedOfOwner = (
    c: ApiContext,
    owner: UserRecord,
    priceBounds: PriceBoundsByCurrency | null
) => {
    return createGiftedService(c.var.repos).countVisibleOf(owner, priceBounds);
};

const withGifted = <Item>(gifted: Item[]) => {
    return gifted.length > 0 ? { gifted } : {};
};

const toShareLabel = (input: {
    displayName: string | null;
    showUsername: boolean;
    owner: Pick<UserRecord, 'username' | 'usernameSearchable'>;
}) => {
    const name = input.displayName?.trim() ?? '';
    const username = input.showUsername
        ? getPublicOwnerUsername(input.owner)
        : null;

    if (username === null) {
        return name;
    }

    return name === '' ? `@${username}` : `${name} (@${username})`;
};

const toSharedWishItems = (
    context: ImageMintingContext,
    publicId: string,
    wishes: readonly WishRecord[]
): Promise<SharedWishDto[]> => {
    return Promise.all(
        wishes.map(async wish => {
            const hashes = await Promise.all(
                parseWishImages(wish.images).map(fileId => {
                    return toImageHash(context.crypto, fileId);
                })
            );

            return toVisibleWishDto(
                wish,
                hashes.map((hash, index) => {
                    return {
                        hash,
                        url: buildShareImagePath(publicId, wish.id, index, hash)
                    };
                })
            );
        })
    );
};

export const openSharedList: ApiHandler = async c => {
    const viewer = requireUser(c);
    const publicId = normalizeSharePublicId(c.req.param('publicId') ?? '');

    if (publicId === null) {
        throw new ApiError('notFound');
    }

    const { repos } = c.var;
    const share = await Effect.runPromise(
        repos.shares.findPublicFingerprint(publicId)
    );

    if (share === null) {
        throw new ApiError('notFound');
    }

    if (share.revokedAt !== null) {
        throw new ApiError('shareGone');
    }

    const owner = await Effect.runPromise(repos.users.findById(share.userId));

    if (owner === null) {
        throw new ApiError('notFound');
    }

    const token = isOwnerAvailableTo(c, viewer, owner)
        ? await mintOwnerToken(c, viewer, owner)
        : null;
    const offset = readOffset(c);
    const page = await Effect.runPromise(
        repos.wishes.listVisibleOf(owner.id, {
            filter: null,
            offset,
            limit: APP_PAGE_SIZE
        })
    );
    const mintingContext = getViewerImageMintingContext(c);
    const items = await toSharedWishItems(
        mintingContext,
        share.publicId,
        page.items
    );
    const preview = toPageDto(items, page.total, offset);
    const gifted = await toSharedWishItems(
        mintingContext,
        share.publicId,
        await loadGiftedOnLastPage(c, owner, preview, null)
    );
    const giftedTotal = await countGiftedOfOwner(c, owner, null);

    await kickPhotoDrainOnLoad(c, owner.id);

    const body: SharedListDto = {
        ownList: owner.id === viewer.id && !isAdminActor(c.env, c.var.actor),
        owner: toOwnerDto({
            owner,
            token,
            label: toShareLabel({
                displayName: share.displayName,
                showUsername: share.showUsername,
                owner
            }),
            source: 'share',
            contact: resolveOwnerContact({ owner, viewer, offset })
        }),
        preview,
        ...withGifted(gifted),
        giftedTotal
    };

    return c.json(body);
};

const toThirdWishItems = (
    context: ImageMintingContext,
    viewerId: number,
    wishes: readonly WishRecord[],
    giversByWish: ReadonlyMap<number, readonly number[]>
): Promise<ThirdWishDto[]> => {
    return Promise.all(
        wishes.map(async wish => {
            return toThirdWishDto(
                wish,
                await mintWishImages(context, wish),
                summarizeGivers(giversByWish.get(wish.id) ?? [], viewerId)
            );
        })
    );
};

export const listOwnerWishes: ApiHandler = async c => {
    const viewer = requireUser(c);
    const ownerId = await readOwnerIdFromToken(c, viewer);
    const owner = await loadAvailableOwner(c, viewer, ownerId);
    const offset = readOffset(c);
    const filter = toWishFilter(
        readOptionalQueryInteger(c, 'filter', MIN_WISH_FILTER, MAX_WISH_FILTER)
    );
    const { repos } = c.var;
    const priceBounds =
        filter === null
            ? null
            : resolvePriceBounds(
                  filter,
                  resolveDisplayCurrency(
                      viewer.currency,
                      resolveViewerLocale(c.var.actor, viewer)
                  ),
                  await readExchangeRates(c)
              );
    const page = await Effect.runPromise(
        repos.wishes.listVisibleOf(owner.id, {
            filter: priceBounds,
            offset,
            limit: APP_PAGE_SIZE
        })
    );
    const giversByWish = await loadGivers(
        repos,
        page.items.map(wish => {
            return wish.id;
        })
    );
    const mintingContext = getViewerImageMintingContext(c);
    const items = await toThirdWishItems(
        mintingContext,
        viewer.id,
        page.items,
        giversByWish
    );
    const pageDto = toPageDto(items, page.total, offset);
    const gifted = await Promise.all(
        (await loadGiftedOnLastPage(c, owner, pageDto, priceBounds)).map(
            async wish => {
                return toVisibleWishDto(
                    wish,
                    await mintWishImages(mintingContext, wish)
                );
            }
        )
    );
    const giftedTotal = await countGiftedOfOwner(c, owner, priceBounds);
    const username = getPublicOwnerUsername(owner);

    await kickPhotoDrainOnLoad(c, owner.id);

    const body: OwnerWishListDto = {
        ...pageDto,
        ...withGifted(gifted),
        giftedTotal,
        owner: toOwnerDto({
            owner,
            token: c.req.param('token') ?? null,
            label: username === null ? '' : `@${username}`,
            source: 'search',
            contact: resolveOwnerContact({ owner, viewer, offset })
        })
    };

    return c.json(body);
};

export const giveWish: ApiHandler = async c => {
    const viewer = requireUser(c);
    const ownerId = await readOwnerIdFromToken(c, viewer);
    const wishId = readIdParam(c, 'wishId');
    const { repos } = c.var;
    const wishes = createWishService(repos);
    const wish = await wishes.findVisible(wishId);

    if (wish === null || wish.userId !== ownerId) {
        throw new ApiError('notFound');
    }

    if (wish.userId === viewer.id) {
        throw new ApiError('ownWish');
    }

    const result = await createGiveService(repos, c.var.deps.now).give(
        viewer.id,
        wish.id
    );

    if (result === 'added') {
        emitAppAction(c, 'give_added');
    }

    const giversByWish = await loadGivers(repos, [wish.id]);
    const [item] = await toThirdWishItems(
        getViewerImageMintingContext(c),
        viewer.id,
        [wish],
        giversByWish
    );

    return c.json(item);
};
