import type {
    Repositories,
    ShareRecord,
    UserRecord
} from '../../db/repositories';
import { runRepository } from './run-repository';

type OwnerAccessRepositories = Pick<Repositories, 'gives' | 'shares' | 'users'>;

export type OwnerAccess =
    | { kind: 'findable' }
    | { kind: 'shareOnly'; share: ShareRecord };

export interface GiveOwnerAccess {
    owner: UserRecord;
    access: OwnerAccess;
}

export const isFindableOwner = (
    owner: Pick<UserRecord, 'usernameSearchable' | 'phone' | 'blockedAt'>
) => {
    return (
        owner.blockedAt === null &&
        (owner.usernameSearchable || owner.phone !== null)
    );
};

export const createOwnerAccessService = (
    repositories: OwnerAccessRepositories
) => {
    const resolve = async (
        viewerId: number,
        owner: UserRecord | null
    ): Promise<OwnerAccess | null> => {
        if (
            owner === null ||
            owner.id === viewerId ||
            owner.blockedAt !== null
        ) {
            return null;
        }

        if (isFindableOwner(owner)) {
            return { kind: 'findable' };
        }

        const share = await runRepository(
            repositories.shares.findActiveByUserId(owner.id)
        );

        return share === null ? null : { kind: 'shareOnly', share };
    };

    return {
        resolve,
        async resolveForGiver(
            giverId: number,
            ownerId: number
        ): Promise<GiveOwnerAccess | null> {
            const hasGive = await runRepository(
                repositories.gives.hasVisibleWishOfOwner(giverId, ownerId)
            );

            if (!hasGive) {
                return null;
            }

            const owner = await runRepository(
                repositories.users.findById(ownerId)
            );
            const access = await resolve(giverId, owner);

            return owner === null || access === null ? null : { owner, access };
        }
    };
};

export type OwnerAccessService = ReturnType<typeof createOwnerAccessService>;
