import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getMessages } from '../../src/bot/content/messages';
import {
    FEEDBACK_MAX_LENGTH,
    FIND_QUERY_MAX_LENGTH,
    PAYMENTS_MAX_LENGTH
} from '../../src/bot/input/limits';
import { createTestUser, type TestUser } from '../fixtures/telegram';
import { countRows } from './d1-harness';
import {
    callbackDataOf,
    createTelegramApiError,
    createWebhookHarness,
    DEFAULT_ADMIN_ID,
    urlsOf,
    type WebhookHarness
} from './webhook-harness';

const LL = getMessages('uk');

const PHONE = '+380991112233';

describe('Review and security fixes through the Worker on D1', () => {
    let webhook: WebhookHarness;

    const alice = createTestUser(401, {
        first_name: 'Alice',
        username: 'alice'
    });
    const bob = createTestUser(402, { first_name: 'Bob', username: 'bob' });
    const carol = createTestUser(403, { first_name: 'Carol' });

    const tap = (user: TestUser, data: string) => {
        return webhook.send(webhook.builders.callback(user, data));
    };
    const say = (user: TestUser, text: string) => {
        return webhook.send(webhook.builders.message(user, text));
    };
    const registerPhoneOnlyOwner = async () => {
        const owner = await webhook.registerUser(carol, {
            usernameSearchable: false,
            phone: PHONE,
            phoneDigits: PHONE.replace(/\D/g, '')
        });
        const wish = await webhook.createWish(owner, 'Secret bicycle');

        return { owner, wish };
    };
    const readSessionState = async (telegramId: number) => {
        const row = await webhook.queryOne<{ state: string }>(
            'SELECT state FROM sessions WHERE telegram_user_id = ?',
            telegramId
        );

        return row
            ? (JSON.parse(row.state) as { find?: { targetUserId: number } })
            : null;
    };
    const everythingSent = () => {
        return JSON.stringify(
            webhook.outboundCalls().map(call => {
                return call.payload;
            })
        );
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

    describe('third-party callbacks are bound to a successful search', () => {
        it('never reveals a phone number through a forged page callback', async () => {
            const { owner } = await registerPhoneOnlyOwner();

            await webhook.registerUser(bob);

            for (const data of [
                `t:p:${owner.id}:0`,
                `t:p:${owner.id}:10`,
                `t:f:${owner.id}`,
                `t:f:${owner.id}:2`
            ]) {
                webhook.clearApiCalls();
                await tap(bob, data);

                assert.equal(everythingSent().includes(PHONE), false, data);
                assert.equal(
                    everythingSent().includes('Secret bicycle'),
                    false,
                    data
                );
                assert.ok(
                    webhook.messageTexts().includes(LL.errors.outdatedButton()),
                    data
                );
            }

            assert.equal(
                (await readSessionState(bob.id))?.find?.targetUserId ?? null,
                null
            );
        });

        it('refuses a forged page callback for a different person than the one searched', async () => {
            const { owner } = await registerPhoneOnlyOwner();
            const searched = await webhook.registerUser(alice);

            await webhook.createWish(searched, 'Visible');
            await webhook.registerUser(bob);
            await tap(bob, 'n:find');
            await say(bob, '@alice');
            webhook.clearApiCalls();
            await tap(bob, `t:p:${owner.id}:0`);

            assert.equal(everythingSent().includes(PHONE), false);
            assert.equal(everythingSent().includes('Secret bicycle'), false);
            assert.equal(
                (await readSessionState(bob.id))?.find?.targetUserId,
                searched.id
            );
        });

        it('labels the list with the typed query and never with the phone', async () => {
            await registerPhoneOnlyOwner();
            await webhook.registerUser(bob);
            await tap(bob, 'n:find');
            await say(bob, '0991112233');

            assert.ok(
                webhook
                    .messageTexts()
                    .includes(LL.findList.filled.before('0991112233'))
            );
            assert.equal(everythingSent().includes(PHONE), false);
        });

        it('rejects a give without a search and with a search of someone else', async () => {
            const { wish } = await registerPhoneOnlyOwner();
            const other = await webhook.registerUser(alice);

            await webhook.createWish(other, 'Other');
            await webhook.registerUser(bob);
            await tap(bob, `t:g:${wish.id}`);

            assert.equal(await countRows(webhook.d1, 'gives'), 0);
            assert.equal(
                webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                LL.errors.outdatedButton()
            );

            await tap(bob, 'n:find');
            await say(bob, '@alice');
            webhook.clearApiCalls();
            await tap(bob, `t:g:${wish.id}`);

            assert.equal(await countRows(webhook.d1, 'gives'), 0);
            assert.equal(
                webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                LL.errors.outdatedButton()
            );
        });

        it('allows a give for the searched owner', async () => {
            const { wish } = await registerPhoneOnlyOwner();

            await webhook.registerUser(bob);
            await tap(bob, 'n:find');
            await say(bob, '0991112233');
            webhook.clearApiCalls();
            await tap(bob, `t:g:${wish.id}`);

            assert.equal(await countRows(webhook.d1, 'gives'), 1);
        });

        it('rejects a take without an existing give row', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Bicycle');

            await webhook.registerUser(bob);
            await tap(bob, 'n:find');
            await say(bob, '@alice');
            webhook.clearApiCalls();
            await tap(bob, `t:t:${wish.id}`);

            assert.equal(
                webhook.callsOf('answerCallbackQuery')[0]?.payload.text,
                LL.errors.outdatedButton()
            );
            assert.deepEqual(webhook.callsOf('editMessageReplyMarkup'), []);
        });

        it('does not give wishes of owners that cannot be found even with a forged session', async () => {
            const hiddenOwner = await webhook.registerUser(alice, {
                usernameSearchable: false
            });
            const wish = await webhook.createWish(hiddenOwner, 'Unreachable');
            const viewer = await webhook.registerUser(bob);

            await webhook.d1.env.DB.prepare(
                'INSERT INTO sessions (telegram_user_id, state, updated_at) VALUES (?, ?, ?)'
            )
                .bind(
                    bob.id,
                    JSON.stringify({
                        v: 1,
                        pendingInput: null,
                        find: {
                            targetUserId: hiddenOwner.id,
                            query: 'x',
                            filter: null
                        }
                    }),
                    Date.now()
                )
                .run();
            await tap(bob, `t:g:${wish.id}`);

            assert.equal(viewer.id > 0, true);
            assert.equal(await countRows(webhook.d1, 'gives'), 0);
        });
    });

    describe('input caps', () => {
        it('rejects payment details above the cap and keeps asking', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:pay');
            await say(alice, 'x'.repeat(PAYMENTS_MAX_LENGTH + 1));

            assert.ok(
                webhook
                    .messageTexts()
                    .includes(
                        LL.payments.edit.tooLong(String(PAYMENTS_MAX_LENGTH))
                    )
            );
            assert.equal(
                (
                    await webhook.queryOne<{ payments: string | null }>(
                        'SELECT payments FROM users WHERE telegram_id = ?',
                        alice.id
                    )
                )?.payments,
                null
            );

            await say(alice, 'y'.repeat(PAYMENTS_MAX_LENGTH));

            assert.ok(
                webhook.messageTexts().includes(LL.payments.edit.success())
            );
        });

        it('rejects feedback above the cap without contacting the admin', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:fb');
            webhook.clearApiCalls();
            await say(alice, 'f'.repeat(FEEDBACK_MAX_LENGTH + 1));

            assert.ok(
                webhook
                    .messageTexts()
                    .includes(
                        LL.feedback.errors.tooLong(String(FEEDBACK_MAX_LENGTH))
                    )
            );
            assert.equal(
                webhook.sentMessages().some(message => {
                    return String(message.chat_id) === DEFAULT_ADMIN_ID;
                }),
                false
            );
        });

        it('rejects a find query above the cap and asks again', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:find');
            await say(alice, 'q'.repeat(FIND_QUERY_MAX_LENGTH + 1));

            assert.ok(
                webhook
                    .messageTexts()
                    .includes(
                        LL.findList.errors.tooLong(
                            String(FIND_QUERY_MAX_LENGTH)
                        )
                    )
            );
            assert.equal(webhook.lastMessage().text, LL.findList.description());
        });

        it('truncates over-long stored payments when rendering them', async () => {
            const stored = 'p'.repeat(1500);
            const owner = await webhook.registerUser(alice, {
                payments: stored
            });

            await webhook.createWish(owner, 'Bicycle');
            await webhook.registerUser(bob);
            await tap(alice, 'n:pay');

            const ownScreen = webhook.lastMessage().text;

            assert.equal(ownScreen.includes(stored), false);
            assert.ok(ownScreen.includes(`${'p'.repeat(999)}…`));

            await tap(bob, 'n:find');
            await say(bob, '@alice');

            const payments = webhook.messageTexts().find(text => {
                return text.includes('ppp');
            });

            assert.ok(payments?.includes(`${'p'.repeat(999)}…`));
            assert.equal(payments?.includes('p'.repeat(1000)), false);
        });
    });

    describe('feedback delivery to the admin', () => {
        for (const code of [403, 400] as const) {
            it(`does not block the sender when the admin chat answers ${code}`, async () => {
                await webhook.registerUser(alice);
                await tap(alice, 'n:fb');
                webhook.respondToApi(call => {
                    if (
                        call.method === 'sendMessage' &&
                        String(call.payload.chat_id) === DEFAULT_ADMIN_ID
                    ) {
                        throw createTelegramApiError(
                            code,
                            code === 403
                                ? 'Forbidden: bot was blocked by the user'
                                : 'Bad Request: chat not found'
                        );
                    }

                    return undefined;
                });
                webhook.clearApiCalls();
                await say(alice, 'Hello admin');

                assert.equal(
                    (
                        await webhook.queryOne<{ blocked_at: number | null }>(
                            'SELECT blocked_at FROM users WHERE telegram_id = ?',
                            alice.id
                        )
                    )?.blocked_at,
                    null
                );
                assert.ok(webhook.messageTexts().includes(LL.errors.unknown()));
                assert.equal(
                    webhook.messageTexts().includes(LL.feedback.success()),
                    false
                );
            });
        }
    });

    describe('wish links', () => {
        const seedLinks = async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Good link', {
                link: 'https://example.com/good'
            });
            await webhook.createWish(owner, 'Spaced link', {
                link: 'https://example.com/a b'
            });
            await webhook.createWish(owner, 'Newline link', {
                link: 'https://example.com/a\n\nhttps://example.com/b'
            });
            await webhook.createWish(owner, 'Scheme link', {
                link: 'ftp://example.com/file'
            });

            return owner;
        };
        const urlsByTitle = () => {
            return new Map(
                webhook.sentMessages().map(message => {
                    return [message.text, urlsOf(message)] as const;
                })
            );
        };

        it('shows the open button only for a valid link on the third-party list', async () => {
            await seedLinks();
            await webhook.registerUser(bob);
            await tap(bob, 'n:find');
            await say(bob, '@alice');

            const urls = [...urlsByTitle()];
            const withUrl = urls.filter(([, list]) => list.length > 0);

            assert.equal(withUrl.length, 1);
            assert.ok(withUrl[0]?.[0].includes('Good link'));
            assert.deepEqual(withUrl[0]?.[1], ['https://example.com/good']);
        });

        it('shows the open button only for a valid link on the owner edit screen', async () => {
            const owner = await seedLinks();
            const spaced = await webhook.queryOne<{ id: number }>(
                'SELECT id FROM wishes WHERE user_id = ? AND title = ?',
                owner.id,
                'Spaced link'
            );

            await tap(alice, `w:e:${spaced?.id}`);

            assert.deepEqual(urlsOf(webhook.lastMessage()), []);
            assert.ok(
                callbackDataOf(webhook.lastMessage()).includes(
                    `w:f:l:${spaced?.id}`
                )
            );
        });

        it('shows the open button only for a valid link on the give list', async () => {
            const owner = await seedLinks();

            await webhook.registerUser(bob);

            const bobUser = await webhook.queryOne<{ id: number }>(
                'SELECT id FROM users WHERE telegram_id = ?',
                bob.id
            );
            const wishes = await webhook.queryAll<{
                id: number;
                title: string;
            }>('SELECT id, title FROM wishes WHERE user_id = ?', owner.id);

            for (const wish of wishes) {
                await webhook.run(
                    webhook.d1.repositories.gives.add(
                        bobUser?.id ?? 0,
                        wish.id,
                        new Date()
                    )
                );
            }

            await tap(bob, 'n:gl');

            const withUrl = [...urlsByTitle()].filter(
                ([, list]) => list.length > 0
            );

            assert.equal(withUrl.length, 1);
            assert.deepEqual(withUrl[0]?.[1], ['https://example.com/good']);
        });

        it('retries the wish message once without the url button when Telegram rejects it', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Odd link', {
                link: 'https://example.com/ok'
            });
            await webhook.registerUser(bob);
            webhook.respondToApi(call => {
                const keyboard = JSON.stringify(
                    call.payload.reply_markup ?? {}
                );

                if (
                    call.method === 'sendMessage' &&
                    keyboard.includes('"url"')
                ) {
                    throw createTelegramApiError(
                        400,
                        'Bad Request: BUTTON_URL_INVALID'
                    );
                }

                return undefined;
            });
            await tap(bob, 'n:find');
            await say(bob, '@alice');

            const wishMessages = webhook.sentMessages().filter(message => {
                return message.text.includes('Odd link');
            });

            assert.equal(wishMessages.length, 2);
            assert.deepEqual(urlsOf(wishMessages.at(-1)), []);
            assert.ok(
                callbackDataOf(wishMessages.at(-1)).some(data => {
                    return data.startsWith('t:g:');
                })
            );
            assert.equal(
                webhook.loggedErrors.some(line => {
                    return line.includes('wish_media_failed');
                }),
                false
            );
        });
    });
});

