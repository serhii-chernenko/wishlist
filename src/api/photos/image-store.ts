import { APP_UPLOAD_CONTENT_TYPES } from '../../shared/app-api';

export interface StoredImage {
    body: ArrayBuffer;
    contentType: string;
}

export interface ImageStore {
    get(key: string): Promise<StoredImage | null>;
    put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
    deleteMany(keys: readonly string[]): Promise<void>;
}

const R2_DELETE_BATCH_SIZE = 1000;

export const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';

const CONTENT_TYPE_PARAMETER_SEPARATOR = ';';

export const normalizeImageContentType = (
    header: string | null | undefined
) => {
    const [mediaType = ''] = (header ?? '').split(
        CONTENT_TYPE_PARAMETER_SEPARATOR
    );
    const normalized = mediaType.trim().toLowerCase();

    return (
        APP_UPLOAD_CONTENT_TYPES.find(contentType => {
            return contentType === normalized;
        }) ?? null
    );
};

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

const logStoreFailure = (
    operation: 'get' | 'put' | 'delete',
    error: unknown
) => {
    console.warn(
        JSON.stringify({
            event: 'image_store_failed',
            operation,
            errorType: getErrorType(error)
        })
    );
};

/**
 * Durable image cache over the `IMAGES` R2 binding. A missing binding or any
 * R2 failure degrades to a miss, because Telegram stays the source of truth.
 */
export const createImageStore = (bucket: R2Bucket | undefined): ImageStore => {
    return {
        async get(key) {
            if (bucket === undefined) {
                return null;
            }

            try {
                const object = await bucket.get(key);

                if (object === null) {
                    return null;
                }

                return {
                    body: await object.arrayBuffer(),
                    contentType:
                        normalizeImageContentType(
                            object.httpMetadata?.contentType
                        ) ?? DEFAULT_IMAGE_CONTENT_TYPE
                };
            } catch (error) {
                logStoreFailure('get', error);

                return null;
            }
        },
        async put(key, body, contentType) {
            if (bucket === undefined) {
                return;
            }

            try {
                await bucket.put(key, body, {
                    httpMetadata: { contentType }
                });
            } catch (error) {
                logStoreFailure('put', error);
            }
        },
        async deleteMany(keys) {
            if (bucket === undefined) {
                return;
            }

            for (
                let start = 0;
                start < keys.length;
                start += R2_DELETE_BATCH_SIZE
            ) {
                try {
                    await bucket.delete(
                        keys.slice(start, start + R2_DELETE_BATCH_SIZE)
                    );
                } catch (error) {
                    logStoreFailure('delete', error);
                }
            }
        }
    };
};
