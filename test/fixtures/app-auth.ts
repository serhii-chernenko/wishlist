import { createHmac, timingSafeEqual, webcrypto } from 'node:crypto';

import type { ApiCrypto } from '../../src/api/auth/crypto';

export const TEST_BOT_TOKEN = '123456:TEST';

export type InitDataFields = Record<string, string>;

export type InitDataEncoding = 'plus' | 'percent';

export interface InitDataUserFixture {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_bot?: boolean;
    [key: string]: unknown;
}

export type SpyingApiCrypto = ApiCrypto & { timingSafeEqualCalls: number };

export const createNodeApiCrypto = (): SpyingApiCrypto => {
    const subtle = webcrypto.subtle;
    const nodeCrypto = {
        timingSafeEqualCalls: 0,
        importKey(
            format: 'raw',
            keyData: Uint8Array,
            algorithm: { name: 'HMAC'; hash: 'SHA-256' },
            extractable: false,
            keyUsages: ['sign']
        ) {
            return subtle.importKey(
                format,
                keyData,
                algorithm,
                extractable,
                keyUsages
            );
        },
        sign(algorithm: 'HMAC', key: webcrypto.CryptoKey, data: Uint8Array) {
            return subtle.sign(algorithm, key, data);
        },
        digest(algorithm: 'SHA-256', data: Uint8Array) {
            return subtle.digest(algorithm, data);
        },
        timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer) {
            nodeCrypto.timingSafeEqualCalls += 1;

            return timingSafeEqual(Buffer.from(left), Buffer.from(right));
        }
    };

    return nodeCrypto as unknown as SpyingApiCrypto;
};

export const buildDataCheckString = (fields: InitDataFields) => {
    return Object.keys(fields)
        .filter(key => {
            return key !== 'hash';
        })
        .sort()
        .map(key => {
            return `${key}=${fields[key]}`;
        })
        .join('\n');
};

export const computeInitDataHash = (
    fields: InitDataFields,
    botToken: string = TEST_BOT_TOKEN
) => {
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();

    return createHmac('sha256', secret)
        .update(buildDataCheckString(fields))
        .digest('hex');
};

export const encodeInitData = (
    fields: InitDataFields,
    encoding: InitDataEncoding = 'plus'
) => {
    if (encoding === 'plus') {
        return new URLSearchParams(fields).toString();
    }

    return Object.entries(fields)
        .map(([key, value]) => {
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .join('&');
};

export const createInitDataFields = (input: {
    user: InitDataUserFixture;
    authDate: number;
    extra?: InitDataFields;
}): InitDataFields => {
    return {
        query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
        user: JSON.stringify({
            first_name: 'Test',
            ...input.user
        }),
        auth_date: String(input.authDate),
        signature: 'c2lnbmF0dXJlLWZpeHR1cmU',
        ...input.extra
    };
};

export const signInitData = (
    fields: InitDataFields,
    options: { botToken?: string; encoding?: InitDataEncoding } = {}
) => {
    return encodeInitData(
        { ...fields, hash: computeInitDataHash(fields, options.botToken) },
        options.encoding
    );
};

export const createSignedInitData = (input: {
    user: InitDataUserFixture;
    authDate: number;
    botToken?: string;
    extra?: InitDataFields;
}) => {
    return signInitData(
        createInitDataFields(input),
        input.botToken === undefined ? {} : { botToken: input.botToken }
    );
};
