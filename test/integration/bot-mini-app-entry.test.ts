import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { getMessages } from '../../src/bot/content/messages';
import { decodeSessionState } from '../../src/bot/runtime/session-store';
import { buildAppUrl } from '../../src/shared/app-links';
import { CANONICAL_SHARE_ORIGIN } from '../../src/web/share/public-id';
import { createTestUser } from '../fixtures/telegram';
import {
    DEFAULT_ADMIN_ID,
    WEBHOOK_ORIGIN,
    createWebhookHarness,
    type SentMessage,
    type WebhookHarness
} from './webhook-harness';

interface WebAppButton {
    text: string;
    web_app: { url: string };
}

const LL = getMessages('uk');
const PREVIEW_APP_URL = buildAppUrl(WEBHOOK_ORIGIN);
const PRODUCTION_APP_URL = buildAppUrl(CANONICAL_SHARE_ORIGIN);

const webAppButtonsOf = (message: SentMessage | undefined) => {
    const rows = (message?.reply_markup?.inline_keyboard ?? []) as unknown as {
        text: string;
        web_app?: { url: string };
    }[][];

    return rows.flat().filter((button): button is WebAppButton => {
        return button.web_app !== undefined;
    });
};

const webAppUrlsOf = (message: SentMessage | undefined) => {
    return webAppButtonsOf(message).map(button => {
        return button.web_app.url;
    });
};

const firstRowOf = (message: SentMessage) => {
    return (message.reply_markup?.inline_keyboard?.[0] ?? []) as unknown as {
        text: string;
        web_app?: { url: string };
    }[];
};

