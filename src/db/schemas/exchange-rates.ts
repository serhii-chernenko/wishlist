import { integer, real, snakeCase, text } from 'drizzle-orm/sqlite-core';

export const exchangeRates = snakeCase.table('exchange_rates', {
    currency: text().primaryKey(),
    uahPerUnit: real().notNull(),
    rateDate: text().notNull(),
    fetchedAt: integer({ mode: 'timestamp_ms' }).notNull()
});
