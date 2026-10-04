import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';

import {
    createExchangeRatesCacheState,
    NBU_EXCHANGE_URL,
    parseNbuRates,
    RATES_CACHE_TTL_MS,
    RATES_REFRESH_MIN_GAP_MS,
    RATES_STALE_AFTER_MS,
    readExchangeRates,
    refreshExchangeRates,
    toRatesSnapshot,
    type BackgroundRatesRefresh,
    type RatesFetcher,
    type RatesRefreshResult,
    type RatesRepository
} from '../src/bot/services/exchange-rate-service';
import type {
    ExchangeRateInput,
    ExchangeRateRecord
} from '../src/db/repositories';
import { FALLBACK_RATES } from '../src/shared/money';

const NBU_PAYLOAD = [
    {
        r030: 840,
        txt: 'Долар США',
        rate: 44.9857,
        cc: 'USD',
        exchangedate: '05.10.2026'
    },
    {
        r030: 978,
        txt: 'Євро',
        rate: 50.5333,
        cc: 'EUR',
        exchangedate: '05.10.2026'
    },
    {
        r030: 985,
        txt: 'Злотий',
        rate: 11.5442,
        cc: 'PLN',
        exchangedate: '05.10.2026'
    }
];

const START = new Date('2026-10-05T08:00:00.000Z');

const createFakeRepository = (initial: ExchangeRateRecord[] = []) => {
    let rows = [...initial];
    const calls = { listAll: 0, upsertMany: 0 };
    let failReads = false;
    let failWrites = false;
    const repository: RatesRepository = {
        listAll() {
            calls.listAll += 1;

            return failReads
                ? Effect.fail(new Error('read failed'))
                : Effect.succeed([...rows]);
        },
        upsertMany(rates: readonly ExchangeRateInput[], fetchedAt: Date) {
            calls.upsertMany += 1;

            if (failWrites) {
                return Effect.fail(new Error('write failed'));
            }

            rows = [
                ...rows.filter(row => {
                    return !rates.some(rate => {
                        return rate.currency === row.currency;
                    });
                }),
                ...rates.map(rate => {
                    return { ...rate, fetchedAt };
                })
            ];

            return Effect.succeed(rates.length);
        }
    };

    return {
        repository,
        calls,
        rows: () => rows,
        failReads(value: boolean) {
            failReads = value;
        },
        failWrites(value: boolean) {
            failWrites = value;
        }
    };
};

const storedRows = (fetchedAt: Date, eur = 50.5333): ExchangeRateRecord[] => {
    return [
        {
            currency: 'EUR',
            uahPerUnit: eur,
            rateDate: '2026-10-05',
            fetchedAt
        },
        {
            currency: 'PLN',
            uahPerUnit: 11.5442,
            rateDate: '2026-10-05',
            fetchedAt
        }
    ];
};

const jsonFetcher = (payload: unknown, status = 200) => {
    const requests: string[] = [];
    const fetcher: RatesFetcher = async input => {
        requests.push(input);

        return new Response(JSON.stringify(payload), { status });
    };

    return { fetcher, requests };
};

test('a valid NBU payload yields euro and złoty rates with ISO dates', () => {
    assert.deepEqual(parseNbuRates(NBU_PAYLOAD), {
        ok: true,
        rates: [
            { currency: 'EUR', uahPerUnit: 50.5333, rateDate: '2026-10-05' },
            { currency: 'PLN', uahPerUnit: 11.5442, rateDate: '2026-10-05' }
        ]
    });
});

test('NBU payloads without a usable currency, rate or date are rejected', () => {
    const withEntry = (patch: Record<string, unknown>) => {
        return NBU_PAYLOAD.map(entry => {
            return entry.cc === 'EUR' ? { ...entry, ...patch } : entry;
        });
    };

    assert.deepEqual(parseNbuRates({ cc: 'EUR' }), {
        ok: false,
        reason: 'invalidPayload'
    });
    assert.deepEqual(
        parseNbuRates(
            NBU_PAYLOAD.filter(entry => {
                return entry.cc !== 'PLN';
            })
        ),
        { ok: false, reason: 'missingCurrency' }
    );

    for (const rate of [0, -1, Number.NaN, '50.5', null]) {
        assert.deepEqual(parseNbuRates(withEntry({ rate })), {
            ok: false,
            reason: 'invalidRate'
        });
    }

    for (const exchangedate of ['2026-10-05', '31.02.2026', 5, '']) {
        assert.deepEqual(parseNbuRates(withEntry({ exchangedate })), {
            ok: false,
            reason: 'invalidDate'
        });
    }
});

