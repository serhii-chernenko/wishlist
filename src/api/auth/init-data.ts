import {
    APP_INIT_DATA_MAX_AGE_SECONDS,
    APP_INIT_DATA_MAX_FUTURE_SKEW_SECONDS,
    type AuthRejectReason
} from '../../shared/app-api';
import {
    constantTimeEqual,
    encodeText,
    hexToBytes,
    hmacSha256,
    type ApiCrypto
} from './crypto';

export interface InitDataUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    allows_write_to_pm?: boolean;
    photo_url?: string;
}

export interface ValidatedInitData {
    user: InitDataUser;
    authDate: number;
    startParam: string | null;
    chatType: string | null;
    queryId: string | null;
}

export type InitDataValidation =
    | { ok: true; data: ValidatedInitData }
    | { ok: false; reason: AuthRejectReason };

export interface InitDataValidationOptions {
    botToken: string;
    nowSeconds: number;
    crypto: ApiCrypto;
}

const WEB_APP_DATA_KEY = 'WebAppData';
const HASH_FIELD = 'hash';
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const AUTH_DATE_PATTERN = /^\d{1,12}$/;

const rejected = (reason: AuthRejectReason): InitDataValidation => {
    return { ok: false, reason };
};

const readUniqueEntries = (raw: string) => {
    const entries = new Map<string, string>();

    for (const [key, value] of new URLSearchParams(raw)) {
        if (entries.has(key)) {
            return null;
        }

        entries.set(key, value);
    }

    return entries;
};

const buildDataCheckString = (entries: ReadonlyMap<string, string>) => {
    return [...entries.keys()]
        .filter(key => {
            return key !== HASH_FIELD;
        })
        .sort()
        .map(key => {
            return `${key}=${entries.get(key) ?? ''}`;
        })
        .join('\n');
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const readOptionalString = (
    record: Record<string, unknown>,
    key: string
): string | undefined | null => {
    const value = record[key];

    if (value === undefined) {
        return undefined;
    }

    return typeof value === 'string' ? value : null;
};

const readOptionalBoolean = (
    record: Record<string, unknown>,
    key: string
): boolean | undefined | null => {
    const value = record[key];

    if (value === undefined) {
        return undefined;
    }

    return typeof value === 'boolean' ? value : null;
};

const parseJson = (value: string): unknown => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return undefined;
    }
};

export const parseInitDataUser = (
    value: string | undefined
): InitDataUser | null => {
    if (value === undefined) {
        return null;
    }

    const parsed = parseJson(value);

    if (!isRecord(parsed)) {
        return null;
    }

    const { id } = parsed;

    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
        return null;
    }

    if (parsed.is_bot === true) {
        return null;
    }

    const firstName = readOptionalString(parsed, 'first_name');
    const lastName = readOptionalString(parsed, 'last_name');
    const username = readOptionalString(parsed, 'username');
    const languageCode = readOptionalString(parsed, 'language_code');
    const photoUrl = readOptionalString(parsed, 'photo_url');
    const isPremium = readOptionalBoolean(parsed, 'is_premium');
    const allowsWriteToPm = readOptionalBoolean(parsed, 'allows_write_to_pm');

    if (
        firstName === null ||
        lastName === null ||
        username === null ||
        languageCode === null ||
        photoUrl === null ||
        isPremium === null ||
        allowsWriteToPm === null
    ) {
        return null;
    }

    return {
        id,
        first_name: firstName ?? '',
        ...(lastName === undefined ? {} : { last_name: lastName }),
        ...(username === undefined || username === '' ? {} : { username }),
        ...(languageCode === undefined || languageCode === ''
            ? {}
            : { language_code: languageCode }),
        ...(isPremium === undefined ? {} : { is_premium: isPremium }),
        ...(allowsWriteToPm === undefined
            ? {}
            : { allows_write_to_pm: allowsWriteToPm }),
        ...(photoUrl === undefined ? {} : { photo_url: photoUrl })
    };
};

const computeInitDataHash = async (
    crypto: ApiCrypto,
    botToken: string,
    dataCheckString: string
) => {
    const secretKey = await hmacSha256(
        crypto,
        encodeText(WEB_APP_DATA_KEY),
        encodeText(botToken)
    );

    return hmacSha256(crypto, secretKey, encodeText(dataCheckString));
};

/**
 * Validates Telegram Mini App initData: every field except `hash` (including
 * `signature`) is signed with HMAC-SHA256 keyed by HMAC("WebAppData", token),
 * compared in constant time before any claim inside is trusted.
 */
export const validateInitData = async (
    raw: string,
    options: InitDataValidationOptions
): Promise<InitDataValidation> => {
    if (raw.length === 0) {
        return rejected('missing');
    }

    const entries = readUniqueEntries(raw);

    if (entries === null) {
        return rejected('malformed');
    }

    const hash = entries.get(HASH_FIELD);
    const authDateText = entries.get('auth_date');

    if (
        hash === undefined ||
        !HASH_PATTERN.test(hash) ||
        authDateText === undefined ||
        !AUTH_DATE_PATTERN.test(authDateText)
    ) {
        return rejected('malformed');
    }

    const expectedHash = await computeInitDataHash(
        options.crypto,
        options.botToken,
        buildDataCheckString(entries)
    );

    if (!constantTimeEqual(options.crypto, expectedHash, hexToBytes(hash))) {
        return rejected('badHash');
    }

    const user = parseInitDataUser(entries.get('user'));

    if (user === null) {
        return rejected('malformed');
    }

    const authDate = Number(authDateText);

    if (options.nowSeconds - authDate > APP_INIT_DATA_MAX_AGE_SECONDS) {
        return rejected('stale');
    }

    if (authDate - options.nowSeconds > APP_INIT_DATA_MAX_FUTURE_SKEW_SECONDS) {
        return rejected('future');
    }

    return {
        ok: true,
        data: {
            user,
            authDate,
            startParam: entries.get('start_param') ?? null,
            chatType: entries.get('chat_type') ?? null,
            queryId: entries.get('query_id') ?? null
        }
    };
};