describe('Preview bot access', () => {
    let preview: WebhookHarness;

    const admin = createTestUser(Number(DEFAULT_ADMIN_ID), {
        first_name: 'Admin',
        username: 'admin'
    });
    const stranger = createTestUser(501, {
        first_name: 'Stranger',
        username: 'stranger'
    });

    before(async () => {
        preview = await createWebhookHarness({ botEnvironment: 'preview' });
    });

    after(async () => {
        await preview.dispose();
    });

    beforeEach(async () => {
        await preview.reset();
    });

    it('serves the admin', async () => {
        await preview.send(preview.builders.command(admin, '/start'));

        assert.ok(preview.callsOf('sendMessage').length > 0);
    });

    it('ignores every other user silently, for messages and callbacks', async () => {
        for (const update of [
            preview.builders.command(stranger, '/start'),
            preview.builders.callback(stranger, 'n:stats'),
            preview.builders.message(stranger, 'hello')
        ]) {
            const response = await preview.deliver(update);

            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), {
                ignored: true,
                updateId: update.update_id
            });
        }

        assert.deepEqual(preview.outboundCalls(), []);
        assert.equal(await countRows(preview.d1, 'users'), 0);
        assert.equal(await countRows(preview.d1, 'sessions'), 0);
        assert.equal(await countRows(preview.d1, 'telegram_updates'), 0);
    });

    it('serves nobody when ADMIN_ID is not configured', async () => {
        preview.setAdminId(null);

        const response = await preview.deliver(
            preview.builders.command(admin, '/start')
        );

        assert.equal(response.status, 200);
        assert.equal(
            ((await response.json()) as { ignored?: boolean }).ignored,
            true
        );
        assert.deepEqual(preview.outboundCalls(), []);
    });
});
