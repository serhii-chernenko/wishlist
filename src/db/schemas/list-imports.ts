import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    snakeCase,
    text,
    uniqueIndex
} from 'drizzle-orm/sqlite-core';

import {
    LIST_IMPORT_CHANNELS,
    LIST_IMPORT_FAILURES,
    LIST_IMPORT_KINDS,
    LIST_IMPORT_SOURCES,
    LIST_IMPORT_STATES,
    LIST_IMPORT_VISIBILITIES
} from '../../shared/app-api';
import { users } from './users';

const toSqlList = (values: readonly string[]) => {
    return sql.raw(
        values
            .map(value => {
                return `'${value}'`;
            })
            .join(', ')
    );
};

export const listImports = snakeCase.table(
    'list_imports',
    {
        id: integer().primaryKey({ autoIncrement: true }),
        userId: integer()
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        source: text({ enum: LIST_IMPORT_SOURCES }).notNull(),
        kind: text({ enum: LIST_IMPORT_KINDS }).notNull(),
        channel: text({ enum: LIST_IMPORT_CHANNELS }).notNull(),
        state: text({ enum: LIST_IMPORT_STATES }).notNull(),
        sourceUrl: text(),
        visibility: text({ enum: LIST_IMPORT_VISIBILITIES }).notNull(),
        found: integer().notNull().default(0),
        planned: integer().notNull().default(0),
        plannedGifted: integer().notNull().default(0),
        duplicates: integer().notNull().default(0),
        overLimit: integer().notNull().default(0),
        withoutPrice: integer().notNull().default(0),
        withoutPhoto: integer().notNull().default(0),
        created: integer().notNull().default(0),
        createdGifted: integer().notNull().default(0),
        attempts: integer().notNull().default(0),
        failure: text({ enum: LIST_IMPORT_FAILURES }),
        chatMessageId: integer(),
        leaseUntil: integer({ mode: 'timestamp_ms' }),
        createdAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date()),
        finishedAt: integer({ mode: 'timestamp_ms' })
    },
    table => {
        return [
            index('list_imports_user_state_index').on(
                table.userId,
                table.state
            ),
            uniqueIndex('list_imports_one_active')
                .on(table.userId)
                .where(sql`${table.state} = 'committing'`),
            check(
                'list_imports_source_check',
                sql`${table.source} in (${toSqlList(LIST_IMPORT_SOURCES)})`
            ),
            check(
                'list_imports_kind_check',
                sql`${table.kind} in (${toSqlList(LIST_IMPORT_KINDS)})`
            ),
            check(
                'list_imports_channel_check',
                sql`${table.channel} in (${toSqlList(LIST_IMPORT_CHANNELS)})`
            ),
            check(
                'list_imports_state_check',
                sql`${table.state} in (${toSqlList(LIST_IMPORT_STATES)})`
            ),
            check(
                'list_imports_visibility_check',
                sql`${table.visibility} in (${toSqlList(LIST_IMPORT_VISIBILITIES)})`
            ),
            check(
                'list_imports_failure_check',
                sql`${table.failure} is null or ${table.failure} in (${toSqlList(LIST_IMPORT_FAILURES)})`
            )
        ];
    }
);
