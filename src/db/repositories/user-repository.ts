import type { BatchItem } from 'drizzle-orm/batch';
import { and, asc, eq, isNull, ne, notExists, or, sql } from 'drizzle-orm';

import type { AppDb } from '../client';
import { users } from '../schema';
import { createTryDb } from './try-db';

export type UserRecord = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserLanguage = NonNullable<UserRecord['language']>;

export const LAST_SEEN_WRITE_INTERVAL_MILLISECONDS = 60 * 60 * 1000;
export const MINIMUM_PHONE_SEARCH_DIGITS = 10;

export interface VisibilityInput {
    usernameSearchable: boolean;
    phone: string | null;
    phoneDigits: string | null;
    username: string | null;
}

export interface ProfileSyncInput {
    username: string | null;
    telegramLanguageCode: string | null;
    now: Date;
}

export interface SearchableUserQuery {
    username?: string | undefined;
    phoneDigits?: string | undefined;
}

const tryDb = createTryDb('User repository');

const stripNonDigits = (value: string) => value.replace(/\D/g, '');

const releaseHolderStatements = (
    db: AppDb,
    identifiers: { username: string | null; phone: string | null },
    exceptId: number,
    now: Date
) => {
    const statements: BatchItem<'sqlite'>[] = [];

    if (identifiers.username) {
        statements.push(
            db
                .update(users)
                .set({ username: null, updatedAt: now })
                .where(
                    and(
                        sql`lower(${users.username}) = lower(${identifiers.username})`,
                        ne(users.id, exceptId)
                    )
                )
        );
    }

    if (identifiers.phone) {
        statements.push(
            db
                .update(users)
                .set({ phone: null, phoneDigits: null, updatedAt: now })
                .where(
                    and(
                        eq(users.phone, identifiers.phone),
                        ne(users.id, exceptId)
                    )
                )
        );
    }

    return statements;
};

const batchReturningLast = async (
    db: AppDb,
    leadingStatements: BatchItem<'sqlite'>[],
    finalStatement: BatchItem<'sqlite'>
) => {
    const statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
        finalStatement
    ];

    statements.unshift(...leadingStatements);

    const results = await db.batch(statements);

    return results[results.length - 1] as UserRecord[];
};

