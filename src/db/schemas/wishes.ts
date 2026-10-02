import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    snakeCase,
    text,
    uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { users } from './users';

export const maximumWishImages = 9;

export const wishes = snakeCase.table(
    'wishes',
    {
        id: integer().primaryKey({ autoIncrement: true }),
        mongoId: text(),
        userId: integer().references(() => users.id, {
            onDelete: 'set null'
        }),
        title: text().notNull(),
        description: text(),
        link: text(),
        images: text().notNull().default('[]'),
        priority: integer({ mode: 'boolean' }).notNull().default(false),
        hidden: integer({ mode: 'boolean' }).notNull().default(false),
        removed: integer({ mode: 'boolean' }).notNull().default(false),
        done: integer({ mode: 'boolean' }).notNull().default(false),
        price: integer().notNull().default(0),
        createdAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date())
    },
    table => {
        return [
            uniqueIndex('wishes_mongo_id_unique').on(table.mongoId),
            index('wishes_owner_list_index').on(
                table.userId,
                table.removed,
                table.priority,
                table.updatedAt
            ),
            index('wishes_done_index').on(table.done),
            check('wishes_price_check', sql`${table.price} >= 0`),
            check(
                'wishes_images_check',
                sql`json_valid(${table.images}) and json_array_length(${table.images}) <= 9`
            )
        ];
    }
);
