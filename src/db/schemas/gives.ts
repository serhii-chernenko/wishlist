import {
    index,
    integer,
    snakeCase,
    text,
    uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { users } from './users';
import { wishes } from './wishes';

export const gives = snakeCase.table(
    'gives',
    {
        id: integer().primaryKey({ autoIncrement: true }),
        mongoId: text(),
        userId: integer()
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        wishId: integer()
            .notNull()
            .references(() => wishes.id, { onDelete: 'cascade' }),
        createdAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date())
    },
    table => {
        return [
            uniqueIndex('gives_mongo_id_unique').on(table.mongoId),
            uniqueIndex('gives_user_wish_unique').on(
                table.userId,
                table.wishId
            ),
            index('gives_wish_index').on(table.wishId)
        ];
    }
);
