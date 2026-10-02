import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getMessages } from '../../src/bot/content/messages';
import {
    createGroupChat,
    createTestUser,
    type TestUser
} from '../fixtures/telegram';
import { countRows } from './d1-harness';
import {
    createForbiddenError,
    createWebhookHarness,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');

describe('Blocked users through the Worker on D1', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(401, {
        first_name: 'Alice',
        username: 'alice'
    });
    const bob = createTestUser(402, { first_name: 'Bob', username: 'bob' });

    const readBlockedAt = async (user: TestUser) => {
        const row = await webhook.queryOne<{ blocked_at: number | null }>(
            'SELECT blocked_at FROM users WHERE telegram_id = ?',
            user.id
        );

        return row ? row.blocked_at : 'missing';
    };
    const blockUser = async (user: TestUser) => {
        await webhook.run(
            webhook.d1.repositories.users.markBlockedByTelegramId(
                user.id,
                new Date()
            )
        );
    };
    const forbidSendMessage = () => {
        webhook.respondToApi(call => {
            if (call.method === 'sendMessage') {
                throw createForbiddenError();
            }

            return undefined;
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

    describe('my_chat_member updates', () => {
        it('marks a registered user blocked when they kick the bot', async () => {
            await webhook.registerUser(alice);

            const body = await webhook.send(
                webhook.builders.myChatMember(alice, 'kicked')
            );

            assert.equal(body.accepted, true);
            assert.equal(typeof (await readBlockedAt(alice)), 'number');
            assert.deepEqual(webhook.outboundCalls(), []);
        });

        it('clears the mark when the user restarts the bot', async () => {
            await webhook.registerUser(alice);
            await webhook.send(webhook.builders.myChatMember(alice, 'kicked'));
            await webhook.send(webhook.builders.myChatMember(alice, 'member'));

            assert.equal(await readBlockedAt(alice), null);
        });

        it('ignores a kick from an unknown user without creating rows', async () => {
            await webhook.send(webhook.builders.myChatMember(bob, 'kicked'));

            assert.equal(await countRows(webhook.d1, 'users'), 0);
            assert.equal(await countRows(webhook.d1, 'sessions'), 0);
        });

        it('ignores other statuses and group chats', async () => {
            await webhook.registerUser(alice);
            await webhook.send(webhook.builders.myChatMember(alice, 'left'));
            await webhook.send(
                webhook.builders.myChatMember(alice, 'administrator')
            );
            await webhook.send(
                webhook.builders.myChatMember(
                    alice,
                    'kicked',
                    createGroupChat()
                )
            );

            assert.equal(await readBlockedAt(alice), null);
        });
    });

    describe('403 responses', () => {
        it('marks a registered user blocked, still answers 200 and stops sending', async () => {
            await webhook.registerUser(alice);
            forbidSendMessage();

            const response = await webhook.deliver(
                webhook.builders.command(alice, '/start')
            );

            assert.equal(response.status, 200);
            assert.equal(typeof (await readBlockedAt(alice)), 'number');
            assert.equal(webhook.callsOf('sendMessage').length, 1);
            assert.deepEqual(webhook.loggedErrors, []);
            assert.deepEqual(
                await webhook.queryOne<{ status: string }>(
                    'SELECT status FROM telegram_updates LIMIT 1'
                ),
                { status: 'processed' }
            );
        });

        it('survives a 403 for a guest without creating a user', async () => {
            forbidSendMessage();

            const response = await webhook.deliver(
                webhook.builders.command(bob, '/start')
            );

            assert.equal(response.status, 200);
            assert.equal(await countRows(webhook.d1, 'users'), 0);
            assert.deepEqual(webhook.loggedErrors, []);
        });

        it('marks the user blocked when a callback answer renders into a 403', async () => {
            await webhook.registerUser(alice);
            forbidSendMessage();
            await webhook.send(webhook.builders.callback(alice, 'n:stats'));

            assert.equal(typeof (await readBlockedAt(alice)), 'number');
        });

        it('keeps the wishes and gives of a blocked user', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Bicycle');
            const giver = await webhook.registerUser(bob);

            await webhook.run(
                webhook.d1.repositories.gives.add(giver.id, wish.id, new Date())
            );
            forbidSendMessage();
            await webhook.send(webhook.builders.command(alice, '/start'));
            await webhook.send(webhook.builders.command(bob, '/start'));

            assert.equal(typeof (await readBlockedAt(alice)), 'number');
            assert.equal(typeof (await readBlockedAt(bob)), 'number');
            assert.equal(await countRows(webhook.d1, 'users'), 2);
            assert.equal(await countRows(webhook.d1, 'wishes'), 1);
            assert.equal(await countRows(webhook.d1, 'gives'), 1);
        });
    });

    describe('effects of being blocked', () => {
        it('clears the mark on the next update of the user', async () => {
            await webhook.registerUser(alice);
            await blockUser(alice);

            assert.equal(typeof (await readBlockedAt(alice)), 'number');

            await webhook.send(webhook.builders.command(alice, '/start'));

            assert.equal(await readBlockedAt(alice), null);
            assert.equal(webhook.lastMessage().text, LL.greeting.user());
        });

        it('hides a blocked owner from search, pagination and giving', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Bicycle');

            await webhook.registerUser(bob);
            await blockUser(alice);
            await webhook.send(webhook.builders.callback(bob, 'n:find'));
            await webhook.send(webhook.builders.message(bob, '@alice'));

            assert.ok(
                webhook.messageTexts().includes(LL.findList.errors.notFound())
            );

            webhook.clearApiCalls();
            await webhook.send(
                webhook.builders.callback(bob, `t:p:${owner.id}:0`)
            );

            assert.ok(
                webhook.messageTexts().includes(LL.findList.errors.notFound())
            );

            webhook.clearApiCalls();
            await webhook.send(
                webhook.builders.callback(bob, `t:g:${wish.id}`)
            );

            assert.equal(await countRows(webhook.d1, 'gives'), 0);
            assert.equal(
                webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                LL.errors.outdatedButton()
            );
        });

        it('becomes searchable again after the user returns', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Bicycle');
            await webhook.registerUser(bob);
            await blockUser(alice);
            await webhook.send(webhook.builders.command(alice, '/start'));
            webhook.clearApiCalls();
            await webhook.send(webhook.builders.callback(bob, 'n:find'));
            await webhook.send(webhook.builders.message(bob, '@alice'));

            assert.ok(
                webhook.messageTexts().some(text => {
                    return text.includes('Bicycle');
                })
            );
        });

        it('leaves blocked users out of the stats and the release broadcast', async () => {
            await webhook.registerUser(alice);
            await webhook.registerUser(bob);
            await blockUser(alice);

            const stats = await webhook.run(
                webhook.d1.repositories.stats.publicStats()
            );
            const candidates = await webhook.run(
                webhook.d1.repositories.users.listBroadcastCandidates()
            );

            assert.equal(stats.users, 1);
            assert.deepEqual(
                candidates.map(candidate => {
                    return candidate.telegramId;
                }),
                [bob.id]
            );
        });
    });
});
