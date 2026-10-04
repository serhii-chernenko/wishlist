import type {
    ExchangeRateInput,
    ExchangeRateRecord,
    ExchangeRateRepository
} from '../../db/repositories';
import {
    CONVERTED_CURRENCIES,
    FALLBACK_RATES,
    parseIsoDate,
    RATE_PIVOT_CURRENCY,
    type ExchangeRates
} from '../../shared/money';
import { runRepository } from './run-repository';

export const NBU_EXCHANGE_URL =
    'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';
export const RATES_FETCH_TIMEOUT_MS = 5_000;
export const RATES_CACHE_TTL_MS = 10 * 60 * 1000;
export const RATES_STALE_AFTER_MS = 36 * 60 * 60 * 1000;
export const RATES_REFRESH_MIN_GAP_MS = 60 * 60 * 1000;

export const RATES_REFRESH_FAILURE_REASONS = [
    'timeout',
    'network',
    'httpStatus',
    'invalidJson',
    'invalidPayload',
    'missingCurrency',
    'invalidRate',
    'invalidDate',
    'storage',
    'unexpected'
] as const;

export type RatesRefreshFailureReason =
    (typeof RATES_REFRESH_FAILURE_REASONS)[number];

export type RatesRefreshResult =
    | {
          outcome: 'refreshed' | 'unchanged';
          rates: ExchangeRates;
          fetchedAt: Date;
      }
    | { outcome: 'failed'; reason: RatesRefreshFailureReason };

export type RatesRefreshTrigger = 'cron' | 'read';

export type RatesFetcher = (
    input: string,
    init?: RequestInit
) => Promise<Response>;

export type RatesRepository = Pick<
    ExchangeRateRepository,
    'listAll' | 'upsertMany'
>;

export interface RatesSnapshot {
    rates: ExchangeRates;
    fetchedAt: Date | null;
}

export interface ExchangeRatesCacheState {
    snapshot: (RatesSnapshot & { loadedAt: number }) | null;
    refreshing: boolean;
    lastRefreshAttemptAt: number | null;
}

export interface BackgroundRatesRefresh {
    waitUntil(promise: Promise<unknown>): void;
    fetch: RatesFetcher;
    onResult(result: RatesRefreshResult): void;
}

export interface RatesRefreshDependencies {
    repository: RatesRepository;
    fetch: RatesFetcher;
    now: () => Date;
    timeoutMs?: number;
}

export interface ExchangeRatesReaderDependencies {
    repository: RatesRepository;
    now?: () => Date;
    background?: BackgroundRatesRefresh;
    state?: ExchangeRatesCacheState;
}

type ParsedRates =
    | { ok: true; rates: ExchangeRateInput[] }
    | { ok: false; reason: RatesRefreshFailureReason };

type FetchedPayload =
    | { ok: true; payload: unknown }
    | { ok: false; reason: RatesRefreshFailureReason };

const NBU_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ISO_DATE_LENGTH = 10;
const TIMEOUT_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);

export const createExchangeRatesCacheState = (): ExchangeRatesCacheState => {
    return { snapshot: null, refreshing: false, lastRefreshAttemptAt: null };
};

const isolateCacheState = createExchangeRatesCacheState();

