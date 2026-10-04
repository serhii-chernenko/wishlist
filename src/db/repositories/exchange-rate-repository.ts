import type { AppDb } from '../client';
import { exchangeRates } from '../schema';
import { createTryDb } from './try-db';

export type ExchangeRateRecord = typeof exchangeRates.$inferSelect;

export interface ExchangeRateInput {
    currency: string;
    uahPerUnit: number;
    rateDate: string;
}

const tryDb = createTryDb('Exchange rate repository');

export const createExchangeRateRepository = (db: AppDb) => {
    return {
        listAll() {
            return tryDb(() => {
                return db.select().from(exchangeRates);
            });
        },
        upsertMany(rates: readonly ExchangeRateInput[], fetchedAt: Date) {
            return tryDb(async () => {
                const [first, ...rest] = rates.map(rate => {
                    const values = { ...rate, fetchedAt };

                    return db
                        .insert(exchangeRates)
                        .values(values)
                        .onConflictDoUpdate({
                            target: exchangeRates.currency,
                            set: {
                                uahPerUnit: values.uahPerUnit,
                                rateDate: values.rateDate,
                                fetchedAt
                            }
                        });
                });

                if (first === undefined) {
                    return 0;
                }

                await db.batch([first, ...rest]);

                return rates.length;
            });
        }
    };
};

export type ExchangeRateRepository = ReturnType<
    typeof createExchangeRateRepository
>;
