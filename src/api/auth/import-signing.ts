import {
    LINK_IMAGE_PATH_PREFIX,
    LINK_IMPORT_TOKEN_TTL_SECONDS,
    LINK_IMPORT_URL_HASH_LENGTH
} from '../../shared/app-api';
import type {
    ImportImageClaims,
    ImportTokenClaims
} from '../../bot/services/link-import/types';
import {
    bytesToBase64Url,
    constantTimeEqual,
    encodeText,
    hmacSha256,
    importHmacKey,
    signWithKey
} from './crypto';
import {
    deriveSigningKey,
    getImageUrlExpiry,
    toEpochSeconds,
    type SignatureRejectReason,
    type SignerOptions
} from './signing';

export type ImportTokenVerification =
    | { ok: true; claims: ImportTokenClaims }
    | { ok: false; reason: SignatureRejectReason };

export type ImportImageVerification =
    | { ok: true }
    | { ok: false; reason: SignatureRejectReason };

export interface SignedImportImageParams {
    expiresAt: number;
    signature: string;
}

const IMPORT_TOKEN_VERSION = 'it1';
const IMPORT_IMAGE_VERSION = 'ii1';
const TOKEN_SEPARATOR = '.';
const BASE36_RADIX = 36;
const BASE36_PATTERN = /^[0-9a-z]{1,11}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const URL_HASH_PATTERN = new RegExp(
    `^[0-9a-f]{${LINK_IMPORT_URL_HASH_LENGTH}}$`
);
const TOKEN_PART_COUNT = 4;

export const getImportTokenSigningLabel = (environment: string) => {
    return `wishlist:import-token:v1:${environment}`;
};

const parseBase36 = (value: string | undefined) => {
    if (value === undefined || !BASE36_PATTERN.test(value)) {
        return null;
    }

    const parsed = Number.parseInt(value, BASE36_RADIX);

    if (
        !Number.isSafeInteger(parsed) ||
        parsed <= 0 ||
        parsed.toString(BASE36_RADIX) !== value
    ) {
        return null;
    }

    return parsed;
};

const tokenMessage = (claims: ImportTokenClaims) => {
    return `${IMPORT_TOKEN_VERSION}|${claims.userId}|${claims.urlHash}|${claims.expiresAt}`;
};

const imageMessage = (urlHash: string, index: number, expiresAt: number) => {
    return `${IMPORT_IMAGE_VERSION}|${urlHash}|${index}|${expiresAt}`;
};

/**
 * Import tokens are `base36(userId).urlHash.base36(exp).b64url(HMAC)` and live
 * two hours. Preview URLs are `/img/i/<urlHash>/<index>?e=&s=` signed over
 * `ii1|urlHash|index|exp` with the shared image-url key, so the image route can
 * verify them without knowing the viewer.
 */
export const createImportSigner = (options: SignerOptions) => {
    let tokenKey: Promise<CryptoKey> | null = null;
    let imageKey: Promise<CryptoKey> | null = null;

    const getTokenKey = () => {
        tokenKey ??= hmacSha256(
            options.crypto,
            encodeText(options.botToken),
            encodeText(getImportTokenSigningLabel(options.environment))
        ).then(keyBytes => importHmacKey(options.crypto, keyBytes));

        return tokenKey;
    };

    const getImageKey = () => {
        imageKey ??= deriveSigningKey(options, 'image-url');

        return imageKey;
    };

    const signWith = async (key: Promise<CryptoKey>, message: string) => {
        return bytesToBase64Url(
            await signWithKey(options.crypto, await key, message)
        );
    };

    const matches = async (
        key: Promise<CryptoKey>,
        message: string,
        signature: string
    ) => {
        const expected = await signWith(key, message);

        return constantTimeEqual(
            options.crypto,
            encodeText(expected),
            encodeText(signature)
        );
    };

    const signImage = async (
        urlHash: string,
        index: number,
        now: Date
    ): Promise<SignedImportImageParams> => {
        const expiresAt = getImageUrlExpiry(now);

        return {
            expiresAt,
            signature: await signWith(
                getImageKey(),
                imageMessage(urlHash, index, expiresAt)
            )
        };
    };

    return {
        async mintImportToken(input: {
            userId: number;
            urlHash: string;
            now: Date;
        }) {
            const claims: ImportTokenClaims = {
                userId: input.userId,
                urlHash: input.urlHash,
                expiresAt:
                    toEpochSeconds(input.now) + LINK_IMPORT_TOKEN_TTL_SECONDS
            };
            const signature = await signWith(
                getTokenKey(),
                tokenMessage(claims)
            );

            return [
                claims.userId.toString(BASE36_RADIX),
                claims.urlHash,
                claims.expiresAt.toString(BASE36_RADIX),
                signature
            ].join(TOKEN_SEPARATOR);
        },
        async verifyImportToken(
            token: string,
            now: Date
        ): Promise<ImportTokenVerification> {
            const parts = token.split(TOKEN_SEPARATOR);
            const userId = parseBase36(parts[0]);
            const urlHash = parts[1];
            const expiresAt = parseBase36(parts[2]);
            const signature = parts[3];

            if (
                parts.length !== TOKEN_PART_COUNT ||
                userId === null ||
                urlHash === undefined ||
                !URL_HASH_PATTERN.test(urlHash) ||
                expiresAt === null ||
                signature === undefined ||
                !SIGNATURE_PATTERN.test(signature)
            ) {
                return { ok: false, reason: 'invalid' };
            }

            const claims: ImportTokenClaims = { userId, urlHash, expiresAt };

            if (
                !(await matches(getTokenKey(), tokenMessage(claims), signature))
            ) {
                return { ok: false, reason: 'invalid' };
            }

            if (expiresAt <= toEpochSeconds(now)) {
                return { ok: false, reason: 'expired' };
            }

            return { ok: true, claims };
        },
        signImage,
        async buildImportImageUrl(
            claims: Pick<ImportImageClaims, 'urlHash' | 'index'>,
            now: Date
        ) {
            const { expiresAt, signature } = await signImage(
                claims.urlHash,
                claims.index,
                now
            );
            const query = new URLSearchParams({
                e: String(expiresAt),
                s: signature
            });

            return `${LINK_IMAGE_PATH_PREFIX}/${claims.urlHash}/${claims.index}?${query.toString()}`;
        },
        async verifyImportImage(
            reference: { urlHash: string; index: number },
            params: SignedImportImageParams,
            now: Date
        ): Promise<ImportImageVerification> {
            if (
                !URL_HASH_PATTERN.test(reference.urlHash) ||
                !Number.isSafeInteger(reference.index) ||
                reference.index < 0 ||
                !Number.isSafeInteger(params.expiresAt) ||
                !SIGNATURE_PATTERN.test(params.signature)
            ) {
                return { ok: false, reason: 'invalid' };
            }

            const valid = await matches(
                getImageKey(),
                imageMessage(
                    reference.urlHash,
                    reference.index,
                    params.expiresAt
                ),
                params.signature
            );

            if (!valid) {
                return { ok: false, reason: 'invalid' };
            }

            if (params.expiresAt < toEpochSeconds(now)) {
                return { ok: false, reason: 'expired' };
            }

            return { ok: true };
        }
    };
};

export type ImportSigner = ReturnType<typeof createImportSigner>;
