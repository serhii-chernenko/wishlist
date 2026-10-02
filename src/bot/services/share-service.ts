import type {
    Repositories,
    ShareRecord,
    UserRecord
} from '../../db/repositories';
import { runRepository } from './run-repository';

type ShareRepositories = Pick<Repositories, 'wishes' | 'shares'>;

export const DEFAULT_PUBLIC_ORIGIN = 'https://wishlist.chernenko.dev';

export type SharePublishStatus = 'created' | 'existing' | 'updated';

export type ShareEntryState = 'empty' | 'unshared' | 'shared';

export type SharePublishOutcome =
    | { status: 'empty' }
    | { status: SharePublishStatus; share: ShareRecord };

export const resolvePublicOrigin = (origin: string | undefined) => {
    return origin ?? DEFAULT_PUBLIC_ORIGIN;
};

export const buildAuthorName = (person: {
    username?: string | undefined;
    first_name?: string | undefined;
    last_name?: string | undefined;
}) => {
    const fullName = [person.first_name, person.last_name]
        .filter(Boolean)
        .join(' ');

    if (fullName) {
        return fullName;
    }

    return person.username ? `@${person.username}` : '';
};

export const createShareService = (
    repositories: ShareRepositories,
    clock: () => Date = () => new Date()
) => {
    const hasShareableWishes = async (userId: number) => {
        const wishes = await runRepository(
            repositories.wishes.listShareable(userId)
        );

        return wishes.length > 0;
    };

    const getShare = (userId: number) => {
        return runRepository(repositories.shares.findActiveByUserId(userId));
    };

    return {
        hasShareableWishes,
        getShare,
        async getEntryState(userId: number): Promise<ShareEntryState> {
            if ((await getShare(userId)) !== null) {
                return 'shared';
            }

            return (await hasShareableWishes(userId)) ? 'unshared' : 'empty';
        },
        async publish(
            user: Pick<UserRecord, 'id'>,
            displayName: string
        ): Promise<SharePublishOutcome> {
            if (!(await hasShareableWishes(user.id))) {
                return { status: 'empty' };
            }

            const previous = await runRepository(
                repositories.shares.findActiveByUserId(user.id)
            );
            const share = await runRepository(
                repositories.shares.publish(user.id, displayName, clock())
            );

            if (previous === null) {
                return { status: 'created', share };
            }

            return {
                status:
                    previous.displayName === share.displayName
                        ? 'existing'
                        : 'updated',
                share
            };
        },
        stop(userId: number) {
            return runRepository(repositories.shares.revoke(userId, clock()));
        },
        rotate(userId: number) {
            return runRepository(repositories.shares.rotate(userId, clock()));
        }
    };
};

export type ShareService = ReturnType<typeof createShareService>;
