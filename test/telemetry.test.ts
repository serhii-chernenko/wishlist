import assert from 'node:assert/strict';
import test from 'node:test';

import {
    emitTelemetryEvent,
    getCallbackDataCategory,
    getTelegramCallbackCategory,
    getTelegramCommandCategory,
    getTelegramUpdateType,
    normalizeTelemetryPath,
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
        ['wl:p:20', 'wishlist:page'],
        ['wl:clean', 'wishlist:clean'],
        ['wl:clean:y', 'wishlist:cleanConfirm'],
        ['wl:share', 'wishlist:share'],
        ['wl:f', 'wishlist:filter'],
        ['wl:f:3', 'wishlist:filter'],
        ['wl:f:x', 'wishlist:filter'],
        ['w:e:123', 'wish:edit'],
        ['w:r:123', 'wish:remove'],
        ['w:r:y:123', 'wish:removeDone'],
        ['w:r:n:123', 'wish:removeNotDone'],
        ['w:t:123', 'wish:priority'],
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
