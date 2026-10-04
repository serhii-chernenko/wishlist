import { Effect } from 'effect';

import { createGiveService } from '../../bot/services/give-service';
import type {
    GiveListEntry,
    Repositories,
    UserRecord
} from '../../db/repositories';
import {
    APP_PAGE_SIZE,
    type GiveEntryDto,
    type GiveListDto,
    type RemovedCountDto
} from '../../shared/app-api';
import {
    getSigner,
    requireUser,
    type ApiContext,
    type ApiHandler
} from '../context';
import {
    mintWishImages,
    toPageDto,
    toVisibleWishDto,
    type ImageMintingContext
} from '../dto';
import { emitAppAction } from '../telemetry';
import { readIdParam, readOffset } from '../validate';

export type GiversLookup = ReadonlyMap<number, readonly number[]>;

export const getImageMintingContext = (c: ApiContext): ImageMintingContext => {
    return {
        crypto: c.var.deps.crypto,
        signer: getSigner(c),
        now: c.var.deps.now()
    };
};

export const getPublicOwnerUsername = (
    owner: Pick<UserRecord, 'username' | 'usernameSearchable'>
) => {
    return owner.usernameSearchable && owner.username ? owner.username : null;
};

export const loadGivers = (
    repos: Repositories,
    wishIds: readonly number[]
): Promise<GiversLookup> => {
    return Effect.runPromise(repos.gives.giversByWishIds(wishIds));
};

const toGiveEntryDto = async (
    context: ImageMintingContext,
    viewerId: number,
    entry: GiveListEntry,
    giversByWish: GiversLookup
): Promise<GiveEntryDto> => {
    const { wish, owner } = entry;
    const givers = giversByWish.get(wish.id) ?? [];

    return {
        wish: toVisibleWishDto(wish, await mintWishImages(context, wish)),
        ownerUsername: owner === null ? null : getPublicOwnerUsername(owner),
        otherGivers: givers.filter(giverId => {
            return giverId !== viewerId;
        }).length
    };
};

export const listGives: ApiHandler = async c => {
    const user = requireUser(c);
    const { repos } = c.var;
    const offset = readOffset(c);
    const page = await Effect.runPromise(
        repos.gives.listForGiver(user.id, { offset, limit: APP_PAGE_SIZE })
    );
    const giversByWish = await loadGivers(
        repos,
        page.items.map(entry => {
            return entry.wish.id;
        })
    );
    const context = getImageMintingContext(c);
    const items = await Promise.all(
        page.items.map(entry => {
            return toGiveEntryDto(context, user.id, entry, giversByWish);
        })
    );
    const body: GiveListDto = toPageDto(items, page.total, offset);

    return c.json(body);
};

export const removeGive: ApiHandler = async c => {
    const user = requireUser(c);
    const wishId = readIdParam(c, 'wishId');
    const removed = await createGiveService(c.var.repos).take(user.id, wishId);

    if (removed) {
        emitAppAction(c, 'give_removed');
    }

    return c.body(null, 204);
};

export const cleanGives: ApiHandler = async c => {
    const user = requireUser(c);
    const removed = await createGiveService(c.var.repos).removeAll(user.id);
    const body: RemovedCountDto = { removed };

    emitAppAction(c, 'give_list_cleaned');

    return c.json(body);
};
