import assert from 'node:assert/strict';
import test from 'node:test';

import {
    APP_API_TELEMETRY_PATH,
    APP_IMAGE_TELEMETRY_PATH,
    APP_TELEMETRY_PATH,
    appApiCompletedEvent,
    appAuthRejectedEvent,
    appClientEvent,
    appPhotoUploadedEvent,
    appRateLimitedEvent,
    appRateLimiterMissingEvent,
    appSessionStartedEvent,
    emitHttpRequestTelemetry,
    imageProxyServedEvent,
    SHARE_IMAGE_TELEMETRY_PATH,
    emitSharePageServedTelemetry,
    emitTelemetryEvent,
    getCallbackDataCategory,
    getTelegramCallbackCategory,
    getTelegramCommandCategory,
    getTelegramUpdateType,
    HOME_PAGE_TELEMETRY_PATH,
    normalizeTelemetryPath,
    SHARE_PAGE_TELEMETRY_PATH,
    toWishlistAttributes
} from '../src/worker/telemetry';
import type { WorkerBindings } from '../src/worker/env';

test('telemetry normalizes Telegram routes and classifies commands without retaining text', () => {
    const secretPath = '/telegram/secret-webhook-path';

    assert.equal(
        normalizeTelemetryPath(secretPath, secretPath),
        '/telegram/webhook'
    );
    assert.equal(
        normalizeTelemetryPath('/telegram/untrusted-route', secretPath),
        '/telegram/webhook'
    );
    assert.equal(
        normalizeTelemetryPath('/unknown-route', secretPath),
        '/unknown'
    );
    assert.equal(
        getTelegramCommandCategory({
            message: { text: '/start something confidential' }
        }),
        'start'
    );
    assert.equal(
        getTelegramCommandCategory({
            message: { text: '/unlisted confidential command' }
        }),
        'otherCommand'
    );
    assert.equal(
        getTelegramCommandCategory({
            message: { text: '/lang@wishlist_ua_bot uk' }
        }),
        'lang'
    );
    assert.equal(
        getTelegramCommandCategory({ message: { text: '/releases' } }),
        'releases'
    );
    assert.equal(
        getTelegramCommandCategory({ message: { text: 'My new wish' } }),
        'message'
    );
    assert.equal(
        getTelegramCommandCategory({
            message: { contact: { phone_number: '380991112233' } }
        }),
        'contact'
    );
    assert.equal(
        getTelegramCommandCategory({
            message: { photo: [{ file_id: 'abc' }] }
        }),
        'photo'
    );
    assert.equal(
        getTelegramCommandCategory({ message: { sticker: {} } }),
        'nonCommand'
    );
    assert.equal(
        getTelegramCommandCategory({ callback_query: { data: 'n:home' } }),
        'nonCommand'
    );
});

test('telemetry classifies update types in a closed set', () => {
    assert.equal(getTelegramUpdateType({ message: {} }), 'message');
    assert.equal(
        getTelegramUpdateType({ callback_query: {} }),
        'callback_query'
    );
    assert.equal(
        getTelegramUpdateType({ my_chat_member: {} }),
        'my_chat_member'
    );
    assert.equal(getTelegramUpdateType({ edited_message: {} }), 'other');
    assert.equal(getTelegramUpdateType(null), 'other');
    assert.equal(getTelegramUpdateType('text'), 'other');
});

