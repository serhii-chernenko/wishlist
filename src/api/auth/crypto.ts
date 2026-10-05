export interface ApiCrypto {
    importKey(
        format: 'raw',
        keyData: Uint8Array,
        algorithm: { name: 'HMAC'; hash: 'SHA-256' },
        extractable: false,
        keyUsages: ['sign']
    ): Promise<CryptoKey>;
    sign(
        algorithm: 'HMAC',
        key: CryptoKey,
        data: Uint8Array
    ): Promise<ArrayBuffer>;
    digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
    timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean;
}

const HMAC_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;

const textEncoder = new TextEncoder();

export const encodeText = (value: string) => {
    return textEncoder.encode(value);
};

export const importHmacKey = (crypto: ApiCrypto, keyData: Uint8Array) => {
    return crypto.importKey('raw', keyData, HMAC_ALGORITHM, false, ['sign']);
};

export const hmacSha256 = async (
    crypto: ApiCrypto,
    keyData: Uint8Array,
    message: Uint8Array
) => {
    const key = await importHmacKey(crypto, keyData);

    return new Uint8Array(await crypto.sign('HMAC', key, message));
};

export const signWithKey = async (
    crypto: ApiCrypto,
    key: CryptoKey,
    message: string
) => {
    return new Uint8Array(await crypto.sign('HMAC', key, encodeText(message)));
};

export const bytesToHex = (bytes: Uint8Array) => {
    return Array.from(bytes, byte => {
        return byte.toString(16).padStart(2, '0');
    }).join('');
};

export const hexToBytes = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);

    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }

    return bytes;
};

export const bytesToBase64Url = (bytes: Uint8Array) => {
    const binary = Array.from(bytes, byte => {
        return String.fromCharCode(byte);
    }).join('');

    return btoa(binary)
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
};

const toArrayBuffer = (bytes: Uint8Array) => {
    const copy = new Uint8Array(bytes.byteLength);

    copy.set(bytes);

    return copy.buffer;
};

export const constantTimeEqual = (
    crypto: ApiCrypto,
    left: Uint8Array,
    right: Uint8Array
) => {
    if (left.byteLength !== right.byteLength) {
        return false;
    }

    return crypto.timingSafeEqual(toArrayBuffer(left), toArrayBuffer(right));
};

export const sha256Hex = async (crypto: ApiCrypto, value: string) => {
    return bytesToHex(
        new Uint8Array(await crypto.digest('SHA-256', encodeText(value)))
    );
};

export const getRuntimeCrypto = (): ApiCrypto => {
    return crypto.subtle as unknown as ApiCrypto;
};
