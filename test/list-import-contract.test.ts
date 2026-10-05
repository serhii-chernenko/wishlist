import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createTelegramApi } from '../src/api/telegram-api';
import { REGISTERED_ONLY_SCREENS, SCREEN_IDS } from '../src/app/logic/nav';
import { getTranslator } from '../src/bot/i18n';
import {
    APP_API_ROUTES,
    CLIENT_SCREENS,
    LIST_IMPORT_FAILURES,
    LIST_IMPORT_INSERT_COLUMNS,
    LIST_IMPORT_INSERT_ROWS_PER_STATEMENT,
    LIST_IMPORT_KINDS,
    LIST_IMPORT_SOURCES,
    LIST_IMPORT_STATES,
    LIST_IMPORT_VISIBILITIES,
    type ListImportOutcome
} from '../src/shared/app-api';
import { getAppMessages } from '../src/api/dto';
import { isListImportEnabled } from '../src/worker/env';
import {
    LIST_IMPORT_COUNT_BUCKETS,
    LIST_IMPORT_DRAIN_OUTCOMES,
    listImportCompletedEvent,
    listImportPhotosDrainedEvent,
    listImportPreviewedEvent,
    toListImportCountBucket,
    toWishlistAttributes
} from '../src/worker/telemetry';

interface WranglerBlock {
    vars?: Record<string, string>;
    previews?: WranglerBlock;
}

const wrangler = JSON.parse(
    readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
) as WranglerBlock & { env: { production: WranglerBlock } };

const OUTCOMES: readonly ListImportOutcome[] = ['ok', ...LIST_IMPORT_FAILURES];

test('the list import routes keep their contract', () => {
    assert.deepEqual(APP_API_ROUTES.previewListImport, {
        method: 'POST',
        path: '/list-import/preview',
        access: 'user',
        bucket: 'import',
        body: 'json',
        status: 200
    });
    assert.deepEqual(APP_API_ROUTES.commitListImport, {
        method: 'POST',
        path: '/list-import/:id/commit',
        access: 'user',
        bucket: 'api',
        body: 'json',
        status: 200
    });
    assert.deepEqual(APP_API_ROUTES.getListImport, {
        method: 'GET',
        path: '/list-import/:id',
        access: 'user',
        bucket: 'api',
        body: 'none',
        status: 200
    });
    assert.deepEqual(LIST_IMPORT_SOURCES, ['rewish']);
    assert.deepEqual(LIST_IMPORT_KINDS, ['wishes', 'collection']);
    assert.deepEqual(LIST_IMPORT_VISIBILITIES, ['hidden', 'public']);
    assert.deepEqual(LIST_IMPORT_STATES, [
        'previewed',
        'committing',
        'done',
        'failed',
        'expired',
        'cancelled'
    ]);
});

test('a wish insert chunk stays under the D1 bound parameter ceiling', () => {
    assert.equal(
        LIST_IMPORT_INSERT_ROWS_PER_STATEMENT,
        Math.floor(100 / LIST_IMPORT_INSERT_COLUMNS)
    );
});

test('the list import screen is a registered-only app screen without parameters', () => {
    assert.ok(CLIENT_SCREENS.includes('listImport'));
    assert.ok(SCREEN_IDS.includes('listImport'));
    assert.equal(REGISTERED_ONLY_SCREENS.has('listImport'), true);
});

test('the kill switch is read as an exact string and is on in every environment', () => {
    assert.equal(
        isListImportEnabled({ WISHLIST_IMPORT_ENABLED: 'true' }),
        true
    );
    assert.equal(
        isListImportEnabled({ WISHLIST_IMPORT_ENABLED: 'false' }),
        false
    );
    assert.equal(wrangler.vars?.WISHLIST_IMPORT_ENABLED, 'true', 'local block');
    assert.equal(
        wrangler.env.production.vars?.WISHLIST_IMPORT_ENABLED,
        'true',
        'production block'
    );
    assert.equal(
        wrangler.env.production.previews?.vars?.WISHLIST_IMPORT_ENABLED,
        'true',
        'previews block'
    );
});

test('count buckets are letter-led labels at the documented bounds', () => {
    const expectations: [number, string][] = [
        [0, 'none'],
        [1, 'oneToNine'],
        [9, 'oneToNine'],
        [10, 'tenToFortyNine'],
        [49, 'tenToFortyNine'],
        [50, 'fiftyToTwoHundred'],
        [200, 'fiftyToTwoHundred'],
        [201, 'overTwoHundred'],
        [500, 'overTwoHundred']
    ];

    for (const [count, bucket] of expectations) {
        assert.equal(toListImportCountBucket(count), bucket, String(count));
    }

    assert.equal(LIST_IMPORT_COUNT_BUCKETS.length, 5);
});

test('the preview event keeps only closed labels for every outcome and kind', () => {
    for (const result of OUTCOMES) {
        for (const kind of [null, ...LIST_IMPORT_KINDS]) {
            for (const channel of ['bot', 'app'] as const) {
                const attributes = toWishlistAttributes(
                    listImportPreviewedEvent({
                        channel,
                        source: 'rewish',
                        kind,
                        result,
                        items: 45,
                        duplicates: 3,
                        elapsedMs: 1800
                    }),
                    'production'
                );

                assert.equal(
                    Object.values(attributes).includes('invalid'),
                    false,
                    `${result} ${kind} ${channel}`
                );
            }
        }
    }
});