describe('Mini App entry points in the bot', () => {
    const alice = createTestUser(Number(DEFAULT_ADMIN_ID), {
        first_name: 'Alice',
        username: 'alice'
    });
    const dana = createTestUser(Number(DEFAULT_ADMIN_ID), {
        first_name: 'Dana'
    });
    let webhook: WebhookHarness;
    let miniAppEnabledAtStart: string | undefined;

    const setMiniAppEnabled = (value: 'true' | 'false') => {
        Object.assign(webhook.d1.env, { MINI_APP_ENABLED: value });
    };
    const tap = (user: typeof alice, data: string) => {
        return webhook.send(webhook.builders.callback(user, data));
    };
    const command = (user: typeof alice, text: string) => {
        return webhook.send(webhook.builders.command(user, text));
    };
    const shareContact = (
        user: typeof alice,
        phoneNumber: string,
        userId?: number
    ) => {
        return webhook.send(
            webhook.builders.contact(user, {
                phoneNumber,
                ...(userId === undefined ? {} : { userId })
            })
        );
    };
    const readPendingInput = async (telegramId: number) => {
        const row = await webhook.queryOne<{ state: string }>(
            'SELECT state FROM sessions WHERE telegram_user_id = ?',
            telegramId
        );

        return row ? decodeSessionState(row.state).pendingInput : null;
    };
    const readUserPhone = (telegramId: number) => {
        return webhook.queryOne<{ phone: string | null }>(
            'SELECT phone FROM users WHERE telegram_id = ?',
            telegramId
        );
    };

    before(async () => {
        webhook = await createWebhookHarness({ botEnvironment: 'preview' });
        miniAppEnabledAtStart = (
            webhook.d1.env as unknown as Record<string, string | undefined>
        ).MINI_APP_ENABLED;
    });

    after(async () => {
        await webhook.dispose();
    });

    beforeEach(async () => {
        await webhook.reset();
        setMiniAppEnabled('true');
    });

    afterEach(() => {
        if (miniAppEnabledAtStart !== undefined) {
            Object.assign(webhook.d1.env, {
                MINI_APP_ENABLED: miniAppEnabledAtStart
            });
        }
    });

    describe('web_app buttons', () => {
        it('puts the app button first on the guest home keyboard with an origin-based url', async () => {
            await command(alice, '/start');

            const message = webhook.lastMessage();
            const [firstButton] = firstRowOf(message);

            assert.equal(firstButton?.text, LL.actions.openApp());
            assert.deepEqual(firstButton?.web_app, { url: PREVIEW_APP_URL });
            assert.equal(PREVIEW_APP_URL, `${WEBHOOK_ORIGIN}/app`);
            assert.equal(webAppUrlsOf(message).length, 1);
        });

        it('puts the app button first on the user home keyboard', async () => {
            await webhook.registerUser(alice);
            await command(alice, '/start');

            const [firstButton] = firstRowOf(webhook.lastMessage());

            assert.equal(firstButton?.text, LL.actions.openApp());
            assert.deepEqual(firstButton?.web_app, { url: PREVIEW_APP_URL });
        });

        it('hides every button when the Mini App is disabled', async () => {
            setMiniAppEnabled('false');
            await webhook.registerUser(alice);
            await command(alice, '/start');

            assert.deepEqual(webAppUrlsOf(webhook.lastMessage()), []);

            await command(dana, '/start');

            assert.deepEqual(webAppUrlsOf(webhook.lastMessage()), []);

            await tap(alice, 'n:wl');

            assert.deepEqual(webAppUrlsOf(webhook.lastMessage()), []);
        });

        it('opens the wishlist section from the wishlist menu', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Kettle');
            await tap(alice, 'n:wl');

            assert.deepEqual(webAppUrlsOf(webhook.lastMessage()), [
                buildAppUrl(WEBHOOK_ORIGIN, 'wishes')
            ]);
        });

        it('shows the wishlist section button on an empty wishlist too', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:wl');

            assert.deepEqual(webAppUrlsOf(webhook.lastMessage()), [
                `${WEBHOOK_ORIGIN}/app?start=wishes`
            ]);
        });

        it('opens the wish from the wish edit menu', async () => {
            const owner = await webhook.registerUser(alice);
            const wish = await webhook.createWish(owner, 'Kettle');

            await tap(alice, `w:e:${wish.id}`);

            assert.deepEqual(webAppUrlsOf(webhook.lastMessage()), [
                `${WEBHOOK_ORIGIN}/app?start=w_${wish.id}`
            ]);
        });

        it('opens the share section from the share link screen', async () => {
            const owner = await webhook.registerUser(alice);

            await webhook.createWish(owner, 'Kettle');
            await tap(alice, 'wl:share');
            await tap(alice, 'wl:share:y');

            assert.deepEqual(webAppUrlsOf(webhook.lastMessage()), [
                `${WEBHOOK_ORIGIN}/app?start=share`
            ]);
        });
    });

    describe('production origin', () => {
        it('always points at the canonical origin in production', async () => {
            const production = await createWebhookHarness({
                botEnvironment: 'production'
            });

            try {
                await production.send(
                    production.builders.command(alice, '/start')
                );

                assert.deepEqual(webAppUrlsOf(production.lastMessage()), [
                    PRODUCTION_APP_URL
                ]);
            } finally {
                await production.dispose();
            }
        });
    });

    describe('/app command', () => {
        it('replies with the entry text and a single web_app button', async () => {
            await command(alice, '/app');

            const message = webhook.lastMessage();

            assert.equal(message.text, LL.appEntry.text());
            assert.deepEqual(webAppButtonsOf(message), [
                {
                    text: LL.actions.openApp(),
                    web_app: { url: PREVIEW_APP_URL }
                }
            ]);
        });

        it('works for registered users and clears pending input', async () => {
            await webhook.registerUser(alice);
            await tap(alice, 'n:fb');
            await command(alice, '/app');

            assert.equal(webhook.lastMessage().text, LL.appEntry.text());
            assert.equal(await readPendingInput(alice.id), null);
        });

        it('falls back to the home menu when the Mini App is disabled', async () => {
            setMiniAppEnabled('false');
            await webhook.registerUser(alice);
            await command(alice, '/app');

            const message = webhook.lastMessage();

            assert.equal(message.text, LL.greeting.user());
            assert.deepEqual(webAppUrlsOf(message), []);
        });
    });

    describe('contact intent started in the app', () => {
        const startAppContactIntent = async (
            user: typeof alice,
            authType: 'phone' | 'both'
        ) => {
            await webhook.run(
                webhook.d1.repositories.sessions.setPendingContact(
                    user.id,
                    authType,
                    new Date()
                )
            );
        };

        it('completes quietly with only the app success text', async () => {
            await startAppContactIntent(alice, 'both');
            await shareContact(alice, '+380 50 111 22 33');

            const row = await readUserPhone(alice.id);

            assert.equal(row?.phone, '+380 50 111 22 33');
            assert.equal(await readPendingInput(alice.id), null);
            assert.deepEqual(webhook.messageTexts(), [LL.auth.success.app()]);
            assert.equal(
                webhook.lastMessage().reply_markup?.inline_keyboard,
                undefined
            );
        });

        it('updates an existing user quietly too', async () => {
            await webhook.registerUser(alice);
            await startAppContactIntent(alice, 'phone');
            await shareContact(alice, '+380501112233');

            assert.equal(
                (await readUserPhone(alice.id))?.phone,
                '+380501112233'
            );
            assert.deepEqual(webhook.messageTexts(), [LL.auth.success.app()]);
        });

        it('reports a foreign contact, clears pending and does not prompt again', async () => {
            await startAppContactIntent(alice, 'phone');
            await shareContact(alice, '+380670000000', 555);

            assert.deepEqual(webhook.messageTexts(), [
                LL.auth.errors.foreignContact()
            ]);
            assert.equal(
                webhook.lastMessage().reply_markup?.keyboard,
                undefined
            );
            assert.equal(await readPendingInput(alice.id), null);
            assert.equal(await readUserPhone(alice.id), null);
        });

        it('does not send the home menu when a nameless user is refused both', async () => {
            await startAppContactIntent(dana, 'both');
            await shareContact(dana, '+48123456789');

            assert.deepEqual(webhook.messageTexts(), [
                LL.auth.errors.username()
            ]);
            assert.equal(await readPendingInput(dana.id), null);
            assert.equal(await readUserPhone(dana.id), null);
        });
    });

    describe('contact prompts started in the chat', () => {
        it('keeps the reply keyboard re-prompt for sessions without via', async () => {
            await tap(alice, 'a:p');
            await shareContact(alice, '+380670000000', 555);

            assert.equal(
                webhook.lastMessage().text,
                LL.auth.sendNumber.description()
            );
            assert.equal(
                webhook.lastMessage().reply_markup?.keyboard?.[0]?.[0]
                    ?.request_contact,
                true
            );
            assert.deepEqual(await readPendingInput(alice.id), {
                kind: 'contact',
                authType: 'phone'
            });
        });

        it('decodes stored via-less sessions and ignores unknown via values', () => {
            const decode = (pendingInput: unknown) => {
                return decodeSessionState(
                    JSON.stringify({ v: 1, pendingInput, find: null })
                ).pendingInput;
            };

            assert.deepEqual(decode({ kind: 'contact', authType: 'both' }), {
                kind: 'contact',
                authType: 'both'
            });
            assert.deepEqual(
                decode({ kind: 'contact', authType: 'phone', via: 'app' }),
                { kind: 'contact', authType: 'phone', via: 'app' }
            );
            assert.deepEqual(
                decode({ kind: 'contact', authType: 'phone', via: 'other' }),
                { kind: 'contact', authType: 'phone' }
            );
        });
    });
});
