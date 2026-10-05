import { Effect } from 'effect';

import { createGiveService } from '../../bot/services/give-service';
import { createOwnerAccessService } from '../../bot/services/owner-access-service';
import type {
    GiveListEntry,
    Repositories,
    UserRecord
} from '../../db/repositories';
import {
    APP_PAGE_SIZE,
    type GiveEntryDto,
    type GiveListDto,
    type GiveOwnerListDto,
    type RemovedCountDto
} from '../../shared/app-api';
import {
    getSigner,
    mintOwnerToken,
    requireUser,
    type ApiContext,
    type ApiHandler
} from '../context';
import {
    getPublicOwnerUsername,
    mintWishImages,
    toOwnerDto,
    toPageDto,
    toShareLabel,
    toVisibleWishDto,
    type ImageMintingContext
} from '../dto';
import { emitAppAction } from '../telemetry';
import { readIdParam, readOffset } from '../validate';

export type GiversLookup = ReadonlyMap<number, readonly number[]>;

export const getViewerImageMintingContext = (
    c: ApiContext
): ImageMintingContext => {
    return {
        crypto: c.var.deps.crypto,
        signer: getSigner(c),
        now: c.var.deps.now(),
        audience: 'viewer'
    };
};

export const loadGivers = (
    repos: Repositories,
    wishIds: readonly number[]
): Promise<GiversLookup> => {
    return Effect.runPromise(repos.gives.giversByWishIds(wishIds));
};

const resolveOwnerList = async (
    c: ApiContext,
    viewer: UserRecord,
    owner: UserRecord | null
): Promise<GiveOwnerListDto | null> => {
    const access = await createOwnerAccessService(c.var.repos).resolve(
        viewer.id,
        owner
    );

    if (owner === null || access === null) {
        return null;
    }

    if (access.kind === 'shareOnly') {
        return {
            label: toShareLabel({
                displayName: access.share.displayName,
                showUsername: access.share.showUsername,
                owner
            }),
            source: { kind: 'share', publicId: access.share.publicId }
        };
    }

    const username = getPublicOwnerUsername(owner);
    const label = username === null ? '' : `@${username}`;

    return {
        label,
        source: {
            kind: 'owner',
            owner: toOwnerDto({
                owner,
                token: await mintOwnerToken(c, viewer, owner),
                label,
                source: 'search',
                contact: null
            })
        }
    };
};

const toGiveEntryDto = async (
    context: ImageMintingContext,
    viewerId: number,
    entry: GiveListEntry,
    giversByWish: GiversLookup,
    ownerList: GiveOwnerListDto | null
): Promise<GiveEntryDto> => {
    const { wish, owner } = entry;
    const givers = giversByWish.get(wish.id) ?? [];

    return {
        wish: toVisibleWishDto(wish, await mintWishImages(context, wish)),
        ownerUsername: owner === null ? null : getPublicOwnerUsername(owner),
        otherGivers: givers.filter(giverId => {
            return giverId !== viewerId;
        }).length,
        ...(ownerList === null ? {} : { ownerList })
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
    const context = getViewerImageMintingContext(c);
    const items = await Promise.all(
        page.items.map(async entry => {
            return toGiveEntryDto(
                context,
                user.id,
                entry,
                giversByWish,
                await resolveOwnerList(c, user, entry.owner)
            );
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
