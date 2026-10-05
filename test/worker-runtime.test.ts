import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/worker/app';
import {
    getTelegramWebhookPath,
    hasRequiredWorkerConfiguration
} from '../src/worker/env';
import type { WorkerBindings } from '../src/worker/env';

const validConfiguration = {
    BOT_TOKEN: '123456:test-token',
    TELEGRAM_WEBHOOK_PATH: '/telegram/wishlist-test',
    TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
    BOT_ENVIRONMENT: 'production'
} as const;

test('worker webhook path fails closed when it is not configured', () => {
    assert.equal(getTelegramWebhookPath({}), null);
    assert.equal(getTelegramWebhookPath({ TELEGRAM_WEBHOOK_PATH: '' }), null);
    assert.equal(
        getTelegramWebhookPath({ TELEGRAM_WEBHOOK_PATH: 'telegram/no-slash' }),
        null
    );
    assert.equal(
        getTelegramWebhookPath({ TELEGRAM_WEBHOOK_PATH: '/telegram?query=1' }),
        null
    );
    assert.equal(
        getTelegramWebhookPath({ TELEGRAM_WEBHOOK_PATH: ' /telegram/padded' }),
        null
    );
    assert.equal(
        getTelegramWebhookPath({ TELEGRAM_WEBHOOK_PATH: '/telegram/ok' }),
        '/telegram/ok'
    );
});

test('required worker configuration needs the three secrets and a known environment', () => {
    assert.equal(hasRequiredWorkerConfiguration(validConfiguration), true);

    for (const environment of ['local', 'production', 'preview']) {
        assert.equal(
            hasRequiredWorkerConfiguration({
                ...validConfiguration,
                BOT_ENVIRONMENT: environment
            }),
            true,
            environment
        );
    }

    assert.equal(
        hasRequiredWorkerConfiguration({
            ...validConfiguration,
            BOT_ENVIRONMENT: 'staging'
        }),
        false
    );

    for (const binding of [
        'BOT_TOKEN',
        'TELEGRAM_WEBHOOK_PATH',
        'TELEGRAM_WEBHOOK_SECRET'
    ] as const) {
        assert.equal(
            hasRequiredWorkerConfiguration({
                ...validConfiguration,
                [binding]: '   '
            }),
            false,
            binding
        );
    }
});

test('worker status identifies the wishlist service without exposing configuration', async () => {
    const app = createApp();
    const response = await app.request(
        '/status',
        undefined,
        validConfiguration as unknown as WorkerBindings
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        service: 'wishlist',
        runtime: 'cloudflare-workers',
        status: 'runtime-ready'
    });
});

test('unknown GET routes are not found', async () => {
    const app = createApp();
    const response = await app.request(
        '/unknown',
        undefined,
        validConfiguration as unknown as WorkerBindings
    );

    assert.equal(response.status, 404);
});
