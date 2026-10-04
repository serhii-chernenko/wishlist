import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';
import type { User } from 'telegraf/types';

import type { AppLocale } from '../src/bot/i18n';
import type { Repositories, UserRecord } from '../src/bot/runtime/types';
import { createUserService } from '../src/bot/services/user-service';
import type { Currency } from '../src/shared/money';

const NOW = new Date('2026-10-04T10:00:00.000Z');

interface CurrencyCall {
    id: number;
    currency: Currency;
}

const buildHarness = () => {
    const created: Array<Record<string, unknown>> = [];
    const currencyCalls: CurrencyCall[] = [];
    const repos = {
        users: {
            create: (input: Record<string, unknown>) => {
                created.push(input);

                return Effect.succeed({ id: 1, ...input } as UserRecord);
            },
            setCurrency: (id: number, currency: Currency) => {
                currencyCalls.push({ id, currency });

                return Effect.succeed({ id, currency } as UserRecord);
            }
        }
    } as unknown as Repositories;

    return {
        created,
        currencyCalls,
        service: createUserService({ repos, now: () => NOW })
    };
};

const actor = (languageCode: string | undefined): User => {
    return {
        id: 42,
        is_bot: false,
        first_name: 'Olena',
        username: 'olena_k',
        ...(languageCode === undefined ? {} : { language_code: languageCode })
    };
};

const register = async (
    languageCode: string | undefined,
    sessionLanguage: AppLocale | null
) => {
    const { created, service } = buildHarness();

    await service.saveVisibility({
        actor: actor(languageCode),
        user: null,
        sessionLanguage,
        authType: 'username',
        phone: null
    });

    return created[0]?.currency;
};

test('a new user gets the currency of the language Telegram reports', async () => {
    assert.equal(await register('uk', null), 'UAH');
    assert.equal(await register('en', null), 'EUR');
    assert.equal(await register('en-GB', null), 'EUR');
    assert.equal(await register('pl', null), 'PLN');
});

test('a new user without a recognised language falls back to the default locale currency', async () => {
    assert.equal(await register(undefined, null), 'UAH');
    assert.equal(await register('de', null), 'EUR');
});

test('the language a guest picked wins over the Telegram language', async () => {
    assert.equal(await register('en', 'pl'), 'PLN');
    assert.equal(await register('pl', 'uk'), 'UAH');
    assert.equal(await register('uk', 'en'), 'EUR');
});

test('setCurrency stores the chosen currency for that user and returns the row', async () => {
    const { currencyCalls, service } = buildHarness();
    const updated = await service.setCurrency({ id: 7 } as UserRecord, 'USD');

    assert.deepEqual(currencyCalls, [{ id: 7, currency: 'USD' }]);
    assert.equal(updated?.currency, 'USD');
});
