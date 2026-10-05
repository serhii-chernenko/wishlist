import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SYSTEM_TEXTS,
    resolveSystemLocale
} from '../src/app/i18n/system-texts';
import {
    getFieldErrors,
    getRetryDelayMs,
    hasErrorCode,
    isAppFailure,
    MAX_AUTO_RETRY_AFTER_SECONDS,
    MAX_GET_RETRIES,
    NETWORK_FAILURE,
    parseRetryAfterHeader,
    RETRY_BASE_DELAY_MS,
    toApiFailure,
    toErrorMessageKey,
    toSystemScreen
} from '../src/app/logic/errors';
import en from '../src/i18n/en';
import type { Translation } from '../src/i18n/i18n-types';
import pl from '../src/i18n/pl';
import uk from '../src/i18n/uk';
import { API_ERROR_STATUS, type ApiErrorCode } from '../src/shared/app-api';

test('the error envelope becomes a typed failure', () => {
    assert.deepEqual(
        toApiFailure(422, {
            error: { code: 'validation', fields: { title: 'empty' } }
        }),
        {
            kind: 'api',
            status: 422,
            code: 'validation',
            fields: { title: 'empty' }
        }
    );
    assert.deepEqual(
        toApiFailure(401, { error: { code: 'unauthorized', reason: 'stale' } }),
        { kind: 'api', status: 401, code: 'unauthorized', reason: 'stale' }
    );
    assert.deepEqual(
        toApiFailure(401, {
            error: { code: 'unauthorized', reason: 'tampered' }
        }),
        { kind: 'api', status: 401, code: 'unauthorized' }
    );
});

test('retryAfter comes from the body first, then from the header', () => {
    assert.equal(
        toApiFailure(
            429,
            { error: { code: 'rateLimited', retryAfter: 12 } },
            60
        ).retryAfter,
        12
    );
    assert.equal(
        toApiFailure(429, { error: { code: 'rateLimited' } }, 60).retryAfter,
        60
    );
    assert.equal(
        toApiFailure(429, { error: { code: 'rateLimited', retryAfter: -3 } })
            .retryAfter,
        undefined
    );
    assert.equal(parseRetryAfterHeader('7'), 7);
    assert.equal(parseRetryAfterHeader('1.2'), 2);
    assert.equal(parseRetryAfterHeader('soon'), undefined);
    assert.equal(parseRetryAfterHeader('0'), undefined);
    assert.equal(parseRetryAfterHeader(null), undefined);
});

test('bodies without an envelope fall back to a code for the status', () => {
    const expectations: Array<[number, ApiErrorCode]> = [
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [404, 'notFound'],
        [409, 'conflict'],
        [410, 'tokenExpired'],
        [413, 'payloadTooLarge'],
        [415, 'unsupportedMedia'],
        [422, 'validation'],
        [429, 'rateLimited'],
        [500, 'internal'],
        [501, 'notImplemented'],
        [502, 'upstream'],
        [503, 'internal'],
        [504, 'internal']
    ];

    for (const [status, code] of expectations) {
        assert.equal(toApiFailure(status, '<html>').code, code, String(status));
        assert.equal(toApiFailure(status, null).code, code, String(status));
    }

    assert.equal(
        toApiFailure(400, { error: { code: 'madeUp' } }).code,
        'internal'
    );
});

test('auth and preview failures map to system screens', () => {
    const unauthorized = (reason?: string) => {
        return toApiFailure(401, {
            error: { code: 'unauthorized', ...(reason && { reason }) }
        });
    };

    assert.equal(toSystemScreen(unauthorized('stale')), 'sessionExpired');
    assert.equal(toSystemScreen(unauthorized('badHash')), 'sessionExpired');
    assert.equal(toSystemScreen(unauthorized('future')), 'sessionExpired');
    assert.equal(toSystemScreen(unauthorized()), 'sessionExpired');
    assert.equal(toSystemScreen(unauthorized('missing')), 'outsideTelegram');
    assert.equal(
        toSystemScreen(
            toApiFailure(403, { error: { code: 'previewAccessDenied' } })
        ),
        'previewOnly'
    );

    for (const code of [
        'forbidden',
        'registrationRequired',
        'notFound',
        'tokenExpired',
        'rateLimited'
    ] as const) {
        assert.equal(
            toSystemScreen(
                toApiFailure(API_ERROR_STATUS[code], { error: { code } })
            ),
            null,
            code
        );
    }

    assert.equal(toSystemScreen(NETWORK_FAILURE), null);
});