test('a refresh fetches the NBU feed and stores the validated rates', async () => {
    const fake = createFakeRepository();
    const { fetcher, requests } = jsonFetcher(NBU_PAYLOAD);
    const result = await refreshExchangeRates({
        repository: fake.repository,
        fetch: fetcher,
        now: () => START
    });

    assert.deepEqual(requests, [NBU_EXCHANGE_URL]);
    assert.deepEqual(result, {
        outcome: 'refreshed',
        rates: FALLBACK_RATES,
        fetchedAt: START
    });
    assert.deepEqual(fake.rows(), storedRows(START));
});

test('a refresh with identical rates reports unchanged and bumps the fetch time', async () => {
    const fake = createFakeRepository(storedRows(START));
    const later = new Date(START.getTime() + 60_000);
    const result = await refreshExchangeRates({
        repository: fake.repository,
        fetch: jsonFetcher(NBU_PAYLOAD).fetcher,
        now: () => later
    });

    assert.equal(result.outcome, 'unchanged');
    assert.deepEqual(fake.rows(), storedRows(later));
});

test('failed fetches and invalid payloads leave the stored rates untouched', async () => {
    const cases: [RatesFetcher, string][] = [
        [jsonFetcher(NBU_PAYLOAD, 503).fetcher, 'httpStatus'],
        [jsonFetcher(NBU_PAYLOAD.slice(0, 1)).fetcher, 'missingCurrency'],
        [
            async () => {
                return new Response('<html>', { status: 200 });
            },
            'invalidJson'
        ],
        [
            async () => {
                throw new TypeError('fetch failed');
            },
            'network'
        ],
        [
            async () => {
                throw new DOMException('timed out', 'TimeoutError');
            },
            'timeout'
        ]
    ];

    for (const [fetcher, reason] of cases) {
        const fake = createFakeRepository(storedRows(START, 49));
        const result = await refreshExchangeRates({
            repository: fake.repository,
            fetch: fetcher,
            now: () => START
        });

        assert.deepEqual(result, { outcome: 'failed', reason }, reason);
        assert.equal(fake.calls.upsertMany, 0, reason);
        assert.deepEqual(fake.rows(), storedRows(START, 49), reason);
    }
});

test('a storage failure is reported without throwing', async () => {
    const fake = createFakeRepository();

    fake.failWrites(true);

    assert.deepEqual(
        await refreshExchangeRates({
            repository: fake.repository,
            fetch: jsonFetcher(NBU_PAYLOAD).fetcher,
            now: () => START
        }),
        { outcome: 'failed', reason: 'storage' }
    );
});

test('incomplete stored rates fall back to the baked-in snapshot', () => {
    assert.deepEqual(toRatesSnapshot([]), {
        rates: FALLBACK_RATES,
        fetchedAt: null
    });
    assert.deepEqual(toRatesSnapshot(storedRows(START).slice(0, 1)), {
        rates: FALLBACK_RATES,
        fetchedAt: null
    });
    assert.deepEqual(toRatesSnapshot(storedRows(START, 51)), {
        rates: {
            date: '2026-10-05',
            perUnit: { UAH: 1, EUR: 51, PLN: 11.5442 }
        },
        fetchedAt: START
    });
});

const createBackground = (fetcher: RatesFetcher) => {
    const tasks: Promise<unknown>[] = [];
    const results: RatesRefreshResult[] = [];
    const background: BackgroundRatesRefresh = {
        waitUntil(promise) {
            tasks.push(promise);
        },
        fetch: fetcher,
        onResult(result) {
            results.push(result);
        }
    };

    return {
        background,
        tasks,
        results,
        settle() {
            return Promise.all(tasks);
        }
    };
};

