import {
    APP_IMAGE_HASH_LENGTH,
    APP_IMAGE_PATH_PREFIX,
    APP_OWNER_TOKEN_TTL_SECONDS
} from '../../shared/app-api';
import {
    bytesToBase64Url,
    constantTimeEqual,
    encodeText,
    hmacSha256,
    importHmacKey,
    signWithKey,
    type ApiCrypto
} from './crypto';

export type SigningPurpose = 'owner-token' | 'image-url';

export type SignatureRejectReason = 'invalid' | 'expired';

export type OwnerTokenVerification =
    | { ok: true; ownerId: number; expiresAt: number }
    | { ok: false; reason: SignatureRejectReason };

export type ImageSignatureVerification =
    | { ok: true }
    | { ok: false; reason: SignatureRejectReason };

export type ImageAudience = 'owner' | 'viewer';

export interface ImageReference {
    wishId: number;
    index: number;
    hash: string;
    audience?: ImageAudience;
}

export interface SignedImageParams {
    expiresAt: number;
    signature: string;
}

export interface SignerOptions {
    botToken: string;
    environment: string;
    crypto: ApiCrypto;
}

const SECONDS_PER_HOUR = 3600;
const OWNER_TOKEN_VERSION = 'o1';
const IMAGE_SIGNATURE_VERSION = 'i1';
const VIEWER_IMAGE_MESSAGE_SUFFIX = 'v';
export const VIEWER_IMAGE_AUDIENCE_PARAM = 'v';
const TOKEN_SEPARATOR = '.';
const BASE36_RADIX = 36;
const BASE36_PATTERN = /^[0-9a-z]{1,11}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IMAGE_HASH_PATTERN = new RegExp(`^[0-9a-f]{${APP_IMAGE_HASH_LENGTH}}$`);

export const getSigningLabel = (
    purpose: SigningPurpose,
    environment: string
) => {
    return `wishlist:${purpose}:v1:${environment}`;
};

export const deriveSigningKey = async (
    options: SignerOptions,
    purpose: SigningPurpose
) => {
    const keyBytes = await hmacSha256(
        options.crypto,
        encodeText(options.botToken),
        encodeText(getSigningLabel(purpose, options.environment))
    );

    return importHmacKey(options.crypto, keyBytes);
};

export const toEpochSeconds = (date: Date) => {
    return Math.floor(date.getTime() / 1000);
};

export const getImageUrlExpiry = (now: Date) => {
    const nowSeconds = toEpochSeconds(now);

    return (
        Math.ceil(nowSeconds / SECONDS_PER_HOUR) * SECONDS_PER_HOUR +
        SECONDS_PER_HOUR
    );
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

const ownerTokenMessage = (
    ownerId: number,
    viewerUserId: number,
    expiresAt: number
) => {
    return `${OWNER_TOKEN_VERSION}|${ownerId}|${viewerUserId}|${expiresAt}`;
};

const imageMessage = (reference: ImageReference, expiresAt: number) => {
    const base = `${IMAGE_SIGNATURE_VERSION}|${reference.wishId}|${reference.index}|${reference.hash}|${expiresAt}`;

    return reference.audience === 'viewer'
        ? `${base}|${VIEWER_IMAGE_MESSAGE_SUFFIX}`
        : base;
};

const isImageReference = (reference: ImageReference) => {
    return (
        Number.isSafeInteger(reference.wishId) &&
        reference.wishId > 0 &&
        Number.isSafeInteger(reference.index) &&
        reference.index >= 0 &&
        IMAGE_HASH_PATTERN.test(reference.hash)
    );
};

/**
 * Owner tokens are `base36(ownerId).base36(exp).b64url(HMAC)`, bound to the
 * viewer's users.id; image URLs are signed per wish/index/hash with an
 * expiry rounded to the hour so they stay cacheable. Keys are derived from
 * BOT_TOKEN with purpose and environment labels.
 */
export const createSigner = (options: SignerOptions) => {
    const keys = new Map<SigningPurpose, Promise<CryptoKey>>();

    const getKey = (purpose: SigningPurpose) => {
        const cached = keys.get(purpose);

        if (cached) {
            return cached;
        }

        const derived = deriveSigningKey(options, purpose);

        keys.set(purpose, derived);

        return derived;
    };

    const sign = async (purpose: SigningPurpose, message: string) => {
        return bytesToBase64Url(
            await signWithKey(options.crypto, await getKey(purpose), message)
        );
    };

    const matches = async (
        purpose: SigningPurpose,
        message: string,
        signature: string
    ) => {
        const expected = await sign(purpose, message);

        return constantTimeEqual(
            options.crypto,
            encodeText(expected),
            encodeText(signature)
        );
    };

    const signImage = async (
        reference: ImageReference,
        now: Date
    ): Promise<SignedImageParams> => {
        const expiresAt = getImageUrlExpiry(now);

        return {
            expiresAt,
            signature: await sign(
                'image-url',
                imageMessage(reference, expiresAt)
            )
        };
    };

    return {
        async mintOwnerToken(input: {
            ownerId: number;
            viewerUserId: number;
            now: Date;
        }) {
            const expiresAt =
                toEpochSeconds(input.now) + APP_OWNER_TOKEN_TTL_SECONDS;
            const signature = await sign(
                'owner-token',
                ownerTokenMessage(input.ownerId, input.viewerUserId, expiresAt)
            );

            return [
                input.ownerId.toString(BASE36_RADIX),
                expiresAt.toString(BASE36_RADIX),
                signature
            ].join(TOKEN_SEPARATOR);
        },
        async verifyOwnerToken(
            token: string,
            input: { viewerUserId: number; now: Date }
        ): Promise<OwnerTokenVerification> {
            const parts = token.split(TOKEN_SEPARATOR);
            const ownerId = parseBase36(parts[0]);
            const expiresAt = parseBase36(parts[1]);
            const signature = parts[2];

            if (
                parts.length !== 3 ||
                ownerId === null ||
                expiresAt === null ||
                signature === undefined ||
                !SIGNATURE_PATTERN.test(signature)
            ) {
                return { ok: false, reason: 'invalid' };
            }

            const valid = await matches(
                'owner-token',
                ownerTokenMessage(ownerId, input.viewerUserId, expiresAt),
                signature
            );

            if (!valid) {
                return { ok: false, reason: 'invalid' };
            }

            if (expiresAt <= toEpochSeconds(input.now)) {
                return { ok: false, reason: 'expired' };
            }

            return { ok: true, ownerId, expiresAt };
        },
        signImage,
        async buildImageUrl(reference: ImageReference, now: Date) {
            const { expiresAt, signature } = await signImage(reference, now);
            const query = new URLSearchParams({
                e: String(expiresAt),
                s: signature,
                ...(reference.audience === 'viewer' && {
                    a: VIEWER_IMAGE_AUDIENCE_PARAM
                })
            });

            return `${APP_IMAGE_PATH_PREFIX}/${reference.wishId}/${reference.index}/${reference.hash}?${query.toString()}`;
        },
        async verifyImage(
            reference: ImageReference,
            params: SignedImageParams,
            now: Date
        ): Promise<ImageSignatureVerification> {
            if (
                !isImageReference(reference) ||
                !Number.isSafeInteger(params.expiresAt) ||
                !SIGNATURE_PATTERN.test(params.signature)
            ) {
                return { ok: false, reason: 'invalid' };
            }

            const valid = await matches(
                'image-url',
                imageMessage(reference, params.expiresAt),
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

export type Signer = ReturnType<typeof createSigner>;
