import type { Repositories } from '../../db/repositories';
import { createWishService } from '../../bot/services/wish-service';
import { getRuntimeCrypto, type ApiCrypto } from '../auth/crypto';
import { runInBackground, type ApiContext } from '../context';
import { getImageIdentity } from './image-key';
import { createImageStore } from './image-store';

export interface ImageCleanupDependencies {
    repositories: Pick<Repositories, 'wishes' | 'users' | 'gives'>;
    bucket: R2Bucket | undefined;
    crypto?: ApiCrypto;
}

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

/**
 * Deletes the R2 copy of every given Telegram file id that no active wish
 * references any more. Best effort: failures are logged and swallowed because
 * the proxy re-populates R2 on the next miss.
 */
export const releaseOrphanedImages = async (
    dependencies: ImageCleanupDependencies,
    fileIds: readonly string[]
) => {
    const uniqueFileIds = [...new Set(fileIds)];

    if (uniqueFileIds.length === 0 || dependencies.bucket === undefined) {
        return;
    }

    try {
        const crypto = dependencies.crypto ?? getRuntimeCrypto();
        const referenced = await createWishService(
            dependencies.repositories
        ).listReferencedFileIds(uniqueFileIds);
        const orphanedKeys = await Promise.all(
            uniqueFileIds
                .filter(fileId => {
                    return !referenced.has(fileId);
                })
                .map(async fileId => {
                    return (await getImageIdentity(crypto, fileId)).key;
                })
        );

        await createImageStore(dependencies.bucket).deleteMany(orphanedKeys);
    } catch (error) {
        console.warn(
            JSON.stringify({
                event: 'image_cleanup_failed',
                errorType: getErrorType(error)
            })
        );
    }
};

export const releaseImagesInBackground = (
    c: ApiContext,
    fileIds: readonly string[]
) => {
    return runInBackground(
        c,
        releaseOrphanedImages(
            {
                repositories: c.var.repos,
                bucket: c.env.IMAGES,
                crypto: c.var.deps.crypto
            },
            fileIds
        )
    );
};