export const resetExchangeRatesCache = () => {
    Object.assign(isolateCacheState, createExchangeRatesCacheState());
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isPositiveRate = (value: unknown): value is number => {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

const toIsoRateDate = (value: unknown) => {
    if (typeof value !== 'string') {
        return null;
    }

    const match = NBU_DATE_PATTERN.exec(value.trim());

    if (match === null) {
        return null;
    }

    const [, day, month, year] = match;
    const isoDate = `${year}-${month}-${day}`;

    return parseIsoDate(isoDate) === null ? null : isoDate;
};

export const parseNbuRates = (payload: unknown): ParsedRates => {
    if (!Array.isArray(payload)) {
        return { ok: false, reason: 'invalidPayload' };
    }

    const rates: ExchangeRateInput[] = [];

    for (const currency of CONVERTED_CURRENCIES) {
        const entry = payload.find(item => {
            return isRecord(item) && item.cc === currency;
        }) as Record<string, unknown> | undefined;

        if (entry === undefined) {
            return { ok: false, reason: 'missingCurrency' };
        }

        if (!isPositiveRate(entry.rate)) {
            return { ok: false, reason: 'invalidRate' };
        }

        const rateDate = toIsoRateDate(entry.exchangedate);

        if (rateDate === null) {
            return { ok: false, reason: 'invalidDate' };
        }

        rates.push({ currency, uahPerUnit: entry.rate, rateDate });
    }

    return { ok: true, rates };
};

const isTimeoutError = (error: unknown) => {
    return error instanceof Error && TIMEOUT_ERROR_NAMES.has(error.name);
};

const requestNbuRates = async (
    fetcher: RatesFetcher,
    timeoutMs: number
): Promise<Response | RatesRefreshFailureReason> => {
    try {
        return await fetcher(NBU_EXCHANGE_URL, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs)
        });
    } catch (error) {
        return isTimeoutError(error) ? 'timeout' : 'network';
    }
};

const fetchNbuPayload = async (
    fetcher: RatesFetcher,
    timeoutMs: number
): Promise<FetchedPayload> => {
    const response = await requestNbuRates(fetcher, timeoutMs);

    if (typeof response === 'string') {
        return { ok: false, reason: response };
    }

    if (!response.ok) {
        return { ok: false, reason: 'httpStatus' };
    }

    try {
        return { ok: true, payload: await response.json() };
    } catch (error) {
        return {
            ok: false,
            reason: isTimeoutError(error) ? 'timeout' : 'invalidJson'
        };
    }
};

type StoredRateRow = Pick<
    ExchangeRateRecord,
    'currency' | 'uahPerUnit' | 'rateDate' | 'fetchedAt'
>;

const isUsableRateRow = (
    row: StoredRateRow | undefined
): row is StoredRateRow => {
    return (
        row !== undefined &&
        isPositiveRate(row.uahPerUnit) &&
        parseIsoDate(row.rateDate) !== null
    );
};

const toUtcIsoDate = (time: number) => {
    return new Date(time).toISOString().slice(0, ISO_DATE_LENGTH);
};

/** Each currency falls back on its own; any fallback leaves `fetchedAt` null so the snapshot counts as stale and schedules a refresh. `date` is the UTC day the rates were fetched, not the NBU value date, which is often the next day. */
export const toRatesSnapshot = (
    rows: readonly StoredRateRow[]
): RatesSnapshot => {
    const perUnit = { ...FALLBACK_RATES.perUnit, [RATE_PIVOT_CURRENCY]: 1 };
    const fetchedDates: string[] = [];
    const fetchedTimes: number[] = [];
    let usesFallback = false;

    for (const currency of CONVERTED_CURRENCIES) {
        const row = rows.find(candidate => {
            return candidate.currency === currency;
        });

        if (!isUsableRateRow(row)) {
            usesFallback = true;
            fetchedDates.push(FALLBACK_RATES.date);
            continue;
        }

        perUnit[currency] = row.uahPerUnit;
        fetchedDates.push(toUtcIsoDate(row.fetchedAt.getTime()));
        fetchedTimes.push(row.fetchedAt.getTime());
    }

    if (fetchedTimes.length === 0) {
        return { rates: FALLBACK_RATES, fetchedAt: null };
    }

    const [date = FALLBACK_RATES.date] = fetchedDates.sort();

    return {
        rates: { date, perUnit },
        fetchedAt: usesFallback ? null : new Date(Math.min(...fetchedTimes))
    };
};

const isSameRates = (
    stored: readonly StoredRateRow[],
    fetched: readonly ExchangeRateInput[]
) => {
    return fetched.every(rate => {
        return stored.some(row => {
            return (
                row.currency === rate.currency &&
                row.uahPerUnit === rate.uahPerUnit &&
                row.rateDate === rate.rateDate
            );
        });
    });
};

