import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    snakeCase,
    text
} from 'drizzle-orm/sqlite-core';

export const defaultSessionState = '{"v":1}';

export const sessions = snakeCase.table(
    'sessions',
    {
        telegramUserId: integer().primaryKey(),
        language: text(),
        state: text().notNull().default(defaultSessionState),
        mediaGroupId: text(),
        mediaGroupMarker: integer(),
        updatedAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date())
    },
    table => {
        return [
            index('sessions_updated_at_index').on(table.updatedAt),
            check(
                'sessions_language_check',
                sql`${table.language} is null or ${table.language} in ('uk', 'en', 'pl')`
            )
        ];
    }
);
