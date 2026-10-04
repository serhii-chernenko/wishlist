import type {
    Repositories,
    UserRecord,
    WishRecord
} from '../../db/repositories';
import { APP_THIRD_PARTY_GIFTED_LIMIT } from '../../shared/app-api';
import type { PriceBoundsByCurrency } from '../../shared/money';
import { MAX_ACTIVE_WISHES_PER_USER } from '../input/limits';
import { parseWishImages } from '../input/wish-images';
import { runRepository } from './run-repository';

type GiftedRepositories = Pick<Repositories, 'wishes' | 'users'>;

export type GiftedRestoreOutcome =
    | { status: 'restored'; wish: WishRecord }
    | { status: 'alreadyActive'; wish: WishRecord }
    | { status: 'wishLimit' }
    | { status: 'missing' };

export type GiftedHiddenOutcome =
    | { status: 'updated'; wish: WishRecord }
    | { status: 'missing' };

export interface ShowGiftedOutcome {
    user: UserRecord;
    changed: boolean;
}

export const isGiftedWish = (wish: Pick<WishRecord, 'removed' | 'done'>) => {
    return wish.removed && wish.done;
};

export const getReleasableImages = (
    outcome: GiftedHiddenOutcome,
    hidden: boolean
) => {
    return hidden && outcome.status === 'updated'
        ? parseWishImages(outcome.wish.images)
        : [];
};

export const createGiftedService = (
    repositories: GiftedRepositories,
    clock: () => Date = () => new Date()
) => {
    const findActive = (wishId: number, userId: number) => {
        return runRepository(repositories.wishes.findOwned(wishId, userId));
    };

    return {
        async restore(
            wishId: number,
            userId: number
        ): Promise<GiftedRestoreOutcome> {
            const active = await findActive(wishId, userId);

            if (active !== null) {
                return { status: 'alreadyActive', wish: active };
            }

            const activeCount = await runRepository(
                repositories.wishes.countActive(userId)
            );

            if (activeCount >= MAX_ACTIVE_WISHES_PER_USER) {
                return { status: 'wishLimit' };
            }

            const restored = await runRepository(
                repositories.wishes.restoreGifted(wishId, userId, clock())
            );

            return restored === null
                ? { status: 'missing' }
                : { status: 'restored', wish: restored };
        },
        async setHidden(
            wishId: number,
            userId: number,
            hidden: boolean
        ): Promise<GiftedHiddenOutcome> {
            const updated = await runRepository(
                repositories.wishes.setGiftedHidden(wishId, userId, hidden)
            );

            if (updated === null) {
                return { status: 'missing' };
            }

            return { status: 'updated', wish: updated };
        },
        async setShowGifted(
            user: UserRecord,
            show: boolean
        ): Promise<ShowGiftedOutcome | null> {
            if (user.showGifted === show) {
                return { user, changed: false };
            }

            const updated = await runRepository(
                repositories.users.setShowGifted(user.id, show, clock())
            );

            return updated === null ? null : { user: updated, changed: true };
        },
        listVisibleOf(
            owner: Pick<UserRecord, 'id' | 'showGifted'>,
            priceBounds: PriceBoundsByCurrency | null
        ) {
            if (!owner.showGifted) {
                return Promise.resolve([]);
            }

            return runRepository(
                repositories.wishes.listGiftedVisibleOf(owner.id, {
                    filter: priceBounds,
                    limit: APP_THIRD_PARTY_GIFTED_LIMIT
                })
            );
        }
    };
};

export type GiftedService = ReturnType<typeof createGiftedService>;