test('the preview event reports bucketed counts and no raw values', () => {
    assert.deepEqual(
        toWishlistAttributes(
            listImportPreviewedEvent({
                channel: 'bot',
                source: 'rewish',
                kind: 'collection',
                result: 'privateCollection',
                items: 120,
                duplicates: 0,
                elapsedMs: 250
            }),
            'production'
        ),
        {
            eventName: 'list_import_previewed',
            path: '/telegram/webhook',
            outcome: 'rejected',
            channel: 'bot',
            result: 'privateCollection',
            source: 'rewish',
            kind: 'collection',
            itemsBucket: 'fiftyToTwoHundred',
            duplicatesBucket: 'none',
            elapsedBucket: 'instant',
            botEnvironment: 'production'
        }
    );
});

test('failure outcomes map to rejected for user mistakes and error for upstream problems', () => {
    const outcomes = Object.fromEntries(
        OUTCOMES.map(result => {
            const event = listImportPreviewedEvent({
                channel: 'app',
                source: 'rewish',
                kind: null,
                result,
                items: 0,
                duplicates: 0,
                elapsedMs: 0
            });

            return [result, event.outcome];
        })
    );

    assert.deepEqual(outcomes, {
        ok: 'success',
        invalidUrl: 'rejected',
        userNotFound: 'rejected',
        privateCollection: 'rejected',
        schemaChanged: 'error',
        upstream: 'error',
        timeout: 'error',
        rateLimited: 'rejected',
        empty: 'rejected',
        busy: 'rejected',
        limitReached: 'rejected',
        expired: 'rejected'
    });
});

test('the completed event reports success and failure with closed labels only', () => {
    const success = toWishlistAttributes(
        listImportCompletedEvent({
            channel: 'app',
            source: 'rewish',
            kind: 'wishes',
            visibility: 'hidden',
            trigger: 'request',
            failure: null,
            created: 48,
            gifted: 36
        }),
        'production'
    );
    const failed = toWishlistAttributes(
        listImportCompletedEvent({
            channel: 'bot',
            source: 'rewish',
            kind: 'collection',
            visibility: 'public',
            trigger: 'resume',
            failure: 'upstream',
            created: 0,
            gifted: 0
        }),
        'production'
    );

    assert.deepEqual(success, {
        eventName: 'list_import_completed',
        path: '/api/app',
        outcome: 'success',
        channel: 'app',
        result: 'success',
        source: 'rewish',
        kind: 'wishes',
        visibility: 'hidden',
        trigger: 'request',
        createdBucket: 'tenToFortyNine',
        giftedBucket: 'tenToFortyNine',
        botEnvironment: 'production'
    });
    assert.equal(failed.outcome, 'error');
    assert.equal(failed.result, 'failed');
    assert.equal(failed.reason, 'upstream');
    assert.equal(failed.createdBucket, 'none');
    assert.equal(Object.values(failed).includes('invalid'), false);
});

test('the photo drain event carries the trigger, the outcome and bucketed counts', () => {
    for (const result of LIST_IMPORT_DRAIN_OUTCOMES) {
        for (const trigger of ['cron', 'kick'] as const) {
            const attributes = toWishlistAttributes(
                listImportPhotosDrainedEvent({
                    trigger,
                    result,
                    ingested: 12,
                    failed: 1
                }),
                'production'
            );

            assert.equal(Object.values(attributes).includes('invalid'), false);
            assert.equal(attributes.eventName, 'list_import_photos_drained');
            assert.equal(attributes.trigger, trigger);
            assert.equal(attributes.ingestedBucket, 'tenToFortyNine');
            assert.equal(attributes.failedBucket, 'oneToNine');
        }
    }
});

test('every locale carries the import copy for every failure in the bot and the app', () => {
    for (const locale of ['uk', 'en', 'pl'] as const) {
        const LL = getTranslator(locale);
        const messages = getAppMessages(locale);

        for (const failure of LIST_IMPORT_FAILURES) {
            assert.ok(LL.listImport.failure[failure](), `${locale} bot`);
            assert.ok(
                messages.listImport.failure[failure],
                `${locale} app ${failure}`
            );
        }

        assert.ok(LL.listImport.title());
        assert.ok(messages.listImport.title);
    }
});

test('editMessageText posts the chat, the message and the text as JSON', async () => {
    const requests: { url: string; body: unknown }[] = [];
    const api = createTelegramApi({
        botToken: 'TOKEN',
        fetch: async (input, init) => {
            requests.push({
                url: String(input),
                body: JSON.parse(String(init?.body))
            });

            return Response.json({ ok: true, result: true });
        }
    });
    const result = await api.editMessageText(7, 99, 'Додано 12 з 45…', {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] }
    });

    assert.equal(result, true);
    assert.deepEqual(requests, [
        {
            url: 'https://api.telegram.org/botTOKEN/editMessageText',
            body: {
                chat_id: 7,
                message_id: 99,
                text: 'Додано 12 з 45…',
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] }
            }
        }
    ]);
});

test('a refused edit surfaces the Telegram error without the token', async () => {
    const api = createTelegramApi({
        botToken: 'TOKEN',
        fetch: async () => {
            return Response.json({
                ok: false,
                error_code: 400,
                description: 'Bad Request: message is not modified TOKEN'
            });
        }
    });

    await assert.rejects(api.editMessageText(7, 99, 'same'), error => {
        const failure = error as {
            response: { error_code: number; description: string };
        };

        assert.equal(failure.response.error_code, 400);
        assert.doesNotMatch(failure.response.description, /TOKEN/);

        return true;
    });
});
