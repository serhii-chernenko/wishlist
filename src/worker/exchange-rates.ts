import {
    readExchangeRates,
    refreshExchangeRates,
    type RatesFetcher,
    type RatesRefreshResult,
    type RatesRefreshTrigger,
    type RatesRepository
} from '../bot/services/exchange-rate-service';
import { createDb } from '../db/client';
import { createRepositories } from '../db/repositories';
import type { ExchangeRates } from '../shared/money';
import type { WorkerBindings } from './env';
import { emitTelemetryEvent, type TelemetryContext } from './telemetry';

export type ExchangeRatesSource = (
    env: WorkerBindings,
    context: TelemetryContext,
    repository: RatesRepository
) => Promise<ExchangeRates>;

const fetchFromNetwork: RatesFetcher = (input, init) => {
    return fetch(input, init);
};

export const emitRatesRefreshTelemetry = (
    env: WorkerBindings,
    context: TelemetryContext,
    trigger: RatesRefreshTrigger,
    result: RatesRefreshResult
) => {
    emitTelemetryEvent(env, context, {
        event: 'exchange_rates_refresh',
        trigger,
        outcome: result.outcome,
        ...(result.outcome === 'failed' && { reason: result.reason })
    });
};

export const readWorkerExchangeRates: ExchangeRatesSource = (
    env,
    context,
    repository
) => {
    return readExchangeRates({
        repository,
        ...(context && {
            background: {
                waitUntil: promise => {
                    context.waitUntil(promise);
                },
                fetch: fetchFromNetwork,
                onResult: result => {
                    emitRatesRefreshTelemetry(env, context, 'read', result);
                }
            }
        })
    });
};

export const refreshStoredExchangeRates = (env: WorkerBindings) => {
    return refreshExchangeRates({
        repository: createRepositories(createDb(env)).exchangeRates,
        fetch: fetchFromNetwork,
        now: () => new Date()
    });
};