test('callback categories map every callback family to a closed id-free label', () => {
    const expectations: [string, string][] = [
        ['n:home', 'nav:home'],
        ['n:wl', 'nav:wishlist'],
        ['n:priv', 'nav:privacy'],
        ['n:rel', 'nav:releases'],
        ['n:set', 'nav:settings'],
        ['n:cur', 'nav:currency'],
        ['n:dlv', 'nav:delivery'],
        ['n:dsc', 'nav:disclosure'],
        ['n:imp', 'nav:listImport'],
        ['imp:s:rw', 'import:source'],
        ['imp:s:xx', 'invalid'],
        ['imp:v:h:42', 'import:visibility'],
        ['imp:v:p:42', 'import:visibility'],
        ['imp:v:x:42', 'invalid'],
        ['imp:go:42', 'import:commit'],
        ['imp:x:42', 'import:cancel'],
        ['imp:r:42', 'import:refresh'],
        ['imp:go:abc', 'invalid'],
        ['wl:p:20', 'wishlist:page'],
        ['wl:clean', 'wishlist:clean'],
        ['wl:clean:y', 'wishlist:cleanConfirm'],
        ['wl:share', 'wishlist:share'],
        ['wl:share:y', 'wishlist:sharePublish'],
        ['wl:share:stop', 'wishlist:shareStop'],
        ['wl:share:stop:y', 'wishlist:shareStopConfirm'],
        ['wl:share:new', 'wishlist:shareRotate'],
        ['wl:share:new:y', 'wishlist:shareRotateConfirm'],
        ['wl:share:u', 'wishlist:shareUsername'],
        ['wl:share:idx', 'wishlist:shareIndexing'],
        ['wl:share:g', 'wishlist:shareGifted'],
        ['wl:share:stop:n', 'invalid'],
        ['wl:f', 'wishlist:filter'],
        ['wl:f:3', 'wishlist:filter'],
        ['wl:f:x', 'wishlist:filter'],
        ['w:e:123', 'wish:edit'],
        ['w:r:123', 'wish:remove'],
        ['w:r:y:123', 'wish:removeDone'],
        ['w:r:n:123', 'wish:removeNotDone'],
        ['w:t:123', 'wish:priorityMenu'],
        ['w:pm:123', 'wish:priorityMenu'],
        ['w:pl:123:3', 'wish:prioritySet'],
        ['w:pl:123:9', 'invalid'],
        ['w:cu:123:EUR', 'wish:currency'],
        ['w:io:123', 'wish:imagesOrder'],
        ['w:if:123:2:0a1b2c3d', 'wish:imageFirst'],
        ['w:v:123', 'wish:visibility'],
        ['w:f:t:123', 'wish:field'],
        ['w:back:123', 'wish:back'],
        ['w:add', 'wish:add'],
        ['t:p:456:10', 'third:page'],
        ['t:g:123', 'third:give'],
        ['t:t:123', 'third:take'],
        ['t:f:456', 'third:filter'],
        ['t:f:456:2', 'third:filter'],
        ['g:p:10', 'give:page'],
        ['g:r:123', 'give:remove'],
        ['g:clean', 'give:clean'],
        ['g:clean:y', 'give:cleanConfirm'],
        ['a:u', 'auth:type'],
        ['p:rm', 'payments:remove'],
        ['cur:PLN', 'currency'],
        ['dsc:h', 'disclosure:toggle'],
        ['dsc:a:y', 'disclosure:confirm'],
        ['dsc:p:y', 'invalid'],
        ['dlv:rm', 'delivery:remove'],
        ['l:auto', 'language:set'],
        ['x', 'noop'],
        ['wishlist_add', 'legacy'],
        ['edit_5f3a9c2b1d4e6f7a8b9c0d1e', 'legacy'],
        ['n:unknown', 'invalid'],
        ['w:e:abc', 'invalid'],
        ['w:e:1:2', 'invalid'],
        ['', 'invalid']
    ];

    for (const [data, category] of expectations) {
        assert.equal(getCallbackDataCategory(data), category, data);
    }

    assert.equal(getCallbackDataCategory(undefined), 'invalid');
    assert.equal(getCallbackDataCategory(42), 'invalid');
    assert.equal(getCallbackDataCategory('w:e:1'.repeat(40)), 'invalid');
    assert.equal(getTelegramCallbackCategory({ message: {} }), undefined);
    assert.equal(
        getTelegramCallbackCategory({ callback_query: { data: 'g:r:77' } }),
        'give:remove'
    );
    assert.equal(
        getTelegramCallbackCategory({ callback_query: {} }),
        'invalid'
    );
});

test('Wishlist telemetry exposes safe dimensions as queryable log attributes', () => {
    const event = toWishlistAttributes(
        {
            event: 'telegram_webhook_completed',
            outcome: 'accepted',
            commandCategory: 'start',
            updateType: 'callback_query',
            callbackCategory: 'wish:edit',
            idempotencyOutcome: 'processed'
        },
        'production'
    );

    assert.deepEqual(event, {
        eventName: 'telegram_webhook_completed',
        outcome: 'accepted',
        commandCategory: 'start',
        updateType: 'callback_query',
        callbackCategory: 'wish:edit',
        idempotencyOutcome: 'processed',
        botEnvironment: 'production'
    });
    assert.equal(JSON.stringify(event).includes('secret-webhook-path'), false);
    assert.equal(JSON.stringify(event).includes('message text'), false);
});

