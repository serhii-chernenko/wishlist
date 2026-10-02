import type {
    Repositories,
    ShareRecord,
    UserRecord
} from '../../db/repositories';
import { CANONICAL_SHARE_ORIGIN } from '../../web/share/public-id';
import { runRepository } from './run-repository';

type ShareRepositories = Pick<Repositories, 'wishes' | 'shares'>;

export type SharePublishStatus = 'created' | 'existing' | 'updated';

export type ShareEntryState = 'empty' | 'unshared' | 'shared';

export type SharePublishOutcome =
    | { status: 'empty' }
    | { status: SharePublishStatus; share: ShareRecord; pageEmpty: boolean };

export const resolvePublicOrigin = (
    origin: string | undefined,
    environment?: string
) => {
    if (environment === 'production') {
        return CANONICAL_SHARE_ORIGIN;
    }

    return origin ?? CANONICAL_SHARE_ORIGIN;
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
        return runRepository(repositories.wishes.hasShareable(userId));
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
            const previous = await getShare(user.id);

            if (previous === null && !(await hasShareableWishes(user.id))) {
                return { status: 'empty' };
            }

            const share = await runRepository(
                repositories.shares.publish(user.id, displayName, clock())
            );

            if (previous === null) {
                return { status: 'created', share, pageEmpty: false };
            }

            return {
                status:
                    previous.displayName === share.displayName
                        ? 'existing'
                        : 'updated',
                share,
                pageEmpty: !(await hasShareableWishes(user.id))
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
