import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import {
    APP_JSON_BODY_MAX_BYTES,
    APP_UPLOAD_MAX_BYTES,
    type FieldErrorCode,
    type FieldErrors
} from '../shared/app-api';
import type { ApiContext } from './context';
import { ApiError, apiErrorResponse } from './errors';

const MAX_OFFSET = 1_000_000;
const ID_PATTERN = /^[1-9]\d{0,15}$/;
const INDEX_PATTERN = /^(?:0|[1-9]\d{0,3})$/;
const OFFSET_PATTERN = /^(?:0|[1-9]\d{0,6})$/;
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;|$)/i;

const payloadTooLarge = () => {
    return apiErrorResponse('payloadTooLarge');
};

export const jsonBodyLimit = (): MiddlewareHandler => {
    return bodyLimit({
        maxSize: APP_JSON_BODY_MAX_BYTES,
        onError: payloadTooLarge
    });
};

export const uploadBodyLimit = (): MiddlewareHandler => {
    return bodyLimit({
        maxSize: APP_UPLOAD_MAX_BYTES,
        onError: payloadTooLarge
    });
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const invalidBody = () => {
    return new ApiError('validation', { fields: { body: 'invalid' } });
};

export const readJsonBody = async (
    c: ApiContext
): Promise<Record<string, unknown>> => {
    if (!JSON_CONTENT_TYPE_PATTERN.test(c.req.header('Content-Type') ?? '')) {
        throw new ApiError('unsupportedMedia');
    }

    const text = await c.req.text();
    let parsed: unknown;

    try {
        parsed = JSON.parse(text) as unknown;
    } catch {
        throw invalidBody();
    }

    if (!isRecord(parsed)) {
        throw invalidBody();
    }

    return parsed;
};

interface StringRule {
    maxLength?: number;
    trim?: boolean;
}

const countCodePoints = (value: string) => {
    return Array.from(value).length;
};

/**
 * Collects per-field errors while decoding a JSON body; `finish()` throws a
 * 422 `validation` ApiError carrying every collected `FieldErrorCode`.
 */
export const createBodyReader = (body: Record<string, unknown>) => {
    const fields: FieldErrors = {};

    const fail = (name: string, code: FieldErrorCode) => {
        if (fields[name] === undefined) {
            fields[name] = code;
        }
    };

    const has = (name: string) => {
        return Object.hasOwn(body, name) && body[name] !== undefined;
    };

    const readString = (name: string, rule: StringRule) => {
        const raw = body[name];

        if (typeof raw !== 'string') {
            fail(name, 'invalid');
            return undefined;
        }

        const value = rule.trim === false ? raw : raw.trim();

        if (
            rule.maxLength !== undefined &&
            countCodePoints(value) > rule.maxLength
        ) {
            fail(name, 'tooLong');
            return undefined;
        }

        return value;
    };

    return {
        body,
        has,
        fail,
        requiredString(name: string, rule: StringRule = {}) {
            if (!has(name)) {
                fail(name, 'required');
                return undefined;
            }

            const value = readString(name, rule);

            if (value !== undefined && value.length === 0) {
                fail(name, 'empty');
                return undefined;
            }

            return value;
        },
        optionalNullableString(name: string, rule: StringRule = {}) {
            if (!has(name)) {
                return undefined;
            }

            if (body[name] === null) {
                return null;
            }

            return readString(name, rule);
        },
        requiredBoolean(name: string) {
            const value = body[name];

            if (typeof value !== 'boolean') {
                fail(name, has(name) ? 'invalid' : 'required');
                return undefined;
            }

            return value;
        },
        optionalBoolean(name: string) {
            if (!has(name)) {
                return undefined;
            }

            const value = body[name];

            if (typeof value !== 'boolean') {
                fail(name, 'invalid');
                return undefined;
            }

            return value;
        },
        requiredOneOf<const Value extends string>(
            name: string,
            values: readonly Value[]
        ): Value | undefined {
            const value = body[name];
            const match = values.find(candidate => candidate === value);

            if (match === undefined) {
                fail(name, has(name) ? 'invalid' : 'required');
            }

            return match;
        },
        nullableIntegerInRange(name: string, min: number, max: number) {
            if (!has(name)) {
                fail(name, 'required');
                return undefined;
            }

            const value = body[name];

            if (value === null) {
                return null;
            }

            if (
                typeof value !== 'number' ||
                !Number.isInteger(value) ||
                value < min ||
                value > max
            ) {
                fail(name, 'invalid');
                return undefined;
            }

            return value;
        },
        errors() {
            return { ...fields };
        },
        finish() {
            if (Object.keys(fields).length > 0) {
                throw new ApiError('validation', { fields: { ...fields } });
            }
        }
    };
};

export type BodyReader = ReturnType<typeof createBodyReader>;

export const validationError = (name: string, code: FieldErrorCode) => {
    return new ApiError('validation', { fields: { [name]: code } });
};

export const readOffset = (c: ApiContext, name = 'offset') => {
    const raw = c.req.query(name);

    if (raw === undefined || raw === '') {
        return 0;
    }

    const value = OFFSET_PATTERN.test(raw) ? Number(raw) : Number.NaN;

    if (!Number.isSafeInteger(value) || value > MAX_OFFSET) {
        throw validationError(name, 'invalid');
    }

    return value;
};

export const readOptionalQueryInteger = (
    c: ApiContext,
    name: string,
    min: number,
    max: number
) => {
    const raw = c.req.query(name);

    if (raw === undefined || raw === '') {
        return undefined;
    }

    const value = OFFSET_PATTERN.test(raw) ? Number(raw) : Number.NaN;

    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw validationError(name, 'invalid');
    }

    return value;
};

export const readIdParam = (c: ApiContext, name: string) => {
    const raw = c.req.param(name) ?? '';
    const value = ID_PATTERN.test(raw) ? Number(raw) : Number.NaN;

    if (!Number.isSafeInteger(value)) {
        throw new ApiError('notFound');
    }

    return value;
};

export const readIndexParam = (c: ApiContext, name: string) => {
    const raw = c.req.param(name) ?? '';

    if (!INDEX_PATTERN.test(raw)) {
        throw new ApiError('notFound');
    }

    return Number(raw);
};

export const getNextOffset = (
    offset: number,
    pageLength: number,
    total: number
) => {
    const next = offset + pageLength;

    return pageLength > 0 && next < total ? next : null;
};
