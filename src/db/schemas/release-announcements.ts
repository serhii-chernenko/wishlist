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

export const releaseAnnouncementStatuses = [
    'queued',
    'sending',
    'sent',
    'skipped',
    'failed'
] as const;

export const releaseAnnouncements = snakeCase.table(
    'release_announcements',
    {
        id: integer().primaryKey({ autoIncrement: true }),
        releaseVersion: text().notNull(),
        userId: integer()
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        status: text({ enum: releaseAnnouncementStatuses }).notNull(),
        attempts: integer().notNull().default(0),
        lastErrorCode: integer(),
        mediaSentAt: integer({ mode: 'timestamp_ms' }),
        createdAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date())
    },
    table => {
        return [
            uniqueIndex('release_announcements_version_user_unique').on(
                table.releaseVersion,
                table.userId
            ),
            check(
                'release_announcements_status_check',
                sql`${table.status} in ('queued', 'sending', 'sent', 'skipped', 'failed')`
            ),
            index('release_announcements_user_id_index').on(table.userId)
        ];
    }
);
