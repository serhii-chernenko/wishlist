import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import type { ApiErrorBody, MeDto } from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

const buildFixture = (
    id: number,
    languageCode: string,
    username: string
): InitDataUserFixture => {
    return {
        id,
        first_name: username,
        username,
        language_code: languageCode
    };
};

const UKRAINIAN = buildFixture(710_001, 'uk', 'olena_uk');
const ENGLISH = buildFixture(710_002, 'en', 'olena_en');
const POLISH = buildFixture(710_003, 'pl', 'olena_pl');

describe('Mini App currency', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const api = (
        method: string,
        path: string,
        options: { as?: InitDataUserFixture; body?: unknown } = {}
    ) => {
        const headers = new Headers();

        if (options.as !== undefined) {
            headers.set(
                'Authorization',
                `tma ${createSignedInitData({ user: options.as, authDate: NOW_SECONDS })}`
            );
        }

        const init: RequestInit = { method, headers };

        if (options.body !== undefined) {
            headers.set('Content-Type', 'application/json');
            init.body = JSON.stringify(options.body);
        }

        return createApp(
            {},
            {},
            { now: () => NOW },
            {
                now: () => NOW,
                crypto: createNodeApiCrypto(),
                emitTelemetry: (_env, _context, fields) => {
                    events.push(fields);
                }
            }
        ).request(`/api/app${path}`, init, buildEnv());
    };

    const register = async (fixture: InitDataUserFixture) => {
        const response = await api('PUT', '/me/visibility', {
            as: fixture,
            body: { type: 'username' }
        });

        assert.equal(response.status, 200);

        return (await response.json()) as MeDto;
    };

    const readStoredCurrency = async (fixture: InitDataUserFixture) => {
        const stored = await run(
            harness.repositories.users.findByTelegramId(fixture.id)
        );

        return stored?.currency;
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        events = [];
        await harness.clearApplicationTables();
    });

    it('registers new users with the currency of their language', async () => {
        assert.equal((await register(UKRAINIAN)).currency, 'UAH');
        assert.equal((await register(ENGLISH)).currency, 'EUR');
        assert.equal((await register(POLISH)).currency, 'PLN');
        assert.equal(await readStoredCurrency(UKRAINIAN), 'UAH');
        assert.equal(await readStoredCurrency(ENGLISH), 'EUR');
        assert.equal(await readStoredCurrency(POLISH), 'PLN');
    });

    it('registers a guest with the language they chose in the app', async () => {
        await api('PUT', '/me/language', {
            as: ENGLISH,
            body: { choice: 'pl' }
        });

        assert.equal((await register(ENGLISH)).currency, 'PLN');
    });

    it('stores the chosen currency and returns the updated profile', async () => {
        await register(UKRAINIAN);

        const response = await api('PUT', '/me/currency', {
            as: UKRAINIAN,
            body: { currency: 'USD' }
        });
        const me = (await response.json()) as MeDto;

        assert.equal(response.status, 200);
        assert.equal(me.currency, 'USD');
        assert.equal(me.locale, 'uk');
        assert.equal(await readStoredCurrency(UKRAINIAN), 'USD');

        const reloaded = (await (
            await api('GET', '/me', { as: UKRAINIAN })
        ).json()) as MeDto;

        assert.equal(reloaded.currency, 'USD');
        assert.deepEqual(
            events
                .filter(event => {
                    return event.action === 'currency_changed';
                })
                .map(event => {
                    return [event.channel, event.result];
                }),
            [['app', 'USD']]
        );
    });

    it('does not rewrite the currency of existing wishes', async () => {
        const me = await register(UKRAINIAN);
        const owner = await run(
            harness.repositories.users.findByTelegramId(UKRAINIAN.id)
        );

        assert.ok(owner);

        const wish = await run(
            harness.repositories.wishes.create(owner.id, 'Bike', 'UAH', NOW)
        );

        assert.ok(wish);
        assert.equal(me.currency, 'UAH');

        await api('PUT', '/me/currency', {
            as: UKRAINIAN,
            body: { currency: 'EUR' }
        });

        const [row] = (
            await harness.env.DB.prepare(
                'SELECT currency FROM wishes WHERE id = ?'
            )
                .bind(wish.id)
                .all<{ currency: string }>()
        ).results;

        assert.equal(row?.currency, 'UAH');
    });

    it('rejects an unknown or missing currency', async () => {
        await register(UKRAINIAN);

        for (const body of [
            { currency: 'GBP' },
            { currency: 'usd' },
            { currency: 5 },
            {}
        ]) {
            const response = await api('PUT', '/me/currency', {
                as: UKRAINIAN,
                body
            });
            const error = ((await response.json()) as ApiErrorBody).error;

            assert.equal(response.status, 422, JSON.stringify(body));
            assert.equal(error.code, 'validation');
            assert.ok(error.fields?.currency !== undefined);
        }

        assert.equal(await readStoredCurrency(UKRAINIAN), 'UAH');
    });

    it('asks a guest to register first and rejects anonymous calls', async () => {
        const guest = await api('PUT', '/me/currency', {
            as: ENGLISH,
            body: { currency: 'USD' }
        });

        assert.equal(guest.status, 403);
        assert.equal(
            ((await guest.json()) as ApiErrorBody).error.code,
            'registrationRequired'
        );

        const anonymous = await api('PUT', '/me/currency', {
            body: { currency: 'USD' }
        });

        assert.equal(anonymous.status, 401);
    });
});