test('Wishlist telemetry reports the measured duration as elapsedMs and never as durationMs', () => {
    const attributes = toWishlistAttributes(
        { event: 'http_request_completed', status: 200, elapsedMs: 37 },
        'production'
    );

    assert.equal(attributes.elapsedMs, 37);
    assert.equal('durationMs' in attributes, false);
});

test('only production ships queryable evlog attributes to New Relic EU', async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; headers: Headers; body: string }[] = [];
    const background: Promise<unknown>[] = [];

    globalThis.fetch = async (input, init) => {
        requests.push({
            url: String(input),
            headers: new Headers(init?.headers),
            body: String(init?.body)
        });
        return new Response('{}', { status: 200 });
    };

    try {
        const context = {
            waitUntil(promise: Promise<unknown>) {
                background.push(promise);
            }
        };
        const baseEnv = {
            NEW_RELIC_LICENSE_KEY: 'test-license-key'
        } as WorkerBindings;

        emitTelemetryEvent(
            { ...baseEnv, BOT_ENVIRONMENT: 'preview' },
            context,
            { event: 'http_request_completed', status: 200 }
        );
        assert.equal(background.length, 0);

        emitTelemetryEvent(
            { ...baseEnv, BOT_ENVIRONMENT: 'production' },
            context,
            {
                event: 'telegram_webhook_completed',
                outcome: 'accepted',
                commandCategory: 'start',
                status: 200
            }
        );
        assert.equal(background.length, 1);
        await Promise.all(background);
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, 'https://otlp.eu01.nr-data.net/v1/logs');
    assert.equal(requests[0]?.headers.get('api-key'), 'test-license-key');
    assert.equal(requests[0]?.headers.get('content-type'), 'application/json');

    const payload = JSON.parse(requests[0]?.body ?? '') as {
        resourceLogs: {
            resource: {
                attributes: { key: string; value: { stringValue?: string } }[];
            };
            scopeLogs: {
                logRecords: {
                    attributes: {
                        key: string;
                        value: { stringValue?: string };
                    }[];
                }[];
            }[];
        }[];
    };
    const resourceAttributes = payload.resourceLogs[0]?.resource.attributes;
    const logAttributes =
        payload.resourceLogs[0]?.scopeLogs[0]?.logRecords[0]?.attributes;

    assert.equal(
        resourceAttributes?.find(attribute => attribute.key === 'service.name')
            ?.value.stringValue,
        'wishlist'
    );
    assert.equal(
        logAttributes?.find(attribute => attribute.key === 'eventName')?.value
            .stringValue,
        'telegram_webhook_completed'
    );
    assert.equal(
        logAttributes?.find(attribute => attribute.key === 'commandCategory')
            ?.value.stringValue,
        'start'
    );
});

test('telemetry attributes replace unsafe label values instead of forwarding them', () => {
    const attributes = toWishlistAttributes(
        {
            event: 'bot_action_completed',
            action: 'wish_updated',
            result: 'found',
            field: 'price',
            callbackCategory: 'w:e:123456789'
        },
        'production'
    );

    assert.equal(attributes.action, 'wish_updated');
    assert.equal(attributes.result, 'found');
    assert.equal(attributes.field, 'price');
    assert.equal(attributes.callbackCategory, 'invalid');
    assert.equal(
        toWishlistAttributes(
            { event: 'bot_action_completed', result: 'user 12345' },
            'production'
        ).result,
        'invalid'
    );
});

test('snapshot and language count fields stay numeric dimensions', () => {
    assert.deepEqual(
        toWishlistAttributes(
            {
                event: 'user_language_count',
                locale: 'auto',
                languageCount: 12,
                outcome: 'success'
            },
            'production'
        ),
        {
            eventName: 'user_language_count',
            locale: 'auto',
            languageCount: 12,
            outcome: 'success',
            botEnvironment: 'production'
        }
    );
});

const createSeededRandom = (seed: number) => {
    let state = seed;

    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
};

const pickRandom = <T>(random: () => number, items: readonly T[]) => {
    return items[Math.floor(random() * items.length)] as T;
};

const randomDigits = (random: () => number, length: number) => {
    return Array.from({ length }, () => Math.floor(random() * 10)).join('');
};