export const createUserRepository = (db: AppDb) => {
    const findById = async (id: number) => {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);

        return user ?? null;
    };

    return {
        findById(id: number) {
            return tryDb(() => findById(id));
        },
        findByTelegramId(telegramId: number) {
            return tryDb(async () => {
                const [user] = await db
                    .select()
                    .from(users)
                    .where(eq(users.telegramId, telegramId))
                    .limit(1);

                return user ?? null;
            });
        },
        create(input: NewUser) {
            return tryDb(async () => {
                const now = input.createdAt ?? new Date();
                const createdRows = await batchReturningLast(
                    db,
                    releaseHolderStatements(
                        db,
                        {
                            username: input.username ?? null,
                            phone: input.phone ?? null
                        },
                        -1,
                        now
                    ),
                    db
                        .insert(users)
                        .values({
                            ...input,
                            createdAt: now,
                            updatedAt: input.updatedAt ?? now
                        })
                        .returning()
                );

                return createdRows[0] ?? null;
            });
        },
        syncProfile(id: number, input: ProfileSyncInput) {
            return tryDb(async () => {
                const staleBefore =
                    input.now.getTime() - LAST_SEEN_WRITE_INTERVAL_MILLISECONDS;
                const needsSync = or(
                    sql`${users.username} is not ${input.username}`,
                    input.telegramLanguageCode === null
                        ? undefined
                        : sql`${users.telegramLanguageCode} is not ${input.telegramLanguageCode}`,
                    sql`${users.blockedAt} is not null`,
                    sql`${users.lastSeenAt} is null`,
                    sql`${users.lastSeenAt} < ${staleBefore}`
                );
                const syncedRows = await batchReturningLast(
                    db,
                    releaseHolderStatements(
                        db,
                        { username: input.username, phone: null },
                        id,
                        input.now
                    ),
                    db
                        .update(users)
                        .set({
                            username: input.username,
                            telegramLanguageCode: sql`coalesce(${input.telegramLanguageCode}, ${users.telegramLanguageCode})`,
                            blockedAt: null,
                            lastSeenAt: sql`case when ${users.lastSeenAt} is null or ${users.lastSeenAt} < ${staleBefore} then ${input.now.getTime()} else ${users.lastSeenAt} end`,
                            updatedAt: input.now
                        })
                        .where(and(eq(users.id, id), needsSync))
                        .returning()
                );

                return syncedRows[0] ?? null;
            });
        },
        releaseUsernameHolder(
            username: string,
            exceptId: number,
            now: Date = new Date()
        ) {
            return tryDb(async () => {
                const released = await db
                    .update(users)
                    .set({ username: null, updatedAt: now })
                    .where(
                        and(
                            sql`lower(${users.username}) = lower(${username})`,
                            ne(users.id, exceptId)
                        )
                    )
                    .returning({ id: users.id });

                return released.length;
            });
        },
        setVisibility(
            id: number,
            input: VisibilityInput,
            now: Date = new Date()
        ) {
            return tryDb(async () => {
                const updatedRows = await batchReturningLast(
                    db,
                    releaseHolderStatements(
                        db,
                        { username: input.username, phone: input.phone },
                        id,
                        now
                    ),
                    db
                        .update(users)
                        .set({
                            usernameSearchable: input.usernameSearchable,
                            phone: input.phone,
                            phoneDigits: input.phoneDigits,
                            username: input.username,
                            updatedAt: now
                        })
                        .where(eq(users.id, id))
                        .returning()
                );

                return updatedRows[0] ?? null;
            });
        },
        setLanguage(
            id: number,
            language: UserLanguage | null,
            now: Date = new Date()
        ) {
            return tryDb(async () => {
                const updated = await db
                    .update(users)
                    .set({ language, updatedAt: now })
                    .where(eq(users.id, id))
                    .returning({ id: users.id });

                return updated.length > 0;
            });
        },
        setPayments(
            id: number,
            payments: string | null,
            now: Date = new Date()
        ) {
            return tryDb(async () => {
                const updated = await db
                    .update(users)
                    .set({ payments, updatedAt: now })
                    .where(eq(users.id, id))
                    .returning({ id: users.id });

                return updated.length > 0;
            });
        },
        setWishlistFilter(
            id: number,
            wishlistFilter: number | null,
            now: Date = new Date()
        ) {
            return tryDb(async () => {
                const updated = await db
                    .update(users)
                    .set({ wishlistFilter, updatedAt: now })
                    .where(eq(users.id, id))
                    .returning({ id: users.id });

                return updated.length > 0;
            });
        },
        markBlockedByTelegramId(telegramId: number, now: Date) {
            return tryDb(async () => {
                const blocked = await db
                    .update(users)
                    .set({ blockedAt: now })
                    .where(
                        and(
                            eq(users.telegramId, telegramId),
                            isNull(users.blockedAt)
                        )
                    )
                    .returning({ id: users.id });

                return blocked.length > 0;
            });
        },
        clearBlocked(id: number) {
            return tryDb(async () => {
                const cleared = await db
                    .update(users)
                    .set({ blockedAt: null })
                    .where(eq(users.id, id))
                    .returning({ id: users.id });

                return cleared.length > 0;
            });
        },
        findSearchable(query: SearchableUserQuery) {
            return tryDb(async () => {
                const conditions = [];

                if (query.username) {
                    conditions.push(
                        and(
                            eq(users.usernameSearchable, true),
                            sql`lower(${users.username}) = lower(${query.username})`
                        )
                    );
                }

                const phoneDigits = stripNonDigits(query.phoneDigits ?? '');

                if (phoneDigits.length >= MINIMUM_PHONE_SEARCH_DIGITS) {
                    conditions.push(
                        and(
                            sql`${users.phone} is not null`,
                            sql`${users.phoneDigits} like ${`%${phoneDigits}%`}`
                        )
                    );
                }

                if (conditions.length === 0) {
                    return null;
                }

                const [user] = await db
                    .select()
                    .from(users)
                    .where(and(isNull(users.blockedAt), or(...conditions)))
                    .orderBy(asc(users.id))
                    .limit(1);

                return user ?? null;
            });
        },
        listBroadcastCandidates() {
            return tryDb(() => {
                return db
                    .select({
                        id: users.id,
                        telegramId: users.telegramId,
                        releaseVersion: users.releaseVersion,
                        language: users.language,
                        telegramLanguageCode: users.telegramLanguageCode
                    })
                    .from(users)
                    .where(isNull(users.blockedAt))
                    .orderBy(asc(users.id));
            });
        },
        updateReleaseVersion(id: number, releaseVersion: string) {
            return tryDb(async () => {
                const updated = await db
                    .update(users)
                    .set({ releaseVersion })
                    .where(eq(users.id, id))
                    .returning({ id: users.id });

                return updated.length > 0;
            });
        },
        updateTelegramId(id: number, newTelegramId: number) {
            return tryDb(async () => {
                const updated = await db
                    .update(users)
                    .set({ telegramId: newTelegramId })
                    .where(
                        and(
                            eq(users.id, id),
                            notExists(
                                db
                                    .select({ one: sql`1` })
                                    .from(users)
                                    .where(eq(users.telegramId, newTelegramId))
                            )
                        )
                    )
                    .returning({ id: users.id });

                return updated.length > 0;
            });
        }
    };
};
