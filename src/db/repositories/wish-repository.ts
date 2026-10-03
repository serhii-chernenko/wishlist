import {
    and,
    count,
    desc,
    eq,
    exists,
    gte,
    inArray,
    isNotNull,
    isNull,
    lte,
    or,
    sql,
    type SQL
} from 'drizzle-orm';

import type { AppDb } from '../client';
import {
    gives,
    maximumWishImages,
    users,
    wishes,
    wishlistShares
} from '../schema';
import { createTryDb } from './try-db';

export type WishRecord = typeof wishes.$inferSelect;
export type WishFieldsPatch = Partial<
    Pick<WishRecord, 'title' | 'description' | 'link' | 'price'>
>;

export interface NewWishFields {
    title: string;
    description?: string | null;
    link?: string | null;
    price?: number;
    priority?: boolean;
    hidden?: boolean;
}

export interface WishFlags {
    priority?: boolean;
    hidden?: boolean;
}

export interface WishListOptions {
    filter: number | null;
    offset: number;
    limit: number;
}

export interface WishPage {
    items: WishRecord[];
    total: number;
}

interface PriceRange {
    from: number | null;
    to: number | null;
}

export const priceFilterRanges: readonly PriceRange[] = [
    { from: null, to: 999 },
    { from: 1000, to: 1999 },
    { from: 2000, to: 4999 },
    { from: 5000, to: 9999 },
    { from: 10000, to: null }
];

export const SHAREABLE_WISHES_LIMIT = 100;

const tryDb = createTryDb('Wish repository');

const findableOwner = () => {
    return and(
        isNull(users.blockedAt),
        or(eq(users.usernameSearchable, true), isNotNull(users.phone))
    );
};

const buildPriceCondition = (filter: number | null) => {
    const range = filter === null ? undefined : priceFilterRanges[filter];

    if (!range) {
        return undefined;
    }

    const conditions: SQL[] = [];

    if (range.from !== null) {
        conditions.push(gte(wishes.price, range.from));
    }

    if (range.to !== null) {
        conditions.push(lte(wishes.price, range.to));
    }

    return and(...conditions);
};

const listOrder = [
    desc(wishes.priority),
    desc(wishes.updatedAt),
    desc(wishes.id)
] as const;

const ownedAndActive = (wishId: number, userId: number) => {
    return and(
        eq(wishes.id, wishId),
        eq(wishes.userId, userId),
        eq(wishes.removed, false)
    );
};

const imageSlotPath = (index: number) => {
    return `$[${index}]`;
};

const isImageIndex = (index: number) => {
    return Number.isSafeInteger(index) && index >= 0;
};