test('telemetry never leaks Telegram ids or digits from callback data', async () => {
    const random = createSeededRandom(20261002);
    const templates = [
        () => 'n:wl',
        (id: string, offset: string) => `wl:p:${offset}`,
        (id: string) => `w:e:${id}`,
        (id: string) => `w:r:y:${id}`,
        (id: string) => `w:f:p:${id}`,
        (id: string, offset: string) => `t:p:${id}:${offset}`,
        (id: string, offset: string) => `t:f:${id}:${offset}`,
        (id: string) => `t:g:${id}`,
        (id: string) => `g:r:${id}`,
        (id: string) => `edit_${id}${id}`,
        (id: string, offset: string) => `${id}:${offset}`,
        (id: string, offset: string) => `w:e:${id}\n${offset}`,
        (id: string) => `wl:p:${id}${id}${id}`
    ];
    const originalFetch = globalThis.fetch;
    const shippedBodies: string[] = [];
    const background: Promise<unknown>[] = [];

    globalThis.fetch = async (_input, init) => {
        shippedBodies.push(String(init?.body));
        return new Response('{}', { status: 200 });
    };

    try {
        const env = {
            NEW_RELIC_LICENSE_KEY: 'test-license-key',
            BOT_ENVIRONMENT: 'production'
        } as WorkerBindings;
        const context = {
            waitUntil(promise: Promise<unknown>) {
                background.push(promise);
            }
        };

        for (let iteration = 0; iteration < 200; iteration += 1) {
            const userId = randomDigits(random, 9) + '7';
            const entityId = '9' + randomDigits(random, 8);
            const offset = '8' + randomDigits(random, 6);
            const data = pickRandom(random, templates)(entityId, offset);
            const payload = {
                update_id: Number('5' + randomDigits(random, 8)),
                callback_query: {
                    id: randomDigits(random, 18),
                    from: { id: Number(userId), username: 'someone_' + userId },
                    message: {
                        message_id: Number(randomDigits(random, 6)),
                        chat: { id: Number(userId), type: 'private' }
                    },
                    data
                }
            };
            const callbackCategory = getTelegramCallbackCategory(payload);
            const commandCategory = getTelegramCommandCategory(payload);
            const updateType = getTelegramUpdateType(payload);

            assert.doesNotMatch(callbackCategory ?? '', /\d/, data);
            assert.doesNotMatch(commandCategory, /\d/);
            assert.doesNotMatch(updateType, /\d/);

            const attributes = toWishlistAttributes(
                {
                    event: 'telegram_webhook_completed',
                    outcome: 'accepted',
                    commandCategory,
                    updateType,
                    ...(callbackCategory === undefined
                        ? {}
                        : { callbackCategory }),
                    idempotencyOutcome: 'processed'
                },
                'production'
            );
            const serialized = JSON.stringify(attributes);

            for (const secret of [userId, entityId, offset, data]) {
                assert.equal(serialized.includes(secret), false, secret);
            }

            emitTelemetryEvent(env, context, {
                event: 'telegram_webhook_completed',
                outcome: 'accepted',
                commandCategory,
                updateType,
                ...(callbackCategory === undefined ? {} : { callbackCategory }),
                idempotencyOutcome: 'processed',
                status: 200
            });

            await Promise.all(background);

            for (const secret of [userId, entityId]) {
                assert.equal(
                    (shippedBodies.at(-1) ?? '').includes(secret),
                    false,
                    secret
                );
            }
        }
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(shippedBodies.length > 0, true);
});

test('share page paths collapse to one id-free route and robots.txt stays known', () => {
    const publicId = '01k6g4z8q3m2n7p5r9s1t0v6wx';

    for (const path of [
        `/w/${publicId}`,
        `/ua/w/${publicId}`,
        `/uk/w/${publicId}`,
        `/en/w/${publicId.toUpperCase()}`,
        `/pl/w/${publicId}/extra`,
        '/w/not-a-ulid',
        '/w'
    ]) {
        assert.equal(
            normalizeTelemetryPath(path, '/telegram/secret'),
            SHARE_PAGE_TELEMETRY_PATH,
            path
        );
    }

    assert.equal(SHARE_PAGE_TELEMETRY_PATH, '/w/:publicId');
    assert.equal(normalizeTelemetryPath('/robots.txt', null), '/robots.txt');
    assert.equal(normalizeTelemetryPath('/de/w/abc', null), '/unknown');
    assert.equal(normalizeTelemetryPath('/status', null), '/status');
    assert.equal(normalizeTelemetryPath('/sitemap.xml', null), '/sitemap.xml');

    for (const path of ['/ua', '/en', '/pl', '/uk', '/ua/', '/pl/']) {
        assert.equal(
            normalizeTelemetryPath(path, null),
            HOME_PAGE_TELEMETRY_PATH,
            path
        );
    }

    assert.equal(HOME_PAGE_TELEMETRY_PATH, '/:lang');
    assert.equal(normalizeTelemetryPath('/de', null), '/unknown');
    assert.equal(normalizeTelemetryPath('/wishes', null), '/unknown');
});

test('share_page_served keeps cacheOutcome as a safe label next to numeric fields', () => {
    assert.deepEqual(
        toWishlistAttributes(
            {
                event: 'share_page_served',
                result: 'cached',
                cacheOutcome: 'hit',
                locale: 'pl',
                status: 200,
                elapsedMs: 4,
                visibleWishes: 12
            },
            'production'
        ),
        {
            eventName: 'share_page_served',
            result: 'cached',
            cacheOutcome: 'hit',
            locale: 'pl',
            status: 200,
            elapsedMs: 4,
            visibleWishes: 12,
            botEnvironment: 'production'
        }
    );
    assert.equal(
        toWishlistAttributes(
            {
                event: 'share_page_served',
                cacheOutcome: '01k6g4z8q3m2n7p5r9s1t0v6wx' as 'hit'
            },
            'production'
        ).cacheOutcome,
        'invalid'
    );
});

const crockfordAlphabet = '0123456789abcdefghjkmnpqrstvwxyz';

const randomPublicId = (random: () => number) => {
    return Array.from({ length: 26 }, () => {
        return pickRandom(random, [...crockfordAlphabet]);
    }).join('');
};

test('telemetry never leaks share public ids from paths or share events', async () => {
    const random = createSeededRandom(20261003);
    const originalFetch = globalThis.fetch;
    const shippedBodies: string[] = [];
    const background: Promise<unknown>[] = [];

    globalThis.fetch = async (_input, init) => {
        shippedBodies.push(String(init?.body));
        return new Response('{}', { status: 200 });
    };

    try {
        const env = {
            NEW_RELIC_LICENSE_KEY: 'test-license-key',
            BOT_ENVIRONMENT: 'production'
        } as WorkerBindings;
        const context = {
            waitUntil(promise: Promise<unknown>) {
                background.push(promise);
            },
            passThroughOnException() {}
        } as unknown as ExecutionContext;
        const pathTemplates = [
            (id: string) => `/w/${id}`,
            (id: string) => `/w/${id.toUpperCase()}`,
            (id: string) => `/ua/w/${id}`,
            (id: string) => `/uk/w/${id}`,
            (id: string) => `/en/w/${id}`,
            (id: string) => `/pl/w/${id}`,
            (id: string) => `/ua/w/${id}?utm=${id}`
        ];

        for (let iteration = 0; iteration < 100; iteration += 1) {
            const publicId = randomPublicId(random);
            const path = pickRandom(random, pathTemplates)(publicId);
            const pathname = new URL(path, 'https://wishlist.test').pathname;

            assert.equal(
                normalizeTelemetryPath(pathname, '/telegram/secret'),
                SHARE_PAGE_TELEMETRY_PATH,
                path
            );

            emitHttpRequestTelemetry(
                new Request(`https://wishlist.test${path}`),
                new Response('ok', { status: 200 }),
                env,
                context,
                Date.now()
            );
            emitSharePageServedTelemetry(env, context, {
                method: 'GET',
                result: 'rendered',
                cacheOutcome: 'miss',
                locale: 'uk',
                status: 200,
                elapsedMs: 3,
                visibleWishes: 5
            });

            await Promise.all(background);

            for (const body of shippedBodies.slice(-2)) {
                assert.equal(body.includes(publicId), false, publicId);
                assert.equal(
                    body.includes(publicId.toUpperCase()),
                    false,
                    publicId
                );
            }
        }
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(shippedBodies.length, 200);
    assert.ok(
        shippedBodies.every(body => body.includes(SHARE_PAGE_TELEMETRY_PATH))
    );
});

test('Mini App paths collapse to id-free prefixes', () => {
    const expectations: [string, string][] = [
        ['/app', APP_TELEMETRY_PATH],
        ['/app/', APP_TELEMETRY_PATH],
        ['/api/app', APP_API_TELEMETRY_PATH],
        ['/api/app/bootstrap', APP_API_TELEMETRY_PATH],
        ['/api/app/wishes/987654/images/3', APP_API_TELEMETRY_PATH],
        ['/api/app/lists/abc.def.ghi/wishes', APP_API_TELEMETRY_PATH],
        ['/img/w/987654/0/0123456789abcdef', APP_IMAGE_TELEMETRY_PATH],
        [
            '/img/s/01k6g4z8q3m2n7p5r9s1t0v6wx/987654/0/0123456789abcdef',
            SHARE_IMAGE_TELEMETRY_PATH
        ],
        ['/app/app.js', '/unknown'],
        ['/apps', '/unknown'],
        ['/api/application', '/unknown'],
        ['/img/x/1', '/unknown']
    ];

    assert.deepEqual(
        [
            APP_TELEMETRY_PATH,
            APP_API_TELEMETRY_PATH,
            APP_IMAGE_TELEMETRY_PATH,
            SHARE_IMAGE_TELEMETRY_PATH
        ],
        ['/app', '/api/app', '/img/w', '/img/s']
    );

    for (const [path, normalized] of expectations) {
        assert.equal(normalizeTelemetryPath(path, null), normalized, path);
    }
});

test('Mini App events carry closed labels only', () => {
    assert.deepEqual(
        toWishlistAttributes(
            appApiCompletedEvent({
                route: '/api/app/wishes/:id',
                method: 'PATCH',
                status: 422,
                errorCode: 'validation',
                elapsedMs: 12
            }),
            'production'
        ),
        {
            eventName: 'app_api_completed',
            path: '/api/app',
            route: '/api/app/wishes/:id',
            method: 'PATCH',
            status: 422,
            outcome: 'success',
            errorCode: 'validation',
            elapsedMs: 12,
            botEnvironment: 'production'
        }
    );
    assert.equal(
        toWishlistAttributes(
            appApiCompletedEvent({
                route: '/api/app/wishes/987654',
                method: 'GET',
                status: 500,
                errorCode: 'internal',
                elapsedMs: 3
            }),
            'production'
        ).route,
        'invalid'
    );
    assert.equal(
        toWishlistAttributes(
            {
                event: 'app_api_completed',
                errorCode: 'user 987654' as 'internal'
            },
            'production'
        ).errorCode,
        'invalid'
    );
    assert.equal(
        toWishlistAttributes(
            { event: 'release_announcement_failed', errorCode: 403 },
            'production'
        ).errorCode,
        403
    );
    assert.deepEqual(
        toWishlistAttributes(
            appSessionStartedEvent({
                platform: 'ios',
                startKind: 'wish',
                isGuest: true,
                locale: 'uk',
                theme: 'dark'
            }),
            'production'
        ),
        {
            eventName: 'app_session_started',
            path: '/api/app',
            outcome: 'success',
            platform: 'ios',
            startKind: 'wish',
            isGuest: true,
            locale: 'uk',
            theme: 'dark',
            botEnvironment: 'production'
        }
    );

    for (const fields of [
        appAuthRejectedEvent('previewAccessDenied'),
        appRateLimitedEvent('sensitive'),
        appRateLimiterMissingEvent('upload', 'missing'),
        appPhotoUploadedEvent('writeAccessRequired'),
        imageProxyServedEvent({
            scope: 'share',
            result: 'hit',
            status: 200,
            elapsedMs: 2
        }),
        appClientEvent({ kind: 'renderError', screen: 'wishEditor' }),
        appClientEvent({ kind: 'screenView', screen: 'wishes' }),
        appClientEvent({
            kind: 'validationFailed',
            screen: 'wishEditor',
            field: 'title',
            code: 'tooLong'
        })
    ]) {
        const attributes = toWishlistAttributes(fields, 'production');

        assert.equal(JSON.stringify(attributes).includes('invalid'), false);
    }

    assert.equal(
        toWishlistAttributes(
            imageProxyServedEvent({
                scope: 'app',
                result: 'miss',
                status: 200,
                elapsedMs: 40
            }),
            'production'
        ).path,
        '/img/w'
    );
});

test('client validation events keep the closed field and code labels and reject unknown ones', () => {
    assert.deepEqual(
        toWishlistAttributes(
            appClientEvent({
                kind: 'validationFailed',
                screen: 'wishEditor',
                field: 'price',
                code: 'containsLink'
            }),
            'production'
        ),
        {
            eventName: 'app_client_event',
            path: '/api/app',
            outcome: 'success',
            kind: 'validationFailed',
            screen: 'wishEditor',
            field: 'price',
            code: 'containsLink',
            botEnvironment: 'production'
        }
    );
    assert.equal(
        toWishlistAttributes(
            {
                event: 'app_client_event',
                code: 'free text with spaces' as never
            },
            'production'
        ).code,
        'invalid'
    );
});

test('bot_action_completed defaults to the bot channel and keeps app', () => {
    assert.equal(
        toWishlistAttributes(
            { event: 'bot_action_completed', action: 'wish_created' },
            'production'
        ).channel,
        'bot'
    );
    assert.equal(
        toWishlistAttributes(
            {
                event: 'bot_action_completed',
                action: 'wish_created',
                channel: 'app'
            },
            'production'
        ).channel,
        'app'
    );
    assert.equal(
        toWishlistAttributes(
            { event: 'http_request_completed', status: 200 },
            'production'
        ).channel,
        undefined
    );
});

test('Mini App telemetry never leaks Telegram ids, initData or tokens', async () => {
    const random = createSeededRandom(20261004);
    const originalFetch = globalThis.fetch;
    const shippedBodies: string[] = [];
    const background: Promise<unknown>[] = [];
    const platforms = [
        'ios',
        'android',
        'tdesktop',
        'weba',
        'unknown'
    ] as const;
    const reasons = [
        'missing',
        'malformed',
        'badHash',
        'stale',
        'future',
        'previewAccessDenied',
        'origin'
    ] as const;

    globalThis.fetch = async (_input, init) => {
        shippedBodies.push(String(init?.body));
        return new Response('{}', { status: 200 });
    };

    try {
        const env = {
            NEW_RELIC_LICENSE_KEY: 'test-license-key',
            BOT_ENVIRONMENT: 'production'
        } as WorkerBindings;
        const context = {
            waitUntil(promise: Promise<unknown>) {
                background.push(promise);
            },
            passThroughOnException() {}
        } as unknown as ExecutionContext;

        for (let iteration = 0; iteration < 100; iteration += 1) {
            const telegramId = '6' + randomDigits(random, 9);
            const wishId = '9' + randomDigits(random, 7);
            const ownerToken = `${Number(telegramId).toString(36)}.mfq0zk.${randomDigits(random, 43)}`;
            const initData = `query_id=AA${randomDigits(random, 10)}&user=%7B%22id%22%3A${telegramId}%7D&auth_date=1790000000&hash=${randomDigits(random, 64)}`;
            const path = pickRandom(random, [
                `/api/app/wishes/${wishId}`,
                `/api/app/lists/${ownerToken}/wishes/${wishId}/give`,
                `/img/w/${wishId}/0/0123456789abcdef?e=1790003600&s=${ownerToken}`,
                `/api/app/bootstrap?start=w_${wishId}&tgWebAppData=${encodeURIComponent(initData)}`
            ]);

            emitHttpRequestTelemetry(
                new Request(`https://wishlist.test${path}`, {
                    headers: { Authorization: `tma ${initData}` }
                }),
                new Response('{}', { status: 200 }),
                env,
                context,
                Date.now()
            );

            for (const fields of [
                appApiCompletedEvent({
                    route: `/api/app/wishes/${wishId}`,
                    method: 'GET',
                    status: 404,
                    errorCode: 'notFound',
                    elapsedMs: 5
                }),
                appSessionStartedEvent({
                    platform: pickRandom(random, platforms),
                    startKind: 'wish',
                    isGuest: false,
                    locale: 'en',
                    theme: 'light'
                }),
                appAuthRejectedEvent(pickRandom(random, reasons)),
                appRateLimitedEvent('api')
            ]) {
                emitTelemetryEvent(env, context, fields);
            }

            await Promise.all(background);

            for (const body of shippedBodies.slice(-5)) {
                for (const secret of [
                    telegramId,
                    wishId,
                    ownerToken,
                    initData
                ]) {
                    assert.equal(body.includes(secret), false, secret);
                }
            }
        }
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(shippedBodies.length, 500);
});
