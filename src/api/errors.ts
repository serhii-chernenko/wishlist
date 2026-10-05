import {
    API_ERROR_STATUS,
    type ApiErrorBody,
    type ApiErrorCode,
    type ApiErrorPayload
} from '../shared/app-api';

export type ApiErrorDetails = Omit<ApiErrorPayload, 'code'>;

export class ApiError extends Error {
    readonly code: ApiErrorCode;
    readonly details: ApiErrorDetails;

    constructor(code: ApiErrorCode, details: ApiErrorDetails = {}) {
        super(`API error: ${code}`);
        this.name = 'ApiError';
        this.code = code;
        this.details = details;
    }
}

export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

export const getApiErrorStatus = (code: ApiErrorCode) => {
    return API_ERROR_STATUS[code];
};

export const apiErrorResponse = (
    code: ApiErrorCode,
    details: ApiErrorDetails = {}
) => {
    const body: ApiErrorBody = { error: { code, ...details } };
    const headers = new Headers({ 'Content-Type': JSON_CONTENT_TYPE });

    if (details.retryAfter !== undefined) {
        headers.set('Retry-After', String(details.retryAfter));
    }

    return new Response(JSON.stringify(body), {
        status: getApiErrorStatus(code),
        headers
    });
};

const getErrorType = (error: unknown) => {
    return error instanceof Error ? error.name : typeof error;
};

const BODY_LIMIT_ERROR_NAME = 'BodyLimitError';

export const toApiErrorResponse = (error: unknown) => {
    if (error instanceof ApiError) {
        return apiErrorResponse(error.code, error.details);
    }

    if (error instanceof Error && error.name === BODY_LIMIT_ERROR_NAME) {
        return apiErrorResponse('payloadTooLarge');
    }

    console.warn(
        JSON.stringify({
            event: 'app_api_unhandled_error',
            errorType: getErrorType(error)
        })
    );

    return apiErrorResponse('internal');
};

export const readErrorCode = async (
    response: Response
): Promise<ApiErrorCode | null> => {
    if (response.status < 400) {
        return null;
    }

    try {
        const body = (await response.clone().json()) as Partial<ApiErrorBody>;

        return body.error?.code ?? null;
    } catch {
        return null;
    }
};