export const createWishRepository = (db: AppDb) => {
    return {
        create(userId: number, title: string, now: Date) {
            return tryDb(async () => {
                const [created] = await db
                    .insert(wishes)
                    .values({
                        userId,
                        title,
                        createdAt: now,
                        updatedAt: now
                    })
                    .returning();

                return created ?? null;
            });
        },
        createWithFields(userId: number, fields: NewWishFields, now: Date) {
            return tryDb(async () => {
                const [created] = await db
                    .insert(wishes)
                    .values({
                        userId,
                        title: fields.title,
                        description: fields.description ?? null,
                        link: fields.link ?? null,
                        ...(fields.price === undefined
                            ? {}
                            : { price: fields.price }),
                        ...(fields.priority === undefined
                            ? {}
                            : { priority: fields.priority }),
                        ...(fields.hidden === undefined
                            ? {}
                            : { hidden: fields.hidden }),
                        createdAt: now,
                        updatedAt: now
                    })
                    .returning();

                return created ?? null;
            });
        },
        findOwned(wishId: number, userId: number) {
            return tryDb(async () => {
                const [wish] = await db
                    .select()
                    .from(wishes)
                    .where(ownedAndActive(wishId, userId))
                    .limit(1);

                return wish ?? null;
            });
        },
        findVisible(wishId: number) {
            return tryDb(async () => {
                const [row] = await db
                    .select({ wish: wishes })
                    .from(wishes)
                    .innerJoin(users, eq(users.id, wishes.userId))
                    .where(
                        and(
                            eq(wishes.id, wishId),
                            eq(wishes.hidden, false),
                            eq(wishes.removed, false),
                            findableOwner()
                        )
                    )
                    .limit(1);

                return row?.wish ?? null;
            });
        },
        listOwned(userId: number, options: WishListOptions) {
            return tryDb(async (): Promise<WishPage> => {
                const condition = and(
                    eq(wishes.userId, userId),
                    eq(wishes.removed, false),
                    buildPriceCondition(options.filter)
                );
                const [items, totals] = await db.batch([
                    db
                        .select()
                        .from(wishes)
                        .where(condition)
                        .orderBy(...listOrder)
                        .limit(options.limit)
                        .offset(options.offset),
                    db.select({ total: count() }).from(wishes).where(condition)
                ]);

                return { items, total: totals[0]?.total ?? 0 };
            });
        },
        listVisibleOf(ownerId: number, options: WishListOptions) {
            return tryDb(async (): Promise<WishPage> => {
                const condition = and(
                    eq(wishes.userId, ownerId),
                    eq(wishes.hidden, false),
                    eq(wishes.removed, false),
                    isNull(users.blockedAt),
                    buildPriceCondition(options.filter)
                );
                const [rows, totals] = await db.batch([
                    db
                        .select({ wish: wishes })
                        .from(wishes)
                        .innerJoin(users, eq(users.id, wishes.userId))
                        .where(condition)
                        .orderBy(...listOrder)
                        .limit(options.limit)
                        .offset(options.offset),
                    db
                        .select({ total: count() })
                        .from(wishes)
                        .innerJoin(users, eq(users.id, wishes.userId))
                        .where(condition)
                ]);

                return {
                    items: rows.map(row => {
                        return row.wish;
                    }),
                    total: totals[0]?.total ?? 0
                };
            });
        },
        hasShareable(userId: number) {
            return tryDb(async () => {
                const [wish] = await db
                    .select({ id: wishes.id })
                    .from(wishes)
                    .where(
                        and(
                            eq(wishes.userId, userId),
                            eq(wishes.hidden, false),
                            eq(wishes.removed, false)
                        )
                    )
                    .limit(1);

                return wish !== undefined;
            });
        },
        listShareable(userId: number) {
            return tryDb(() => {
                return db
                    .select()
                    .from(wishes)
                    .where(
                        and(
                            eq(wishes.userId, userId),
                            eq(wishes.hidden, false),
                            eq(wishes.removed, false)
                        )
                    )
                    .orderBy(...listOrder)
                    .limit(SHAREABLE_WISHES_LIMIT);
            });
        },
        updateFields(
            wishId: number,
            userId: number,
            patch: WishFieldsPatch,
            now: Date
        ) {
            return tryDb(async () => {
                const updated = await db
                    .update(wishes)
                    .set({ ...patch, updatedAt: now })
                    .where(ownedAndActive(wishId, userId))
                    .returning({ id: wishes.id });

                return updated.length > 0;
            });
        },
        togglePriority(wishId: number, userId: number, now: Date) {
            return tryDb(async () => {
                const updated = await db
                    .update(wishes)
                    .set({
                        priority: sql`1 - ${wishes.priority}`,
                        updatedAt: now
                    })
                    .where(ownedAndActive(wishId, userId))
                    .returning({ id: wishes.id });

                return updated.length > 0;
            });
        },
        toggleHidden(wishId: number, userId: number, now: Date) {
            return tryDb(async () => {
                const updated = await db
                    .update(wishes)
                    .set({ hidden: sql`1 - ${wishes.hidden}`, updatedAt: now })
                    .where(ownedAndActive(wishId, userId))
                    .returning({ id: wishes.id });

                return updated.length > 0;
            });
        },
        setFlags(wishId: number, userId: number, flags: WishFlags, now: Date) {
            return tryDb(async () => {
                const changes: WishFlags = {
                    ...(flags.priority === undefined
                        ? {}
                        : { priority: flags.priority }),
                    ...(flags.hidden === undefined
                        ? {}
                        : { hidden: flags.hidden })
                };

                if (Object.keys(changes).length === 0) {
                    const [current] = await db
                        .select()
                        .from(wishes)
                        .where(ownedAndActive(wishId, userId))
                        .limit(1);

                    return current ?? null;
                }

                const [updated] = await db
                    .update(wishes)
                    .set({ ...changes, updatedAt: now })
                    .where(ownedAndActive(wishId, userId))
                    .returning();

                return updated ?? null;
            });
        },
        removeImageAt(
            wishId: number,
            userId: number,
            index: number,
            expectedJson: string,
            now: Date
        ) {
            return tryDb(async () => {
                if (!isImageIndex(index)) {
                    return null;
                }

                const [updated] = await db
                    .update(wishes)
                    .set({
                        images: sql`json_remove(${wishes.images}, ${imageSlotPath(index)})`,
                        updatedAt: now
                    })
                    .where(
                        and(
                            ownedAndActive(wishId, userId),
                            eq(wishes.images, expectedJson),
                            sql`json_array_length(${wishes.images}) > ${index}`
                        )
                    )
                    .returning();

                return updated ?? null;
            });
        },
        findImageFileId(wishId: number, index: number) {
            return tryDb(async () => {
                if (!isImageIndex(index)) {
                    return null;
                }

                const [row] = await db
                    .select({
                        fileId: sql<
                            string | null
                        >`json_extract(${wishes.images}, ${imageSlotPath(index)})`
                    })
                    .from(wishes)
                    .where(
                        and(eq(wishes.id, wishId), eq(wishes.removed, false))
                    )
                    .limit(1);

                return typeof row?.fileId === 'string' && row.fileId !== ''
                    ? row.fileId
                    : null;
            });
        },
        findSharedWishImages(publicId: string, wishId: number) {
            return tryDb(async () => {
                const [row] = await db
                    .select({ images: wishes.images })
                    .from(wishlistShares)
                    .innerJoin(users, eq(users.id, wishlistShares.userId))
                    .innerJoin(wishes, eq(wishes.userId, wishlistShares.userId))
                    .where(
                        and(
                            eq(wishlistShares.publicId, publicId),
                            isNull(wishlistShares.revokedAt),
                            isNull(users.blockedAt),
                            eq(wishes.id, wishId),
                            eq(wishes.hidden, false),
                            eq(wishes.removed, false)
                        )
                    )
                    .limit(1);

                return row?.images ?? null;
            });
        },
        appendImage(wishId: number, userId: number, fileId: string, now: Date) {
            return tryDb(async () => {
                const [appended] = await db
                    .update(wishes)
                    .set({
                        images: sql`json_insert(${wishes.images}, '$[#]', ${fileId})`,
                        updatedAt: now
                    })
                    .where(
                        and(
                            ownedAndActive(wishId, userId),
                            sql`json_array_length(${wishes.images}) < ${maximumWishImages}`,
                            sql`not exists (select 1 from json_each(${wishes.images}) where value = ${fileId})`
                        )
                    )
                    .returning({
                        count: sql<number>`json_array_length(${wishes.images})`
                    });

                if (appended) {
                    return { appended: true, count: appended.count };
                }

                const [current] = await db
                    .select({
                        count: sql<number>`json_array_length(${wishes.images})`
                    })
                    .from(wishes)
                    .where(
                        and(eq(wishes.id, wishId), eq(wishes.userId, userId))
                    )
                    .limit(1);

                return { appended: false, count: current?.count ?? 0 };
            });
        },
        clearImages(wishId: number, userId: number, now: Date) {
            return tryDb(async () => {
                const updated = await db
                    .update(wishes)
                    .set({ images: '[]', updatedAt: now })
                    .where(ownedAndActive(wishId, userId))
                    .returning({ id: wishes.id });

                return updated.length > 0;
            });
        },
        softRemove(wishId: number, userId: number, done: boolean, now: Date) {
            return tryDb(async () => {
                const [, removedRows] = await db.batch([
                    db.delete(gives).where(
                        and(
                            eq(gives.wishId, wishId),
                            exists(
                                db
                                    .select({ one: sql`1` })
                                    .from(wishes)
                                    .where(ownedAndActive(wishId, userId))
                            )
                        )
                    ),
                    db
                        .update(wishes)
                        .set({ removed: true, done, updatedAt: now })
                        .where(ownedAndActive(wishId, userId))
                        .returning({ id: wishes.id })
                ]);

                return removedRows.length > 0;
            });
        },
        softRemoveAll(userId: number, now: Date) {
            return tryDb(async () => {
                const activeOwnWishes = and(
                    eq(wishes.userId, userId),
                    eq(wishes.removed, false)
                );
                const [, removedRows] = await db.batch([
                    db
                        .delete(gives)
                        .where(
                            inArray(
                                gives.wishId,
                                db
                                    .select({ id: wishes.id })
                                    .from(wishes)
                                    .where(activeOwnWishes)
                            )
                        ),
                    db
                        .update(wishes)
                        .set({ removed: true, done: false, updatedAt: now })
                        .where(activeOwnWishes)
                        .returning({ id: wishes.id })
                ]);

                return removedRows.length;
            });
        }
    };
};
