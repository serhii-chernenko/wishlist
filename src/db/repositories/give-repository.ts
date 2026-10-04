import {
    and,
    asc,
    count,
    eq,
    inArray,
    isNotNull,
    isNull,
    or
} from 'drizzle-orm';

import type { AppDb } from '../client';
import { gives, users, wishes } from '../schema';
import { chunk } from './chunk';
import { createTryDb } from './try-db';
import type { UserRecord } from './user-repository';
import type { WishRecord } from './wish-repository';

export type GiveRecord = typeof gives.$inferSelect;

export const GIVERS_LOOKUP_CHUNK_SIZE = 90;

export interface GiveListEntry {
    give: GiveRecord;
    wish: WishRecord;
    owner: UserRecord | null;
}

export interface GiveListPage {
    items: GiveListEntry[];
    total: number;
}

const tryDb = createTryDb('Give repository');

export const createGiveRepository = (db: AppDb) => {
    return {
        add(userId: number, wishId: number, now: Date) {
            return tryDb(async (): Promise<'added' | 'exists'> => {
                const inserted = await db
                    .insert(gives)
                    .values({ userId, wishId, createdAt: now })
                    .onConflictDoNothing({
                        target: [gives.userId, gives.wishId]
                    })
                    .returning({ id: gives.id });

                return inserted.length > 0 ? 'added' : 'exists';
            });
        },
        remove(userId: number, wishId: number) {
            return tryDb(async () => {
                const removed = await db
                    .delete(gives)
                    .where(
                        and(eq(gives.userId, userId), eq(gives.wishId, wishId))
                    )
                    .returning({ id: gives.id });

                return removed.length > 0;
            });
        },
        removeAll(userId: number) {
            return tryDb(async () => {
                const removed = await db
                    .delete(gives)
                    .where(eq(gives.userId, userId))
                    .returning({ id: gives.id });

                return removed.length;
            });
        },
        listForGiver(
            userId: number,
            options: { offset: number; limit: number }
        ) {
            return tryDb(async (): Promise<GiveListPage> => {
                const condition = and(
                    eq(gives.userId, userId),
                    eq(wishes.removed, false),
                    eq(wishes.hidden, false),
                    or(
                        isNull(users.id),
                        and(
                            isNull(users.blockedAt),
                            or(
                                eq(users.usernameSearchable, true),
                                isNotNull(users.phone)
                            )
                        )
                    )
                );
                const [rows, totals] = await Promise.all([
                    db
                        .select({
                            give: gives,
                            wish: wishes,
                            owner: users
                        })
                        .from(gives)
                        .innerJoin(wishes, eq(wishes.id, gives.wishId))
                        .leftJoin(users, eq(users.id, wishes.userId))
                        .where(condition)
                        .orderBy(asc(gives.id))
                        .limit(options.limit)
                        .offset(options.offset),
                    db
                        .select({ total: count() })
                        .from(gives)
                        .innerJoin(wishes, eq(wishes.id, gives.wishId))
                        .leftJoin(users, eq(users.id, wishes.userId))
                        .where(condition)
                ]);

                return { items: rows, total: totals[0]?.total ?? 0 };
            });
        },
        giversByWishIds(wishIds: readonly number[]) {
            return tryDb(async () => {
                const giversByWishId = new Map<number, number[]>();

                for (const wishIdChunk of chunk(
                    wishIds,
                    GIVERS_LOOKUP_CHUNK_SIZE
                )) {
                    const rows = await db
                        .select({ wishId: gives.wishId, userId: gives.userId })
                        .from(gives)
                        .where(inArray(gives.wishId, wishIdChunk))
                        .orderBy(asc(gives.id));

                    for (const row of rows) {
                        const givers = giversByWishId.get(row.wishId) ?? [];

                        givers.push(row.userId);
                        giversByWishId.set(row.wishId, givers);
                    }
                }

                return giversByWishId;
            });
        }
    };
};
