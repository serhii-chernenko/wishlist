import {
    APP_RETRY_AFTER_SECONDS,
    type ApiErrorCode,
    type FieldErrorCode
} from '../../shared/app-api';
import { toErrorMessageKey, type AppFailure } from '../logic/errors';
import type { AppTranslator } from './i18n';

type PlainErrorCode = Exclude<ApiErrorCode, 'rateLimited'>;

export const failureMessage = (
    LL: AppTranslator,
    failure: AppFailure
): string => {
    const key = toErrorMessageKey(failure);

    if (key === 'rateLimited') {
        return LL.errors.rateLimited({
            seconds:
                failure.kind === 'api'
                    ? (failure.retryAfter ?? APP_RETRY_AFTER_SECONDS)
                    : APP_RETRY_AFTER_SECONDS
        });
    }

    if (key === 'generic' || key === 'network') {
        return LL.errors[key]();
    }

    return LL.errors[key as PlainErrorCode]();
};

export const fieldErrorMessage = (
    LL: AppTranslator,
    code: FieldErrorCode,
    max: number
): string => {
    return code === 'tooLong'
        ? LL.fieldErrors.tooLong({ max })
        : LL.fieldErrors[code]();
};
