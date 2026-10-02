import { and, eq, isNull, sql } from 'drizzle-orm';

import type { AppDb } from '../client';
import { users, wishes, wishlistShares } from '../schema';
import { generateSharePublicId } from '../schemas/wishlist-shares';
import { createTryDb } from './try-db';
import type { UserLanguage } from './user-repository';

export type ShareRecord = typeof wishlistShares.$inferSelect;

export interface PublicShareFingerprint {
    publicId: string;
    displayName: string | null;
    revokedAt: Date | null;
    shareUpdatedAt: Date;
    userId: number;
    username: string | null;
    usernameSearchable: boolean;
    payments: string | null;
    currency: string;
    language: UserLanguage | null;
    telegramLanguageCode: string | null;
    visibleCount: number;
    lastUpdatedAt: Date | null;
}

export const SHARE_DISPLAY_NAME_MAX_LENGTH = 64;

const tryDb = createTryDb('Share repository');

const toStoredDisplayName = (displayName: string | null) => {
    const trimmed = displayName?.trim() ?? '';

    if (trimmed.length === 0) {
        return null;
    }

    return Array.from(trimmed)
        .slice(0, SHARE_DISPLAY_NAME_MAX_LENGTH)
        .join('')
        .trim();
};

const toDateOrNull = (milliseconds: number | null) => {
    return milliseconds === null ? null : new Date(milliseconds);
};

const visibleWishesOfOwner = sql`${wishes.userId} = ${users.id} and ${wishes.removed} = 0 and ${wishes.hidden} = 0`;

export const createShareRepository = (db: AppDb) => {
    const findByUserId = async (userId: number) => {
        const [share] = await db
            .select()
            .from(wishlistShares)
            .where(eq(wishlistShares.userId, userId))
            .limit(1);

        return share ?? null;
    };

    return {
        findActiveByUserId(userId: number) {
            return tryDb(async () => {
                const [share] = await db
                    .select()
                    .from(wishlistShares)
                    .where(
                        and(
                            eq(wishlistShares.userId, userId),
                            isNull(wishlistShares.revokedAt)
                        )
                    )
                    .limit(1);

                return share ?? null;
            });
        },
        publish(userId: number, displayName: string | null, now: Date) {
            return tryDb(async (): Promise<ShareRecord> => {
                const storedDisplayName = toStoredDisplayName(displayName);
                const [published] = await db
                    .insert(wishlistShares)
                    .values({
                        userId,
                        displayName: storedDisplayName,
                        createdAt: now,
                        updatedAt: now
                    })
                    .onConflictDoUpdate({
                        target: wishlistShares.userId,
                        set: {
                            revokedAt: null,
                            displayName: storedDisplayName,
                            updatedAt: now
                        },
                        setWhere: sql`${wishlistShares.revokedAt} is not null or ${wishlistShares.displayName} is not ${storedDisplayName}`
                    })
                    .returning();

                if (published) {
                    return published;
                }

                const existing = await findByUserId(userId);

                if (!existing) {
                    throw new Error('Published share row is missing');
                }

                return existing;
            });
        },
        revoke(userId: number, now: Date) {
            return tryDb(async () => {
                const revoked = await db
                    .update(wishlistShares)
                    .set({ revokedAt: now, displayName: null, updatedAt: now })
                    .where(
                        and(
                            eq(wishlistShares.userId, userId),
                            isNull(wishlistShares.revokedAt)
                        )
                    )
                    .returning({ userId: wishlistShares.userId });

                return revoked.length > 0;
            });
        },
        rotate(userId: number, now: Date) {
            return tryDb(async () => {
                const [rotated] = await db
                    .update(wishlistShares)
                    .set({ publicId: generateSharePublicId(), updatedAt: now })
                    .where(
                        and(
                            eq(wishlistShares.userId, userId),
                            isNull(wishlistShares.revokedAt)
                        )
                    )
                    .returning();

                return rotated ?? null;
            });
        },
        findPublicFingerprint(publicId: string) {
            return tryDb(async (): Promise<PublicShareFingerprint | null> => {
                const [row] = await db
                    .select({
                        publicId: wishlistShares.publicId,
                        displayName: wishlistShares.displayName,
                        revokedAt: wishlistShares.revokedAt,
                        shareUpdatedAt: wishlistShares.updatedAt,
                        userId: users.id,
                        username: users.username,
                        usernameSearchable: users.usernameSearchable,
                        payments: users.payments,
                        currency: users.currency,
                        language: users.language,
                        telegramLanguageCode: users.telegramLanguageCode,
                        visibleCount: sql<number>`(select count(*) from ${wishes} where ${visibleWishesOfOwner})`,
                        lastUpdatedAt: sql<
                            number | null
                        >`(select max(${wishes.updatedAt}) from ${wishes} where ${visibleWishesOfOwner})`
                    })
                    .from(wishlistShares)
                    .innerJoin(users, eq(users.id, wishlistShares.userId))
                    .where(
                        and(
                            eq(wishlistShares.publicId, publicId),
                            isNull(users.blockedAt)
                        )
                    )
                    .limit(1);

                if (!row) {
                    return null;
                }

                return {
                    ...row,
                    visibleCount: Number(row.visibleCount),
                    lastUpdatedAt: toDateOrNull(row.lastUpdatedAt)
                };
            });
        }
    };
};
