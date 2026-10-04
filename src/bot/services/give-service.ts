import type { Repositories } from '../../db/repositories';
import { WISHES_PAGE_SIZE } from '../content/pagination';
import { runRepository } from './run-repository';

type GiveRepositories = Pick<Repositories, 'gives'>;

export type GiversLookup = ReadonlyMap<number, readonly number[]>;

export type GiverSummary =
    | { kind: 'none' }
    | { kind: 'you' }
    | { kind: 'somebodyAndYou'; others: number }
    | { kind: 'somebody'; count: number };

export const summarizeGivers = (
    giverIds: readonly number[],
    viewerId: number
): GiverSummary => {
    const viewerGives = giverIds.includes(viewerId);

    if (viewerGives && giverIds.length === 1) {
        return { kind: 'you' };
    }

    if (viewerGives) {
        return { kind: 'somebodyAndYou', others: giverIds.length - 1 };
    }

    if (giverIds.length > 0) {
        return { kind: 'somebody', count: giverIds.length };
    }

    return { kind: 'none' };
};

export const createGiveService = (
    repositories: GiveRepositories,
    clock: () => Date = () => new Date()
) => {
    return {
        give(userId: number, wishId: number) {
            return runRepository(
                repositories.gives.add(userId, wishId, clock())
            );
        },
        take(userId: number, wishId: number) {
            return runRepository(repositories.gives.remove(userId, wishId));
        },
        removeAll(userId: number) {
            return runRepository(repositories.gives.removeAll(userId));
        },
        listForGiver(userId: number, offset: number) {
            return runRepository(
                repositories.gives.listForGiver(userId, {
                    offset,
                    limit: WISHES_PAGE_SIZE
                })
            );
        },
        giversOf(wishIds: readonly number[]): Promise<GiversLookup> {
            if (wishIds.length === 0) {
                return Promise.resolve(new Map());
            }

            return runRepository(repositories.gives.giversByWishIds(wishIds));
        }
    };
};

export type GiveService = ReturnType<typeof createGiveService>;
