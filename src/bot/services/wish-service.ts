import type {
    Repositories,
    UserRecord,
    WishFieldsPatch
} from '../../db/repositories';
import type {
    NewWishFields,
    WishFlags
} from '../../db/repositories/wish-repository';
import { WISHES_PAGE_SIZE } from '../content/pagination';
import { toWishFilter } from '../content/filters';
import type { WishFilter } from '../runtime/types';
import { parseWishImages } from '../input/wish-images';
import { runRepository } from './run-repository';

type WishRepositories = Pick<Repositories, 'wishes' | 'users' | 'gives'>;

export interface WishPageRequest {
    ownerId: number;
    filter: WishFilter | null;
    offset: number;
}

export type ImageAppendOutcome = 'appended' | 'duplicate' | 'full' | 'missing';

export const createWishService = (
    repositories: WishRepositories,
    clock: () => Date = () => new Date()
) => {
    return {
        listOwned(request: WishPageRequest) {
            return runRepository(
                repositories.wishes.listOwned(request.ownerId, {
                    filter: request.filter,
                    offset: request.offset,
                    limit: WISHES_PAGE_SIZE
                })
            );
        },
        listVisibleOf(request: WishPageRequest) {
            return runRepository(
                repositories.wishes.listVisibleOf(request.ownerId, {
                    filter: request.filter,
                    offset: request.offset,
                    limit: WISHES_PAGE_SIZE
                })
            );
        },
        findOwned(wishId: number, userId: number) {
            return runRepository(repositories.wishes.findOwned(wishId, userId));
        },
        findVisible(wishId: number) {
            return runRepository(repositories.wishes.findVisible(wishId));
        },
        create(userId: number, title: string) {
            return runRepository(
                repositories.wishes.create(userId, title, clock())
            );
        },
        createWithFields(userId: number, fields: NewWishFields) {
            return runRepository(
                repositories.wishes.createWithFields(userId, fields, clock())
            );
        },
        updateFields(wishId: number, userId: number, patch: WishFieldsPatch) {
            return runRepository(
                repositories.wishes.updateFields(wishId, userId, patch, clock())
            );
        },
        togglePriority(wishId: number, userId: number) {
            return runRepository(
                repositories.wishes.togglePriority(wishId, userId, clock())
            );
        },
        toggleHidden(wishId: number, userId: number) {
            return runRepository(
                repositories.wishes.toggleHidden(wishId, userId, clock())
            );
        },
        setFlags(wishId: number, userId: number, flags: WishFlags) {
            return runRepository(
                repositories.wishes.setFlags(wishId, userId, flags, clock())
            );
        },
        removeImageAt(
            wishId: number,
            userId: number,
            index: number,
            expectedJson: string
        ) {
            return runRepository(
                repositories.wishes.removeImageAt(
                    wishId,
                    userId,
                    index,
                    expectedJson,
                    clock()
                )
            );
        },
        findImageFileId(wishId: number, index: number) {
            return runRepository(
                repositories.wishes.findImageFileId(wishId, index)
            );
        },
        async findSharedWishImages(publicId: string, wishId: number) {
            const images = await runRepository(
                repositories.wishes.findSharedWishImages(publicId, wishId)
            );

            return images === null ? null : parseWishImages(images);
        },
        async appendImage(
            wishId: number,
            userId: number,
            fileId: string
        ): Promise<{ outcome: ImageAppendOutcome; count: number }> {
            const result = await runRepository(
                repositories.wishes.appendImage(wishId, userId, fileId, clock())
            );

            if (result.appended) {
                return { outcome: 'appended', count: result.count };
            }

            const owned = await runRepository(
                repositories.wishes.findOwned(wishId, userId)
            );

            if (owned === null) {
                return { outcome: 'missing', count: 0 };
            }

            return {
                outcome: result.count >= 9 ? 'full' : 'duplicate',
                count: result.count
            };
        },
        clearImages(wishId: number, userId: number) {
            return runRepository(
                repositories.wishes.clearImages(wishId, userId, clock())
            );
        },
        remove(wishId: number, userId: number, done: boolean) {
            return runRepository(
                repositories.wishes.softRemove(wishId, userId, done, clock())
            );
        },
        removeAll(userId: number) {
            return runRepository(
                repositories.wishes.softRemoveAll(userId, clock())
            );
        },
        listShareable(userId: number) {
            return runRepository(repositories.wishes.listShareable(userId));
        },
        setOwnerFilter(
            user: Pick<UserRecord, 'id'>,
            filter: WishFilter | null
        ) {
            return runRepository(
                repositories.users.setWishlistFilter(user.id, filter, clock())
            );
        },
        getOwnerFilter(user: Pick<UserRecord, 'wishlistFilter'>) {
            return toWishFilter(user.wishlistFilter);
        }
    };
};

export type WishService = ReturnType<typeof createWishService>;