const storeRates = async (
    dependencies: RatesRefreshDependencies,
    rates: readonly ExchangeRateInput[]
): Promise<RatesRefreshResult> => {
    const fetchedAt = dependencies.now();

    try {
        const stored = await runRepository(dependencies.repository.listAll());

        await runRepository(
            dependencies.repository.upsertMany(rates, fetchedAt)
        );

        return {
            outcome: isSameRates(stored, rates) ? 'unchanged' : 'refreshed',
            rates: toRatesSnapshot(
                rates.map(rate => {
                    return { ...rate, fetchedAt };
                })
            ).rates,
            fetchedAt
        };
    } catch {
        return { outcome: 'failed', reason: 'storage' };
    }
};

export const refreshExchangeRates = async (
    dependencies: RatesRefreshDependencies
): Promise<RatesRefreshResult> => {
    const fetched = await fetchNbuPayload(
        dependencies.fetch,
        dependencies.timeoutMs ?? RATES_FETCH_TIMEOUT_MS
    );

    if (!fetched.ok) {
        return { outcome: 'failed', reason: fetched.reason };
    }

    const parsed = parseNbuRates(fetched.payload);

    if (!parsed.ok) {
        return { outcome: 'failed', reason: parsed.reason };
    }

    return storeRates(dependencies, parsed.rates);
};

export const shouldRefreshRates = (
    state: ExchangeRatesCacheState,
    fetchedAt: Date | null,
    nowMs: number
) => {
    const isStale =
        fetchedAt === null ||
        nowMs - fetchedAt.getTime() > RATES_STALE_AFTER_MS;
    const isThrottled =
        state.lastRefreshAttemptAt !== null &&
        nowMs - state.lastRefreshAttemptAt < RATES_REFRESH_MIN_GAP_MS;

    return isStale && !state.refreshing && !isThrottled;
};

const loadSnapshot = async (
    repository: RatesRepository,
    state: ExchangeRatesCacheState,
    nowMs: number
) => {
    const cached = state.snapshot;

    if (cached !== null && nowMs - cached.loadedAt < RATES_CACHE_TTL_MS) {
        return { snapshot: cached, readable: true };
    }

    try {
        const rows = await runRepository(repository.listAll());
        const snapshot = { ...toRatesSnapshot(rows), loadedAt: nowMs };

        state.snapshot = snapshot;

        return { snapshot, readable: true };
    } catch {
        return {
            snapshot: cached ?? {
                rates: FALLBACK_RATES,
                fetchedAt: null,
                loadedAt: nowMs
            },
            readable: false
        };
    }
};

const startBackgroundRefresh = (
    repository: RatesRepository,
    background: BackgroundRatesRefresh,
    state: ExchangeRatesCacheState,
    now: () => Date
) => {
    state.refreshing = true;
    state.lastRefreshAttemptAt = now().getTime();

    const task = refreshExchangeRates({
        repository,
        fetch: background.fetch,
        now
    })
        .then(result => {
            if (result.outcome !== 'failed') {
                state.snapshot = {
                    rates: result.rates,
                    fetchedAt: result.fetchedAt,
                    loadedAt: now().getTime()
                };
            }

            background.onResult(result);
        })
        .catch(() => {
            return undefined;
        })
        .finally(() => {
            state.refreshing = false;
        });

    background.waitUntil(task);
};

/** Serves cached, stored or fallback rates without waiting on the network; stale or missing rates schedule one throttled background refresh when a `background` hook is given. */
export const readExchangeRates = async (
    dependencies: ExchangeRatesReaderDependencies
): Promise<ExchangeRates> => {
    const state = dependencies.state ?? isolateCacheState;
    const now = dependencies.now ?? (() => new Date());
    const { snapshot, readable } = await loadSnapshot(
        dependencies.repository,
        state,
        now().getTime()
    );

    if (
        readable &&
        dependencies.background !== undefined &&
        shouldRefreshRates(state, snapshot.fetchedAt, now().getTime())
    ) {
        startBackgroundRefresh(
            dependencies.repository,
            dependencies.background,
            state,
            now
        );
    }

    return snapshot.rates;
};
