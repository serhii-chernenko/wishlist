import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    snakeCase,
    text,
    uniqueIndex
} from 'drizzle-orm/sqlite-core';

export const userLanguages = ['uk', 'en', 'pl'] as const;

export const users = snakeCase.table(
    'users',
    {
        id: integer().primaryKey({ autoIncrement: true }),
        mongoId: text(),
        telegramId: integer().notNull(),
        username: text(),
        usernameSearchable: integer({ mode: 'boolean' })
            .notNull()
            .default(false),
        phone: text(),
        phoneDigits: text(),
        language: text({ enum: userLanguages }),
        telegramLanguageCode: text(),
        currency: text().notNull().default('UAH'),
        telegraphAccessToken: text(),
        payments: text(),
        deliveryAddress: text(),
        showPayments: integer({ mode: 'boolean' }).notNull().default(true),
        showPhone: integer({ mode: 'boolean' }).notNull().default(false),
        showAddress: integer({ mode: 'boolean' }).notNull().default(false),
        wishlistFilter: integer(),
        releaseVersion: text().notNull().default('0.0.0'),
        blockedAt: integer({ mode: 'timestamp_ms' }),
        lastSeenAt: integer({ mode: 'timestamp_ms' }),
        lastBotSeenAt: integer({ mode: 'timestamp_ms' }),
        lastAppSeenAt: integer({ mode: 'timestamp_ms' }),
        createdAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date())
    },
    table => {
        return [
            uniqueIndex('users_mongo_id_unique').on(table.mongoId),
            uniqueIndex('users_telegram_id_unique').on(table.telegramId),
            uniqueIndex('users_phone_unique').on(table.phone),
            uniqueIndex('users_username_lower_unique').on(
                sql`lower(${table.username})`
            ),
            index('users_phone_digits_index').on(table.phoneDigits),
            index('users_release_index').on(
                table.blockedAt,
                table.releaseVersion
            ),
            check(
                'users_language_check',
                sql`${table.language} is null or ${table.language} in ('uk', 'en', 'pl')`
            ),
            check(
                'users_wishlist_filter_check',
                sql`${table.wishlistFilter} is null or ${table.wishlistFilter} between 0 and 4`
            )
        ];
    }
);
