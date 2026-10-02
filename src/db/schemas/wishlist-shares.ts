import { integer, snakeCase, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { ulid } from 'ulid';

import { users } from './users';

export const generateSharePublicId = () => ulid().toLowerCase();

export const wishlistShares = snakeCase.table(
    'wishlist_shares',
    {
        userId: integer()
            .primaryKey()
            .references(() => users.id, { onDelete: 'cascade' }),
        publicId: text().notNull().$defaultFn(generateSharePublicId),
        displayName: text(),
        revokedAt: integer({ mode: 'timestamp_ms' }),
        createdAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date()),
        updatedAt: integer({ mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date())
    },
    table => {
        return [
            uniqueIndex('wishlist_shares_public_id_unique').on(table.publicId)
        ];
    }
);
