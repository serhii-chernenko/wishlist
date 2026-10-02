export const failValidation = (location: string, message: string): never => {
    throw new Error(`Invalid Mongo export at ${location}: ${message}`);
};

export const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const readRecord = (
    value: unknown,
    location: string
): Record<string, unknown> => {
    if (!isRecord(value)) {
        return failValidation(location, 'expected an object');
    }

    return value;
};

export const readMongoOid = (value: unknown, location: string): string => {
    const oidRecord = readRecord(value, location);
    const oid = oidRecord.$oid;

    if (typeof oid !== 'string' || !/^[0-9a-f]{24}$/i.test(oid)) {
        return failValidation(location, 'expected an Extended JSON ObjectId');
    }

    return oid.toLowerCase();
};

export const readOptionalMongoOid = (
    value: unknown,
    location: string
): string | null => {
    if (value === undefined || value === null) {
        return null;
    }

    return readMongoOid(value, location);
};

export const objectIdTimestampMilliseconds = (oid: string) => {
    return Number.parseInt(oid.slice(0, 8), 16) * 1000;
};

const readNumberWrapper = (record: Record<string, unknown>) => {
    const keys = Object.keys(record);
    const [key] = keys;

    if (keys.length !== 1 || key === undefined) {
        return undefined;
    }

    const wrapped = record[key];

    if (typeof wrapped !== 'string') {
        return undefined;
    }

    if (key === '$numberInt' || key === '$numberLong') {
        return /^-?\d+$/.test(wrapped) ? Number(wrapped) : undefined;
    }

    if (key === '$numberDouble') {
        return /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(wrapped)
            ? Number(wrapped)
            : undefined;
    }

    return undefined;
};

export const readMongoNumber = (value: unknown, location: string): number => {
    const parsed = isRecord(value) ? readNumberWrapper(value) : value;

    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
        return failValidation(
            location,
            'expected a finite number or Extended JSON number'
        );
    }

    return parsed;
};

export const readMongoInteger = (
    value: unknown,
    location: string,
    minimum?: number
): number => {
    const parsed = readMongoNumber(value, location);

    if (!Number.isSafeInteger(parsed)) {
        return failValidation(location, 'expected a safe integer');
    }

    if (minimum !== undefined && parsed < minimum) {
        return failValidation(
            location,
            `expected an integer greater than or equal to ${minimum}`
        );
    }

    return parsed;
};

export const readMongoDate = (value: unknown, location: string): number => {
    const dateRecord = readRecord(value, location);
    const extendedDate = dateRecord.$date;
    let timestamp: number;

    if (typeof extendedDate === 'string') {
        timestamp = Date.parse(extendedDate);
    } else if (typeof extendedDate === 'number') {
        timestamp = extendedDate;
    } else {
        const canonicalDate = readRecord(extendedDate, `${location}.$date`);
        const numberLong = canonicalDate.$numberLong;

        if (typeof numberLong !== 'string' || !/^-?\d+$/.test(numberLong)) {
            return failValidation(
                location,
                'expected an Extended JSON date string or $numberLong'
            );
        }

        timestamp = Number(numberLong);
    }

    if (
        !Number.isSafeInteger(timestamp) ||
        Number.isNaN(new Date(timestamp).getTime())
    ) {
        return failValidation(location, 'expected a valid millisecond date');
    }

    return timestamp;
};

export const readMongoBoolean = (
    value: unknown,
    location: string,
    fallback: boolean
): boolean => {
    if (value === undefined || value === null) {
        return fallback;
    }

    if (typeof value !== 'boolean') {
        return failValidation(location, 'expected a boolean');
    }

    return value;
};

export const readOptionalText = (
    value: unknown,
    location: string,
    maximumLength: number
): string | null => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    if (typeof value !== 'string') {
        return failValidation(location, 'expected a string');
    }

    if (value.length > maximumLength) {
        return failValidation(
            location,
            `expected at most ${maximumLength} characters`
        );
    }

    if (value.includes('\u0000')) {
        return failValidation(location, 'must not contain NUL characters');
    }

    return value;
};

export const rejectUnknownKeys = (
    record: Record<string, unknown>,
    allowedKeys: ReadonlySet<string>,
    location: string
) => {
    for (const key of Object.keys(record)) {
        if (!allowedKeys.has(key)) {
            failValidation(location, `unexpected field "${key}"`);
        }
    }
};
