import { APP_IMAGE_HASH_LENGTH } from '../../shared/app-api';
import { sha256Hex, type ApiCrypto } from '../auth/crypto';

export interface ImageIdentity {
    key: string;
    hash: string;
}

export const IMAGE_HASH_PATTERN = new RegExp(
    `^[0-9a-f]{${APP_IMAGE_HASH_LENGTH}}$`
);

/**
 * `key` is the full SHA-256 of the Telegram `file_id` (the R2 object key and
 * the Cache API key); `hash` is its URL prefix, identical to `toImageHash`.
 */
export const getImageIdentity = async (
    crypto: ApiCrypto,
    fileId: string
): Promise<ImageIdentity> => {
    const key = await sha256Hex(crypto, fileId);

    return { key, hash: key.slice(0, APP_IMAGE_HASH_LENGTH) };
};
