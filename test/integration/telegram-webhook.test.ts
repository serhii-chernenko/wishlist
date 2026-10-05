import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getMessages } from '../../src/bot/content/messages';
import { countRows } from './d1-harness';
import {
    callbackDataOf,
    createTelegramApiError,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

describe('Telegram webhook through the Worker on D1', () => {
    let webhook: WebhookHarness;

    const alice = () => {
        return webhook.createUser(77, {
            first_name: 'Alice',
            username: 'alice'
        });
    };

    before(async () => {
        webhook = await createWebhookHarness();
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();
    });

    describe('request authentication and shape', () => {
        it('rejects a wrong secret with 401 before any Telegram call', async () => {
            const response = await webhook.deliver(
                webhook.builders.command(alice(), '/start'),
                { secret: 'wrong-secret' }
            );

            assert.equal(response.status, 401);
            assert.equal(webhook.apiCalls.length, 0);
            assert.equal(await countRows(webhook.d1, 'telegram_updates'), 0);
        });

        it('answers 404 for a different path', async () => {
            const response = await webhook.deliver(
                webhook.builders.command(alice(), '/start'),
                { path: '/telegram/other-path' }
            );

            assert.equal(response.status, 404);
            assert.equal(webhook.apiCalls.length, 0);
        });

        it('rejects non-JSON content and malformed JSON', async () => {
            const wrongType = await webhook.deliver(
                webhook.builders.command(alice(), '/start'),
                { contentType: 'text/plain' }
            );
            const malformed = await webhook.deliver(
                {},
                { rawBody: '{not json' }
            );

            assert.equal(wrongType.status, 415);
            assert.equal(malformed.status, 400);
            assert.equal(webhook.apiCalls.length, 0);
        });

        it('rejects a shape that is neither a handled nor an ignorable update', async () => {
            const response = await webhook.deliver({
                update_id: 5,
                message: { text: 'no chat, no sender' }
            });

            assert.equal(response.status, 400);
            assert.equal(await countRows(webhook.d1, 'telegram_updates'), 0);
        });
    });

    describe('update types', () => {
        it('ignores an edited_message with 200 and never claims it', async () => {
            const body = await webhook.send(
                webhook.builders.editedMessage(alice(), 'edited')
            );

            assert.equal(body.ignored, true);
            assert.equal(webhook.apiCalls.length, 0);
            assert.equal(await countRows(webhook.d1, 'telegram_updates'), 0);
        });

        it('ignores an inline_query update shape', async () => {
            const body = await webhook.send({
                update_id: 900,
                inline_query: { id: '1', from: alice(), query: 'x', offset: '' }
            });

            assert.equal(body.ignored, true);
            assert.equal(webhook.apiCalls.length, 0);
        });

        it('claims a group chat message but answers nothing and stores nothing', async () => {
            const groupMessage = webhook.builders.command(alice(), '/start', {
                id: -1001,
                type: 'supergroup',
                title: 'Friends'
            });
            const body = await webhook.send(groupMessage);

            assert.equal(body.accepted, true);
            assert.deepEqual(webhook.outboundCalls(), []);
            assert.equal(await countRows(webhook.d1, 'telegram_updates'), 1);
            assert.equal(await countRows(webhook.d1, 'sessions'), 0);
            assert.equal(await countRows(webhook.d1, 'users'), 0);
        });

        it('handles a callback_query and answers it', async () => {
            const body = await webhook.send(
                webhook.builders.callback(alice(), 'n:stats')
            );

            assert.equal(body.accepted, true);
            assert.equal(webhook.callsOf('answerCallbackQuery').length, 1);
            assert.equal(webhook.callsOf('sendMessage').length, 1);
        });
    });

    describe('update ledger', () => {
        it('processes the same update_id once', async () => {
            const update = webhook.builders.command(alice(), '/start');
            const first = await webhook.send(update);
            const sentAfterFirst = webhook.callsOf('sendMessage').length;
            const second = await webhook.send(update);

            assert.equal(first.accepted, true);
            assert.equal(first.duplicate, undefined);
            assert.equal(second.duplicate, true);
            assert.equal(webhook.callsOf('sendMessage').length, sentAfterFirst);
            assert.equal(await countRows(webhook.d1, 'telegram_updates'), 1);
            assert.deepEqual(
                await webhook.queryOne<{ status: string }>(
                    'SELECT status FROM telegram_updates LIMIT 1'
                ),
                { status: 'processed' }
            );
        });

        it('keeps separate rows for different update_ids', async () => {
            await webhook.send(webhook.builders.command(alice(), '/start'));
            await webhook.send(webhook.builders.command(alice(), '/start'));

            assert.equal(await countRows(webhook.d1, 'telegram_updates'), 2);
        });

        it('terminalizes a failed dispatch, answers 200 and does not replay it', async () => {
            webhook.respondToApi(call => {
                if (call.method === 'sendMessage') {
                    throw createTelegramApiError(500, 'Internal Server Error');
                }

                return undefined;
            });

            const update = webhook.builders.command(alice(), '/start');
            const failing = await webhook.deliver(update);

            assert.equal(failing.status, 200);
            assert.ok(
                webhook.loggedErrors.some(entry => {
                    return entry.includes('telegram_update_dispatch_failed');
                })
            );
            assert.deepEqual(
                await webhook.queryOne<{ status: string }>(
                    'SELECT status FROM telegram_updates LIMIT 1'
                ),
                { status: 'processed' }
            );

            webhook.respondToApi(null);
            webhook.clearApiCalls();

            const replay = await webhook.deliver(update);

            assert.equal(
                ((await replay.json()) as { duplicate?: boolean }).duplicate,
                true
            );
            assert.equal(webhook.callsOf('sendMessage').length, 0);
        });
    });

    describe('bot info and replies', () => {
        it('asks Telegram for getMe once and caches it across updates', async () => {
            await webhook.send(webhook.builders.command(alice(), '/start'));
            await webhook.send(webhook.builders.command(alice(), '/start'));

            assert.equal(webhook.callsOf('getMe').length, 1);
        });

        it('replies in HTML with the guest menu for an unknown user', async () => {
            await webhook.send(webhook.builders.command(alice(), '/start'));

            const message = webhook.lastMessage();
            const LL = getMessages('uk');

            assert.equal(message.chat_id, 77);
            assert.equal(message.parse_mode, 'HTML');
            assert.equal(
                message.text,
                `${LL.greeting.general()}\n\n${LL.greeting.guest()}`
            );
            assert.deepEqual(callbackDataOf(message), [
                'n:auth',
                'n:priv',
                'n:fb',
                'n:stats',
                'n:rel',
                'n:don',
                'n:lang'
            ]);
        });
    });
});
