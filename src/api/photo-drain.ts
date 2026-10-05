import { Effect } from 'effect';

import { kickListImport } from '../worker/list-import';
import { getListImportDeps, runInBackground, type ApiContext } from './context';

const kickWhenPhotosPending = async (c: ApiContext, ownerId: number) => {
    const pending = await Effect.runPromise(
        c.var.repos.wishes.countPendingPhotos(ownerId)
    );

    if (pending > 0) {
        kickListImport(c.var.deps.listImport, getListImportDeps(c), ownerId, {
            throttled: true
        });
    }
};

/**
 * Drains the pending imported photos of `ownerId` in the background when a
 * list or the bootstrap loads. The kick is throttled per user through the
 * drain lease, so repeated loads inside the interval do nothing.
 */
export const kickPhotoDrainOnLoad = async (c: ApiContext, ownerId: number) => {
    if (c.var.deps.listImport === undefined) {
        return;
    }

    await runInBackground(c, kickWhenPhotosPending(c, ownerId));
};
