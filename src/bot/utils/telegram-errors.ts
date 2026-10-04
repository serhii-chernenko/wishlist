const TELEGRAM_BAD_REQUEST = 400;
const TELEGRAM_FORBIDDEN = 403;
const TELEGRAM_TOO_MANY_REQUESTS = 429;

interface TelegramErrorShape {
    response?: {
        error_code?: unknown;
        description?: unknown;
        parameters?: { retry_after?: unknown };
    };
}

const asTelegramError = (error: unknown): TelegramErrorShape | null => {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    return error as TelegramErrorShape;
};

export const getTelegramErrorCode = (error: unknown): number | null => {
    const code = asTelegramError(error)?.response?.error_code;

    return typeof code === 'number' ? code : null;
};

export const getTelegramErrorDescription = (error: unknown): string => {
    const description = asTelegramError(error)?.response?.description;

    return typeof description === 'string' ? description : '';
};

export const getTelegramRetryAfterSeconds = (error: unknown): number | null => {
    if (getTelegramErrorCode(error) !== TELEGRAM_TOO_MANY_REQUESTS) {
        return null;
    }

    const retryAfter =
        asTelegramError(error)?.response?.parameters?.retry_after;

    return typeof retryAfter === 'number' && retryAfter >= 0
        ? retryAfter
        : null;
};

export const isTelegramBadRequest = (error: unknown) => {
    return getTelegramErrorCode(error) === TELEGRAM_BAD_REQUEST;
};

const BUTTON_URL_ERROR_PATTERN =
    /button_url_invalid|inline keyboard button url|wrong http url/i;

export const isTelegramButtonUrlError = (error: unknown) => {
    return (
        isTelegramBadRequest(error) &&
        BUTTON_URL_ERROR_PATTERN.test(getTelegramErrorDescription(error))
    );
};

export const isTelegramForbidden = (error: unknown) => {
    return getTelegramErrorCode(error) === TELEGRAM_FORBIDDEN;
};

export const isTelegramTooManyRequests = (error: unknown) => {
    return getTelegramErrorCode(error) === TELEGRAM_TOO_MANY_REQUESTS;
};

export const isMessageNotModified = (error: unknown) => {
    return (
        isTelegramBadRequest(error) &&
        getTelegramErrorDescription(error).includes('message is not modified')
    );
};