test('only GET-safe failures are retried, with backoff and a short 429 wait', () => {
    assert.equal(getRetryDelayMs(NETWORK_FAILURE, 0), RETRY_BASE_DELAY_MS);
    assert.equal(getRetryDelayMs(NETWORK_FAILURE, 1), RETRY_BASE_DELAY_MS * 2);
    assert.equal(getRetryDelayMs(NETWORK_FAILURE, MAX_GET_RETRIES), null);

    for (const status of [500, 502, 504]) {
        assert.equal(
            getRetryDelayMs(toApiFailure(status, null), 0),
            RETRY_BASE_DELAY_MS,
            String(status)
        );
    }

    for (const status of [400, 401, 403, 404, 409, 422, 501, 503]) {
        assert.equal(
            getRetryDelayMs(toApiFailure(status, null), 0),
            null,
            String(status)
        );
    }

    const shortWait = toApiFailure(429, {
        error: { code: 'rateLimited', retryAfter: 2 }
    });
    const longWait = toApiFailure(429, {
        error: {
            code: 'rateLimited',
            retryAfter: MAX_AUTO_RETRY_AFTER_SECONDS + 1
        }
    });

    assert.equal(getRetryDelayMs(shortWait, 0), 2000);
    assert.equal(getRetryDelayMs(longWait, 0), null);
    assert.equal(getRetryDelayMs(toApiFailure(429, null), 0), null);
});

test('failures expose message keys, field errors and code checks', () => {
    const validation = toApiFailure(422, {
        error: { code: 'validation', fields: { price: 'invalid' } }
    });

    assert.equal(toErrorMessageKey(NETWORK_FAILURE), 'network');
    assert.equal(toErrorMessageKey(validation), 'validation');
    assert.deepEqual(getFieldErrors(validation), { price: 'invalid' });
    assert.deepEqual(getFieldErrors(NETWORK_FAILURE), {});
    assert.deepEqual(
        getFieldErrors(toApiFailure(409, { error: { code: 'conflict' } })),
        {}
    );
    assert.equal(hasErrorCode(validation, 'validation', 'conflict'), true);
    assert.equal(hasErrorCode(NETWORK_FAILURE, 'validation'), false);
    assert.equal(isAppFailure(validation), true);
    assert.equal(isAppFailure(NETWORK_FAILURE), true);
    assert.equal(isAppFailure(new Error('x')), false);
    assert.equal(isAppFailure(null), false);
});

test('every API error code has a localized message in every locale', () => {
    for (const dictionary of [uk, en, pl] as Translation[]) {
        for (const code of Object.keys(API_ERROR_STATUS)) {
            assert.equal(
                typeof (dictionary.app.errors as Record<string, unknown>)[code],
                'string',
                code
            );
        }
    }
});

test('bundled system screen texts match the app dictionaries', () => {
    const dictionaries: Record<'uk' | 'en' | 'pl', Translation> = {
        uk: uk as Translation,
        en,
        pl
    };

    for (const locale of ['uk', 'en', 'pl'] as const) {
        for (const [kind, texts] of Object.entries(SYSTEM_TEXTS[locale])) {
            assert.deepEqual(
                texts,
                (dictionaries[locale].app as Record<string, unknown>)[kind],
                `${locale}.${kind}`
            );
        }
    }
});

test('system screens pick a locale from the Telegram language code', () => {
    assert.equal(resolveSystemLocale('uk'), 'uk');
    assert.equal(resolveSystemLocale('uk-UA'), 'uk');
    assert.equal(resolveSystemLocale('pl'), 'pl');
    assert.equal(resolveSystemLocale('EN-us'), 'en');
    assert.equal(resolveSystemLocale('de'), 'en');
    assert.equal(resolveSystemLocale(''), 'uk');
    assert.equal(resolveSystemLocale(null), 'uk');
});
