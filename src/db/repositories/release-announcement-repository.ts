import { and, eq, inArray, isNull, lt, ne, notExists, sql } from 'drizzle-orm';

import type { AppDb } from '../client';
import { releaseAnnouncements, users } from '../schema';
import { chunk, D1_BOUND_PARAMETER_CEILING, DELETE_CHUNK_SIZE } from './chunk';
import { createTryDb } from './try-db';

export { D1_BOUND_PARAMETER_CEILING };

export const RELEASE_ANNOUNCEMENT_INSERT_COLUMN_COUNT = 6;
export const RELEASE_ANNOUNCEMENT_INSERT_CHUNK_SIZE = Math.floor(
    D1_BOUND_PARAMETER_CEILING / RELEASE_ANNOUNCEMENT_INSERT_COLUMN_COUNT
);

const tryDb = createTryDb('Release announcement repository');

export const createReleaseAnnouncementRepository = (db: AppDb) => {
    return {
        listUsersWithoutAnnouncement(releaseVersion: string) {
            return tryDb(() => {
                return db
                    .select({
                        id: users.id,
                        releaseVersion: users.releaseVersion
                    })
                    .from(users)
                    .where(
                        and(
                            ne(users.releaseVersion, releaseVersion),
                            isNull(users.blockedAt),
                            notExists(
                                db
                                    .select({ one: sql`1` })
                                    .from(releaseAnnouncements)
                                    .where(
                                        and(
                                            eq(
                                                releaseAnnouncements.userId,
                                                users.id
                                            ),
                                            eq(
                                                releaseAnnouncements.releaseVersion,
                                                releaseVersion
                                            )
                                        )
                                    )
                            )
                        )
                    );
            });
        },
        insertQueuedAnnouncements(
            releaseVersion: string,
            userIds: readonly number[],
            now: Date
        ) {
            return tryDb(async () => {
                const insertedUserIds: number[] = [];

                for (const userIdChunk of chunk(
                    userIds,
                    RELEASE_ANNOUNCEMENT_INSERT_CHUNK_SIZE
                )) {
                    const inserted = await db
                        .insert(releaseAnnouncements)
                        .values(
                            userIdChunk.map(userId => {
                                return {
                                    releaseVersion,
                                    userId,
                                    status: 'queued' as const,
                                    attempts: 0,
                                    createdAt: now,
                                    updatedAt: now
                                };
                            })
                        )
                        .onConflictDoNothing({
                            target: [
                                releaseAnnouncements.releaseVersion,
                                releaseAnnouncements.userId
                            ]
                        })
                        .returning({
                            userId: releaseAnnouncements.userId
                        });

                    insertedUserIds.push(
                        ...inserted.map(row => {
                            return row.userId;
                        })
                    );
                }

                return insertedUserIds;
            });
        },
        deleteQueuedAnnouncements(
            releaseVersion: string,
            userIds: readonly number[]
        ) {
            return tryDb(async () => {
                for (const userIdChunk of chunk(userIds, DELETE_CHUNK_SIZE)) {
                    await db
                        .delete(releaseAnnouncements)
                        .where(
                            and(
                                eq(
                                    releaseAnnouncements.releaseVersion,
                                    releaseVersion
                                ),
                                eq(releaseAnnouncements.status, 'queued'),
                                inArray(
                                    releaseAnnouncements.userId,
                                    userIdChunk
                                )
                            )
                        );
                }
            });
        },
        findAnnouncement(releaseVersion: string, userId: number) {
            return tryDb(async () => {
                const [announcement] = await db
                    .select()
                    .from(releaseAnnouncements)
                    .where(
                        and(
                            eq(
                                releaseAnnouncements.releaseVersion,
                                releaseVersion
                            ),
                            eq(releaseAnnouncements.userId, userId)
                        )
                    )
                    .limit(1);

                return announcement ?? null;
            });
        },
        markSent(
            announcementId: number,
            userId: number,
            releaseVersion: string,
            now: Date
        ) {
            return tryDb(() => {
                return db.batch([
                    db
                        .update(releaseAnnouncements)
                        .set({
                            status: 'sent',
                            attempts: sql`${releaseAnnouncements.attempts} + 1`,
                            lastErrorCode: null,
                            updatedAt: now
                        })
                        .where(eq(releaseAnnouncements.id, announcementId)),
                    db
                        .update(users)
                        .set({ releaseVersion })
                        .where(eq(users.id, userId))
                ]);
            });
        },
        claimForSending(announcementId: number, now: Date) {
            return tryDb(async () => {
                const claimed = await db
                    .update(releaseAnnouncements)
                    .set({ status: 'sending', updatedAt: now })
                    .where(
                        and(
                            eq(releaseAnnouncements.id, announcementId),
                            eq(releaseAnnouncements.status, 'queued')
                        )
                    )
                    .returning({ id: releaseAnnouncements.id });

                return claimed.length > 0;
            });
        },
        markSkipped(
            announcementId: number,
            userId: number,
            releaseVersion: string,
            errorCode: number | null,
            now: Date
        ) {
            return tryDb(() => {
                return db.batch([
                    db
                        .update(releaseAnnouncements)
                        .set({
                            status: 'skipped',
                            attempts: sql`${releaseAnnouncements.attempts} + 1`,
                            lastErrorCode: errorCode,
                            updatedAt: now
                        })
                        .where(eq(releaseAnnouncements.id, announcementId)),
                    db
                        .update(users)
                        .set({ releaseVersion })
                        .where(eq(users.id, userId))
                ]);
            });
        },
        markMediaSent(announcementId: number, now: Date) {
            return tryDb(async () => {
                await db
                    .update(releaseAnnouncements)
                    .set({ mediaSentAt: now, updatedAt: now })
                    .where(eq(releaseAnnouncements.id, announcementId));
            });
        },
        releaseToQueue(
            announcementId: number,
            errorCode: number | null,
            countAttempt: boolean,
            now: Date
        ) {
            return tryDb(() => {
                return db
                    .update(releaseAnnouncements)
                    .set({
                        status: 'queued',
                        attempts: countAttempt
                            ? sql`${releaseAnnouncements.attempts} + 1`
                            : releaseAnnouncements.attempts,
                        lastErrorCode: errorCode,
                        updatedAt: now
                    })
                    .where(eq(releaseAnnouncements.id, announcementId));
            });
        },
        markFailed(
            announcementId: number,
            errorCode: number | null,
            now: Date
        ) {
            return tryDb(() => {
                return db
                    .update(releaseAnnouncements)
                    .set({
                        status: 'failed',
                        attempts: sql`${releaseAnnouncements.attempts} + 1`,
                        lastErrorCode: errorCode,
                        updatedAt: now
                    })
                    .where(eq(releaseAnnouncements.id, announcementId));
            });
        },
        requeueStaleQueued(releaseVersion: string, cutoff: Date, now: Date) {
            return tryDb(async () => {
                const requeued = await db
                    .update(releaseAnnouncements)
                    .set({ updatedAt: now })
                    .where(
                        and(
                            eq(
                                releaseAnnouncements.releaseVersion,
                                releaseVersion
                            ),
                            eq(releaseAnnouncements.status, 'queued'),
                            lt(releaseAnnouncements.updatedAt, cutoff)
                        )
                    )
                    .returning({ userId: releaseAnnouncements.userId });

                return requeued.map(row => {
                    return row.userId;
                });
            });
        },
        skipStuckSending(releaseVersion: string, cutoff: Date, now: Date) {
            return tryDb(async () => {
                const stuck = await db
                    .select({ userId: releaseAnnouncements.userId })
                    .from(releaseAnnouncements)
                    .where(
                        and(
                            eq(
                                releaseAnnouncements.releaseVersion,
                                releaseVersion
                            ),
                            eq(releaseAnnouncements.status, 'sending'),
                            lt(releaseAnnouncements.updatedAt, cutoff)
                        )
                    );
                const stuckUserIds = stuck.map(row => {
                    return row.userId;
                });

                for (const userIdChunk of chunk(
                    stuckUserIds,
                    DELETE_CHUNK_SIZE
                )) {
                    await db.batch([
                        db
                            .update(releaseAnnouncements)
                            .set({
                                status: 'skipped',
                                attempts: sql`${releaseAnnouncements.attempts} + 1`,
                                lastErrorCode: null,
                                updatedAt: now
                            })
                            .where(
                                and(
                                    eq(
                                        releaseAnnouncements.releaseVersion,
                                        releaseVersion
                                    ),
                                    eq(releaseAnnouncements.status, 'sending'),
                                    inArray(
                                        releaseAnnouncements.userId,
                                        userIdChunk
                                    )
                                )
                            ),
                        db
                            .update(users)
                            .set({ releaseVersion })
                            .where(inArray(users.id, userIdChunk))
                    ]);
                }

                return stuckUserIds.length;
            });
        }
    };
};