test('reads are cached in the isolate for ten minutes', async () => {
    const fake = createFakeRepository(storedRows(START, 51));
    const state = createExchangeRatesCacheState();
    let now = START;
    const read = () => {
        return readExchangeRates({
            repository: fake.repository,
            state,
            now: () => now
        });
    };

    assert.equal((await read()).perUnit.EUR, 51);
    now = new Date(START.getTime() + RATES_CACHE_TTL_MS - 1);
    assert.equal((await read()).perUnit.EUR, 51);
    assert.equal(fake.calls.listAll, 1);

    now = new Date(START.getTime() + RATES_CACHE_TTL_MS);
    await read();
    assert.equal(fake.calls.listAll, 2);
});

test('fresh stored rates never trigger a background refresh', async () => {
    const fake = createFakeRepository(storedRows(START));
    const { fetcher, requests } = jsonFetcher(NBU_PAYLOAD);
    const { background, tasks } = createBackground(fetcher);

    await readExchangeRates({
        repository: fake.repository,
        state: createExchangeRatesCacheState(),
        now: () => new Date(START.getTime() + RATES_STALE_AFTER_MS),
        background
    });

    assert.equal(tasks.length, 0);
    assert.equal(requests.length, 0);
});

test('missing rates serve the fallback and refresh once in the background', async () => {
    const fake = createFakeRepository();
    const state = createExchangeRatesCacheState();
    const { fetcher, requests } = jsonFetcher(NBU_PAYLOAD);
    const { background, results, settle } = createBackground(fetcher);
    const read = () => {
        return readExchangeRates({
            repository: fake.repository,
            state,
            now: () => START,
            background
        });
    };

    assert.equal(await read(), FALLBACK_RATES);
    await read();
    await settle();

    assert.equal(requests.length, 1);
    assert.deepEqual(
        results.map(result => {
            return result.outcome;
        }),
        ['refreshed']
    );
    assert.equal(state.refreshing, false);
    assert.deepEqual(fake.rows(), storedRows(START));
    assert.deepEqual(await read(), FALLBACK_RATES);
    assert.equal(fake.calls.listAll, 2);
});

test('a failed background refresh is throttled for an hour', async () => {
    const fake = createFakeRepository(
        storedRows(new Date(START.getTime() - RATES_STALE_AFTER_MS - 1))
    );
    const state = createExchangeRatesCacheState();
    let now = START;
    let attempts = 0;
    const { background, results, settle } = createBackground(async () => {
        attempts += 1;
        throw new TypeError('offline');
    });
    const read = async () => {
        await readExchangeRates({
            repository: fake.repository,
            state,
            now: () => now,
            background
        });
        await settle();
    };

    await read();
    now = new Date(START.getTime() + RATES_REFRESH_MIN_GAP_MS - 1);
    await read();
    assert.equal(attempts, 1);
    assert.deepEqual(results, [{ outcome: 'failed', reason: 'network' }]);

    now = new Date(START.getTime() + RATES_REFRESH_MIN_GAP_MS);
    await read();
    assert.equal(attempts, 2);
});

test('reads without a background hook never touch the network', async () => {
    const fake = createFakeRepository();
    const rates = await readExchangeRates({
        repository: fake.repository,
        state: createExchangeRatesCacheState(),
        now: () => START
    });

    assert.equal(rates, FALLBACK_RATES);
});

test('a database failure serves the fallback and skips the refresh', async () => {
    const fake = createFakeRepository();
    const { fetcher, requests } = jsonFetcher(NBU_PAYLOAD);
    const { background, tasks } = createBackground(fetcher);

    fake.failReads(true);

    assert.equal(
        await readExchangeRates({
            repository: fake.repository,
            state: createExchangeRatesCacheState(),
            now: () => START,
            background
        }),
        FALLBACK_RATES
    );
    assert.equal(tasks.length, 0);
    assert.equal(requests.length, 0);
});
