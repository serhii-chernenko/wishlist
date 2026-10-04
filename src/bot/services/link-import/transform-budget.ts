import { expiryMetadata, importUsageKey } from './storage-keys';

export const LINK_IMPORT_DAILY_TRANSFORM_CAP = 50;
export const LINK_IMPORT_USAGE_RETENTION_DAYS = 3;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_LENGTH = 10;
const JSON_CONTENT_TYPE = 'application/json';

export const toUsageDate = (now: number) => {
    return new Date(now).toISOString().slice(0, ISO_DATE_LENGTH);
};

const usageExpiresAt = (now: number) => {
    const startOfDay = Math.floor(now / MILLISECONDS_PER_DAY);

    return (
        (startOfDay + 1 + LINK_IMPORT_USAGE_RETENTION_DAYS) *
        MILLISECONDS_PER_DAY
    );
};

const readCount = async (bucket: R2Bucket, key: string) => {
    const object = await bucket.get(key);

    if (object === null) {
        return 0;
    }

    const parsed: unknown = JSON.parse(await object.text());
    const count = (parsed as { count?: unknown } | null)?.count;

    return typeof count === 'number' && Number.isSafeInteger(count) && count > 0
        ? count
        : 0;
};

export interface TransformBudget {
    tryConsume(): Promise<boolean>;
}

/**
 * Keeps Cloudflare Images transformations inside the free tier with an
 * approximate per-UTC-day counter at `import/_usage/<YYYY-MM-DD>.json`.
 * Consumption is serialized per budget instance; concurrent Workers may still
 * overshoot slightly, which the cap leaves room for. Without a bucket, or when
 * R2 fails, no transformation is allowed.
 */
export const createTransformBudget = (
    bucket: R2Bucket | undefined,
    now: () => number,
    cap: number = LINK_IMPORT_DAILY_TRANSFORM_CAP
): TransformBudget => {
    let queue: Promise<unknown> = Promise.resolve();

    const consume = async () => {
        if (bucket === undefined) {
            return false;
        }

        const at = now();
        const key = importUsageKey(toUsageDate(at));

        try {
            const count = await readCount(bucket, key);

            if (count >= cap) {
                return false;
            }

            await bucket.put(key, JSON.stringify({ count: count + 1 }), {
                httpMetadata: { contentType: JSON_CONTENT_TYPE },
                customMetadata: expiryMetadata(usageExpiresAt(at))
            });

            return true;
        } catch {
            return false;
        }
    };

    return {
        tryConsume() {
            const result = queue.then(consume);

            queue = result.catch(() => undefined);

            return result;
        }
    };
};
