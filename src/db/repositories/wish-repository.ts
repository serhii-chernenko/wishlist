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
    lt,
    or,
    sql,
    type SQL
} from 'drizzle-orm';

import {
    WISH_PRIORITY_LEVELS,
    type WishPriorityLevel
} from '../../shared/app-api';
import {
    CURRENCIES,
    type Currency,
    type PriceBounds,
    type PriceBoundsByCurrency
} from '../../shared/money';
import type { AppDb } from '../client';
import {
    gives,
    maximumWishImages,
    users,
    wishes,
    wishlistShares
} from '../schema';
import { chunk, DELETE_CHUNK_SIZE } from './chunk';
import { createTryDb } from './try-db';

export type WishRecord = typeof wishes.$inferSelect;
export type WishFieldsPatch = Partial<
    Pick<WishRecord, 'title' | 'description' | 'link' | 'price'>
> & { currency?: Currency };

export interface NewWishFields {
    title: string;
    description?: string | null;
    link?: string | null;
    price?: number;
    currency: Currency;
    priorityLevel?: WishPriorityLevel;
    hidden?: boolean;
}

export interface WishFlags {
    priorityLevel?: WishPriorityLevel;
    hidden?: boolean;
}

export interface WishListOptions {
    filter: PriceBoundsByCurrency | null;
    offset: number;
    limit: number;
}

export interface WishPage {
    items: WishRecord[];
    total: number;
}

export const SHAREABLE_WISHES_LIMIT = 100;

const tryDb = createTryDb('Wish repository');

const findableOwner = () => {
    return and(
        isNull(users.blockedAt),
        or(eq(users.usernameSearchable, true), isNotNull(users.phone))
    );
};

const buildCurrencyPriceCondition = (
    currency: Currency,
    bounds: PriceBounds
) => {
    const conditions: SQL[] = [eq(wishes.currency, currency)];

    if (bounds.min !== null) {
        conditions.push(gte(wishes.price, bounds.min));
    }

    if (bounds.maxExclusive !== null) {
        conditions.push(lt(wishes.price, bounds.maxExclusive));
    }

    return and(...conditions);
};

export const buildPriceFilterCondition = (
    bounds: PriceBoundsByCurrency | null
) => {
    if (bounds === null) {
        return undefined;
    }

    return or(
        ...CURRENCIES.map(currency => {
            return buildCurrencyPriceCondition(currency, bounds[currency]);
        })
    );
};

const toPriorityColumns = (priorityLevel: WishPriorityLevel) => {
    return {
        priorityLevel,
        priority: priorityLevel === WISH_PRIORITY_LEVELS.high
    };
};

export const WISH_LIST_ORDER = [
    desc(wishes.priorityLevel),
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
        create(userId: number, title: string, currency: Currency, now: Date) {
            return tryDb(async () => {
                const [created] = await db
                    .insert(wishes)
                    .values({
                        userId,
                        title,
                        currency,
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
                        currency: fields.currency,
                        ...(fields.priorityLevel === undefined
                            ? {}
                            : toPriorityColumns(fields.priorityLevel)),
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
        countActive(userId: number) {
            return tryDb(async () => {
                const [row] = await db
                    .select({ total: count() })
                    .from(wishes)
                    .where(
                        and(
                            eq(wishes.userId, userId),
                            eq(wishes.removed, false)
                        )
                    );

                return row?.total ?? 0;
            });
        },
        listActiveImagesJson(userId: number) {
            return tryDb(async () => {
                const rows = await db
                    .select({ images: wishes.images })
                    .from(wishes)
                    .where(
                        and(
                            eq(wishes.userId, userId),
                            eq(wishes.removed, false)
                        )
                    );

                return rows.map(row => {
                    return row.images;
                });
            });
        },
        listReferencedFileIds(fileIds: readonly string[]) {
            return tryDb(async () => {
                const referenced = new Set<string>();

                for (const fileIdChunk of chunk(fileIds, DELETE_CHUNK_SIZE)) {
                    const placeholders = sql.join(
                        fileIdChunk.map(fileId => {
                            return sql`${fileId}`;
                        }),
                        sql`, `
                    );
                    const rows = await db.all<{ fileId: string }>(
                        sql`select distinct json_each.value as fileId from ${wishes}, json_each(${wishes.images}) where ${wishes.removed} = 0 and json_each.value in (${placeholders})`
                    );

                    for (const row of rows) {
                        referenced.add(row.fileId);
                    }
                }

                return referenced;
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
                    buildPriceFilterCondition(options.filter)
                );
                const [items, totals] = await db.batch([
                    db
                        .select()
                        .from(wishes)
                        .where(condition)
                        .orderBy(...WISH_LIST_ORDER)
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
                    buildPriceFilterCondition(options.filter)
                );
                const [rows, totals] = await db.batch([
                    db
                        .select({ wish: wishes })
                        .from(wishes)
                        .innerJoin(users, eq(users.id, wishes.userId))
                        .where(condition)
                        .orderBy(...WISH_LIST_ORDER)
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
                    .orderBy(...WISH_LIST_ORDER)
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
        setPriorityLevel(
            wishId: number,
            userId: number,
            priorityLevel: WishPriorityLevel,
            now: Date
        ) {
            return tryDb(async () => {
                const updated = await db
                    .update(wishes)
                    .set({
                        ...toPriorityColumns(priorityLevel),
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
                const changes = {
                    ...(flags.priorityLevel === undefined
                        ? {}
                        : toPriorityColumns(flags.priorityLevel)),
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
        replaceImages(
            wishId: number,
            userId: number,
            expectedJson: string,
            nextJson: string,
            now: Date
        ) {
            return tryDb(async () => {
                const [updated] = await db
                    .update(wishes)
                    .set({ images: nextJson, updatedAt: now })
                    .where(
                        and(
                            ownedAndActive(wishId, userId),
                            eq(wishes.images, expectedJson)
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
