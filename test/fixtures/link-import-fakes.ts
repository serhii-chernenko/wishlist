import type {
    FetchedImage,
    FetchedPage,
    SafeFetchFailure,
    SafeFetchOptions,
    SafeFetchResult,
    SafeFetcher
} from '../../src/bot/services/link-import/types';
import type { WorkerBindings } from '../../src/worker/env';

export const JPEG_BYTES = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1
]);
export const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0
]);
export const WEBP_BYTES = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
    0x38, 0x20
]);
export const GIF_BYTES = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0
]);
export const AVIF_BYTES = new Uint8Array([
    0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
    0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31, 0x6d, 0x69, 0x61, 0x66
]);

export const toArrayBuffer = (bytes: Uint8Array) => {
    return bytes.slice().buffer;
};

export const padBytes = (bytes: Uint8Array, size: number) => {
    const padded = new Uint8Array(size);

    padded.set(bytes);

    return padded;
};

interface StoredObject {
    key: string;
    body: Uint8Array;
    httpMetadata: R2HTTPMetadata;
    customMetadata: Record<string, string>;
    uploaded: Date;
}

const toBytes = async (value: unknown): Promise<Uint8Array> => {
    if (typeof value === 'string') {
        return new TextEncoder().encode(value);
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value.slice(0));
    }

    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(
            value.buffer.slice(
                value.byteOffset,
                value.byteOffset + value.byteLength
            )
        );
    }

    return new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
};

export interface MemoryBucket {
    bucket: R2Bucket;
    objects: Map<string, StoredObject>;
    calls: { get: string[]; head: string[]; put: string[]; delete: string[] };
    seed(
        key: string,
        body: Uint8Array | string,
        options?: {
            contentType?: string;
            customMetadata?: Record<string, string>;
            uploaded?: Date;
        }
    ): void;
    keys(): string[];
}

export const createMemoryBucket = (
    options: { pageSize?: number } = {}
): MemoryBucket => {
    const objects = new Map<string, StoredObject>();
    const calls = {
        get: [] as string[],
        head: [] as string[],
        put: [] as string[],
        delete: [] as string[]
    };
    const pageSize = options.pageSize ?? 1000;

    const toHead = (stored: StoredObject) => {
        return {
            key: stored.key,
            size: stored.body.byteLength,
            uploaded: stored.uploaded,
            httpMetadata: stored.httpMetadata,
            customMetadata: stored.customMetadata
        };
    };

    const toBody = (stored: StoredObject) => {
        return {
            ...toHead(stored),
            async text() {
                return new TextDecoder().decode(stored.body);
            },
            async arrayBuffer() {
                return stored.body.slice().buffer;
            }
        };
    };

    const bucket = {
        async get(key: string) {
            calls.get.push(key);
            const stored = objects.get(key);

            return stored === undefined ? null : toBody(stored);
        },
        async head(key: string) {
            calls.head.push(key);
            const stored = objects.get(key);

            return stored === undefined ? null : toHead(stored);
        },
        async put(
            key: string,
            value: unknown,
            putOptions: {
                httpMetadata?: R2HTTPMetadata;
                customMetadata?: Record<string, string>;
            } = {}
        ) {
            calls.put.push(key);
            objects.set(key, {
                key,
                body: await toBytes(value),
                httpMetadata: putOptions.httpMetadata ?? {},
                customMetadata: putOptions.customMetadata ?? {},
                uploaded: new Date()
            });

            return null;
        },
        async delete(keys: string | string[]) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
                calls.delete.push(key);
                objects.delete(key);
            }
        },
        async list(
            listOptions: {
                prefix?: string;
                cursor?: string;
                include?: string[];
            } = {}
        ) {
            const matching = [...objects.keys()]
                .filter(key => {
                    return key.startsWith(listOptions.prefix ?? '');
                })
                .sort();
            const start = Number(listOptions.cursor ?? 0);
            const page = matching.slice(start, start + pageSize);
            const truncated = start + pageSize < matching.length;
            const includeCustom =
                listOptions.include?.includes('customMetadata') ?? false;

            return {
                objects: page.map(key => {
                    const head = toHead(objects.get(key) as StoredObject);

                    return includeCustom
                        ? head
                        : { ...head, customMetadata: undefined };
                }),
                truncated,
                ...(truncated ? { cursor: String(start + pageSize) } : {}),
                delimitedPrefixes: []
            };
        }
    };

    return {
        bucket: bucket as unknown as R2Bucket,
        objects,
        calls,
        seed(key, body, seedOptions = {}) {
            objects.set(key, {
                key,
                body:
                    typeof body === 'string'
                        ? new TextEncoder().encode(body)
                        : body,
                httpMetadata:
                    seedOptions.contentType === undefined
                        ? {}
                        : { contentType: seedOptions.contentType },
                customMetadata: seedOptions.customMetadata ?? {},
                uploaded: seedOptions.uploaded ?? new Date()
            });
        },
        keys() {
            return [...objects.keys()].sort();
        }
    };
};

export type FakeImageResponse =
    | { bytes: Uint8Array; contentType?: string }
    | { failure: SafeFetchFailure; status?: number };

export interface FakeSafeFetcher extends SafeFetcher {
    imageCalls: { url: string; options: SafeFetchOptions | undefined }[];
    pageCalls: { url: string; options: SafeFetchOptions | undefined }[];
}

export const createFakeSafeFetcher = (input: {
    images?: Record<string, FakeImageResponse>;
    page?: () => SafeFetchResult<FetchedPage>;
}): FakeSafeFetcher => {
    const fetcher: FakeSafeFetcher = {
        imageCalls: [],
        pageCalls: [],
        async fetchPage(url, options) {
            fetcher.pageCalls.push({ url, options });

            return (
                input.page?.() ?? {
                    ok: false,
                    failure: 'network',
                    status: null
                }
            );
        },
        async fetchImage(url, options): Promise<SafeFetchResult<FetchedImage>> {
            fetcher.imageCalls.push({ url, options });
            const response = input.images?.[url];

            if (response === undefined) {
                return { ok: false, failure: 'badStatus', status: 404 };
            }

            if ('failure' in response) {
                return {
                    ok: false,
                    failure: response.failure,
                    status: response.status ?? null
                };
            }

            return {
                ok: true,
                value: {
                    finalUrl: url,
                    bytes: toArrayBuffer(response.bytes),
                    contentType: response.contentType ?? 'image/jpeg'
                }
            };
        },
        async fetchJson() {
            return { ok: false, failure: 'network', status: null };
        }
    };

    return fetcher;
};

export const createLinkImportEnv = (input: {
    bucket?: R2Bucket;
    hostLimiter?: unknown;
}): WorkerBindings => {
    return {
        BOT_ENVIRONMENT: 'local',
        IMAGES: input.bucket,
        LINK_HOST_LIMITER: input.hostLimiter
    } as unknown as WorkerBindings;
};
