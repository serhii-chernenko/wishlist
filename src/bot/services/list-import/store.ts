import { Effect } from 'effect';

import type { Repositories } from '../../../db/repositories';
import type { PhotoDrainStore } from './photos';

type RepositoryMethods<Repository> = {
    [Name in keyof Repository]: Repository[Name] extends (
        ...args: infer Args
    ) => Effect.Effect<infer Value, unknown, never>
        ? (...args: Args) => Promise<Value>
        : never;
};

const toPromises = <Repository extends object>(
    repository: Repository
): RepositoryMethods<Repository> => {
    return new Proxy(repository, {
        get(target, name) {
            const method: unknown = Reflect.get(target, name);

            if (typeof method !== 'function') {
                return method;
            }

            return (...args: unknown[]) => {
                return Effect.runPromise(
                    method.apply(target, args) as Effect.Effect<unknown>
                );
            };
        }
    }) as RepositoryMethods<Repository>;
};

/** The repositories the list import touches, with every Effect run to a promise. */
export const createListImportStore = (repos: Repositories) => {
    return {
        jobs: toPromises(repos.listImports),
        wishes: toPromises(repos.wishes),
        users: toPromises(repos.users)
    };
};

export type ListImportStore = ReturnType<typeof createListImportStore>;

export const toPhotoDrainStore = (store: ListImportStore): PhotoDrainStore => {
    return {
        listCandidates: store.jobs.listDrainCandidates,
        acquireLease: store.jobs.acquireDrainLease,
        releaseLease: store.jobs.releaseDrainLease,
        listPending: store.wishes.listPendingPhotos,
        appendImage: store.wishes.appendImportedImage,
        clearImage: store.wishes.clearSourceImage,
        clearAll: store.wishes.clearAllSourceImages,
        touchShare: store.jobs.touchShare
    };
};
