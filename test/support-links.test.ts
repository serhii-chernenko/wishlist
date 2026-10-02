import assert from 'node:assert/strict';
import test from 'node:test';

import type { InlineKeyboardMarkup } from 'telegraf/types';

import { getSupportLinks } from '../src/bot/content/support-links';
import { getMessages } from '../src/bot/content/messages';
import { screen as donateScreen } from '../src/bot/screens/donate';
import type { BotRequest } from '../src/bot/runtime/types';
import type { WorkerBindings } from '../src/worker/env';

const supportEnv = {
    MONOBANK_URL: 'https://send.monobank.ua/jar/4ZGhPQqyMh',
    KOFI_URL: 'https://ko-fi.com/serhiichernenko',
    PAYPAL_URL: 'https://www.paypal.me/chernenkoserhii',
    REVOLUT_URL: 'https://revolut.me/serhiichernenko'
} as const;

test('support links keep the monobank, ko-fi, paypal, revolut order', () => {
    const LL = getMessages('en');

    assert.deepEqual(getSupportLinks(supportEnv, LL), [
        {
            id: 'monobank',
            title: LL.donate.services.monobank.title(),
            url: supportEnv.MONOBANK_URL
        },
        {
            id: 'kofi',
            title: '☕️ Ko-fi',
            url: supportEnv.KOFI_URL
        },
        {
            id: 'paypal',
            title: '💳 PayPal',
            url: supportEnv.PAYPAL_URL
        },
        {
            id: 'revolut',
            title: '💸 Revolut',
            url: supportEnv.REVOLUT_URL
        }
    ]);
});

test('support links skip empty or missing urls', () => {
    const links = getSupportLinks(
        {
            ...supportEnv,
            KOFI_URL: '  ',
            REVOLUT_URL: undefined
        } as unknown as typeof supportEnv,
        getMessages('uk')
    );

    assert.deepEqual(
        links.map(link => link.id),
        ['monobank', 'paypal']
    );
});

test('the donate screen shows the paypal.me link and the support buttons in order', async () => {
    for (const locale of ['uk', 'en', 'pl'] as const) {
        const sent: { html: string; keyboard: InlineKeyboardMarkup }[] = [];
        const LL = getMessages(locale);
        const request = {
            env: {
                ...supportEnv,
                TG_CHANNEL: 'https://t.me/serhii_chernenko'
            } as unknown as WorkerBindings,
            LL,
            send: {
                text: async (html: string, keyboard: InlineKeyboardMarkup) => {
                    sent.push({ html, keyboard });
                }
            }
        } as unknown as BotRequest;

        await donateScreen.render(request, undefined as never);

        const [message] = sent;

        assert.ok(message, locale);
        assert.ok(message.html.includes(supportEnv.PAYPAL_URL), locale);
        assert.doesNotMatch(message.html, /@chernenko\.digital/, locale);
        assert.doesNotMatch(message.html, /buymeacoffee/i, locale);

        const buttons = message.keyboard.inline_keyboard.flat();

        assert.deepEqual(
            buttons.map(button => {
                return 'url' in button ? button.url : button.text;
            }),
            [
                supportEnv.MONOBANK_URL,
                supportEnv.KOFI_URL,
                supportEnv.PAYPAL_URL,
                supportEnv.REVOLUT_URL,
                'https://t.me/serhii_chernenko',
                LL.actions.home()
            ],
            locale
        );
    }
});
