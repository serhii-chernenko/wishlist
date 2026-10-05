import type { BatchItem } from 'drizzle-orm/batch';
import {
    and,
    eq,
    exists,
    inArray,
    isNotNull,
    isNull,
    lt,
    min,
    notExists,
    or,
    sql
} from 'drizzle-orm';

import type {
    ListImportChannel,
    ListImportFailure,
    ListImportKind,
    ListImportSource,
    ListImportState,
    ListImportVisibility
} from '../../shared/app-api';
import type { AppDb } from '../client';
import { listImports, users, wishes, wishlistShares } from '../schema';
import { createTryDb } from './try-db';
import {
    buildImportedWishInsert,
    chunkImportedWishRows,
    type ImportedWishRow
} from './wish-repository';

export type ListImportRecord = typeof listImports.$inferSelect;

export interface NewListImport {
    userId: number;
    source: ListImportSource;
    kind: ListImportKind;
    channel: ListImportChannel;
    sourceUrl: string;
    visibility: ListImportVisibility;
    found: number;
    planned: number;
    plannedGifted: number;
    duplicates: number;
    overLimit: number;
    withoutPrice: number;
    withoutPhoto: number;
}

export interface CommitStartInput {
    jobId: number;
    userId: number;
    visibility: ListImportVisibility;
    chatMessageId: number | null;
    leaseUntil: Date;
    now: Date;
}

export type CommitStartResult =
    | { outcome: 'started'; job: ListImportRecord }
    | { outcome: 'busy' }
    | { outcome: 'notPreviewed' };

export interface CommitStepInput {
    jobId: number;
    userId: number;
    rows: readonly ImportedWishRow[];
    stepAt: Date;
    leaseUntil: Date;
    now: Date;
}

export interface CommitProgress {
    created: number;
    createdGifted: number;
}

export interface DrainCandidate {
    userId: number;
    telegramId: number;
    blocked: boolean;
    leaseJobId: number;
}

export const TERMINAL_LIST_IMPORT_STATES = [
    'done',
    'failed',
    'expired',
    'cancelled'
] as const satisfies readonly ListImportState[];

export const DRAIN_LEASE_STATES = [
    'done',
    'failed'
] as const satisfies readonly ListImportState[];

const UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed/i;

const tryDb = createTryDb('List import repository');

const isUniqueViolation = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    return (
        UNIQUE_CONSTRAINT_PATTERN.test(error.message) ||
        isUniqueViolation(error.cause)
    );
};

const ownedJob = (jobId: number, userId: number) => {
    return and(eq(listImports.id, jobId), eq(listImports.userId, userId));
};

const isCommitting = (jobId: number) => {
    return and(eq(listImports.id, jobId), eq(listImports.state, 'committing'));
};

const isLeaseFree = (now: Date) => {
    return or(isNull(listImports.leaseUntil), lt(listImports.leaseUntil, now));
};

const countStepRows = (userId: number, stepAt: Date, giftedOnly: boolean) => {
    const giftedCondition = giftedOnly ? sql` and ${wishes.done} = 1` : sql``;

    return sql<number>`(select count(*) from ${wishes} where ${wishes.userId} = ${userId} and ${wishes.sourceRef} is not null and ${wishes.createdAt} = ${stepAt.getTime()}${giftedCondition})`;
};

const terminalFields = (now: Date) => {
    return { sourceUrl: null, updatedAt: now, finishedAt: now };
};

export const createListImportRepository = (db: AppDb) => {
    return {
        findById(jobId: number) {
            return tryDb(async () => {
                const [job] = await db
                    .select()
                    .from(listImports)
                    .where(eq(listImports.id, jobId))
                    .limit(1);

                return job ?? null;
            });
        },
        findOwned(jobId: number, userId: number) {
            return tryDb(async () => {
                const [job] = await db
                    .select()
                    .from(listImports)
                    .where(ownedJob(jobId, userId))
                    .limit(1);

                return job ?? null;
            });
        },
        findCommitting(userId: number) {
            return tryDb(async () => {
                const [job] = await db
                    .select()
                    .from(listImports)
                    .where(
                        and(
                            eq(listImports.userId, userId),
                            eq(listImports.state, 'committing')
                        )
                    )
                    .limit(1);

                return job ?? null;
            });
        },
        createPreviewed(input: NewListImport, now: Date) {
            return tryDb(async () => {
                const [, created] = await db.batch([
                    db
                        .update(listImports)
                        .set({ state: 'expired', ...terminalFields(now) })
                        .where(
                            and(
                                eq(listImports.userId, input.userId),
                                eq(listImports.state, 'previewed')
                            )
                        ),
                    db
                        .insert(listImports)
                        .values({
                            ...input,
                            state: 'previewed',
                            createdAt: now,
                            updatedAt: now
                        })
                        .returning()
                ]);

                return created[0] ?? null;
            });
        },
        setVisibility(
            jobId: number,
            userId: number,
            visibility: ListImportVisibility,
            now: Date
        ) {
            return tryDb(async () => {
                const updated = await db
                    .update(listImports)
                    .set({ visibility, updatedAt: now })
                    .where(
                        and(
                            ownedJob(jobId, userId),
                            eq(listImports.state, 'previewed')
                        )
                    )
                    .returning({ id: listImports.id });

                return updated.length > 0;
            });
        },
        startCommit(input: CommitStartInput) {
            return tryDb(async (): Promise<CommitStartResult> => {
                try {
                    const [job] = await db
                        .update(listImports)
                        .set({
                            state: 'committing',
                            visibility: input.visibility,
                            chatMessageId: input.chatMessageId,
                            leaseUntil: input.leaseUntil,
                            attempts: sql`${listImports.attempts} + 1`,
                            updatedAt: input.now
                        })
                        .where(
                            and(
                                ownedJob(input.jobId, input.userId),
                                eq(listImports.state, 'previewed')
                            )
                        )
                        .returning();

                    return job === undefined
                        ? { outcome: 'notPreviewed' }
                        : { outcome: 'started', job };
                } catch (error) {
                    if (isUniqueViolation(error)) {
                        return { outcome: 'busy' };
                    }

                    throw error;
                }
            });
        },
        expirePreview(jobId: number, now: Date) {
            return tryDb(async () => {
                const updated = await db
                    .update(listImports)
                    .set({ state: 'expired', ...terminalFields(now) })
                    .where(
                        and(
                            eq(listImports.id, jobId),
                            eq(listImports.state, 'previewed')
                        )
                    )
                    .returning({ id: listImports.id });

                return updated.length > 0;
            });
        },
        expireStalePreviews(createdBefore: Date, now: Date, userId?: number) {
            return tryDb(async () => {
                const updated = await db
                    .update(listImports)
                    .set({ state: 'expired', ...terminalFields(now) })
                    .where(
                        and(
                            eq(listImports.state, 'previewed'),
                            lt(listImports.createdAt, createdBefore),
                            userId === undefined
                                ? undefined
                                : eq(listImports.userId, userId)
                        )
                    )
                    .returning({ id: listImports.id });

                return updated.length;
            });
        },
        setPlanned(
            jobId: number,
            planned: number,
            plannedGifted: number,
            now: Date
        ) {
            return tryDb(async () => {
                const [job] = await db
                    .update(listImports)
                    .set({ planned, plannedGifted, updatedAt: now })
                    .where(isCommitting(jobId))
                    .returning();

                return job ?? null;
            });
        },
        cancelPreview(jobId: number, userId: number, now: Date) {
            return tryDb(async () => {
                const updated = await db
                    .update(listImports)
                    .set({ state: 'cancelled', ...terminalFields(now) })
                    .where(
                        and(
                            ownedJob(jobId, userId),
                            eq(listImports.state, 'previewed')
                        )
                    )
                    .returning({ id: listImports.id });

                return updated.length > 0;
            });
        },
        listStaleCommitting(now: Date, userId?: number) {
            return tryDb(() => {
                return db
                    .select()
                    .from(listImports)
                    .where(
                        and(
                            eq(listImports.state, 'committing'),
                            isLeaseFree(now),
                            userId === undefined
                                ? undefined
                                : eq(listImports.userId, userId)
                        )
                    )
                    .orderBy(listImports.id);
            });
        },
        claimStale(jobId: number, now: Date, leaseUntil: Date) {
            return tryDb(async () => {
                const [job] = await db
                    .update(listImports)
                    .set({
                        leaseUntil,
                        attempts: sql`${listImports.attempts} + 1`,
                        updatedAt: now
                    })
                    .where(and(isCommitting(jobId), isLeaseFree(now)))
                    .returning();

                return job ?? null;
            });
        },
        recordCommitStep(input: CommitStepInput) {
            return tryDb(async (): Promise<CommitProgress | null> => {
                const statements: [
                    BatchItem<'sqlite'>,
                    ...BatchItem<'sqlite'>[]
                ] = [
                    db
                        .update(listImports)
                        .set({
                            created: sql`${listImports.created} + ${countStepRows(input.userId, input.stepAt, false)}`,
                            createdGifted: sql`${listImports.createdGifted} + ${countStepRows(input.userId, input.stepAt, true)}`,
                            leaseUntil: input.leaseUntil,
                            updatedAt: input.now
                        })
                        .where(isCommitting(input.jobId))
                        .returning({
                            created: listImports.created,
                            createdGifted: listImports.createdGifted
                        })
                ];

                statements.unshift(
                    ...chunkImportedWishRows(input.rows).map(rowChunk => {
                        return buildImportedWishInsert(db, rowChunk);
                    })
                );

                const results = await db.batch(statements);
                const [progress] = results[results.length - 1] as
                    | CommitProgress[]
                    | [];

                return progress ?? null;
            });
        },
        markDone(jobId: number, now: Date) {
            return tryDb(async () => {
                const [job] = await db
                    .update(listImports)
                    .set({
                        state: 'done',
                        leaseUntil: null,
                        ...terminalFields(now)
                    })
                    .where(isCommitting(jobId))
                    .returning();

                return job ?? null;
            });
        },
        markFailed(jobId: number, failure: ListImportFailure, now: Date) {
            return tryDb(async () => {
                const [job] = await db
                    .update(listImports)
                    .set({
                        state: 'failed',
                        failure,
                        leaseUntil: null,
                        ...terminalFields(now)
                    })
                    .where(isCommitting(jobId))
                    .returning();

                return job ?? null;
            });
        },
        releaseCommitLease(jobId: number, now: Date) {
            return tryDb(async () => {
                const updated = await db
                    .update(listImports)
                    .set({ leaseUntil: now, updatedAt: now })
                    .where(isCommitting(jobId))
                    .returning({ id: listImports.id });

                return updated.length > 0;
            });
        },
        listDrainCandidates(limit: number, userId?: number) {
            return tryDb(async (): Promise<DrainCandidate[]> => {
                const owners = await db
                    .select({
                        userId: users.id,
                        telegramId: users.telegramId,
                        blockedAt: users.blockedAt
                    })
                    .from(users)
                    .where(
                        and(
                            inArray(
                                users.id,
                                db
                                    .selectDistinct({ id: wishes.userId })
                                    .from(wishes)
                                    .where(isNotNull(wishes.sourceImageUrl))
                            ),
                            exists(
                                db
                                    .select({ one: sql`1` })
                                    .from(listImports)
                                    .where(
                                        and(
                                            eq(listImports.userId, users.id),
                                            inArray(
                                                listImports.state,
                                                DRAIN_LEASE_STATES
                                            )
                                        )
                                    )
                            ),
                            userId === undefined
                                ? undefined
                                : eq(users.id, userId)
                        )
                    )
                    .orderBy(users.id)
                    .limit(limit);

                if (owners.length === 0) {
                    return [];
                }

                const leaseRows = await db
                    .select({
                        userId: listImports.userId,
                        leaseJobId: min(listImports.id)
                    })
                    .from(listImports)
                    .where(
                        and(
                            inArray(
                                listImports.userId,
                                owners.map(owner => {
                                    return owner.userId;
                                })
                            ),
                            inArray(listImports.state, DRAIN_LEASE_STATES)
                        )
                    )
                    .groupBy(listImports.userId);
                const leaseJobIds = new Map(
                    leaseRows.map(row => {
                        return [row.userId, row.leaseJobId];
                    })
                );

                return owners.flatMap(owner => {
                    const leaseJobId = leaseJobIds.get(owner.userId);

                    return leaseJobId === undefined || leaseJobId === null
                        ? []
                        : [
                              {
                                  userId: owner.userId,
                                  telegramId: owner.telegramId,
                                  blocked: owner.blockedAt !== null,
                                  leaseJobId
                              }
                          ];
                });
            });
        },
        acquireDrainLease(jobId: number, now: Date, leaseUntil: Date) {
            return tryDb(async () => {
                const updated = await db
                    .update(listImports)
                    .set({ leaseUntil })
                    .where(
                        and(
                            eq(listImports.id, jobId),
                            inArray(listImports.state, DRAIN_LEASE_STATES),
                            isLeaseFree(now)
                        )
                    )
                    .returning({ id: listImports.id });

                return updated.length > 0;
            });
        },
        releaseDrainLease(
            jobId: number,
            leaseUntil: Date,
            heldUntil: Date | null = null
        ) {
            return tryDb(async () => {
                await db
                    .update(listImports)
                    .set({ leaseUntil: heldUntil })
                    .where(
                        and(
                            eq(listImports.id, jobId),
                            eq(listImports.leaseUntil, leaseUntil)
                        )
                    );
            });
        },
        touchShare(userId: number, now: Date) {
            return tryDb(async () => {
                await db
                    .update(wishlistShares)
                    .set({ updatedAt: now })
                    .where(eq(wishlistShares.userId, userId));
            });
        },
        pruneFinishedBefore(cutoff: Date) {
            return tryDb(async () => {
                const deleted = await db
                    .delete(listImports)
                    .where(
                        and(
                            inArray(
                                listImports.state,
                                TERMINAL_LIST_IMPORT_STATES
                            ),
                            lt(listImports.updatedAt, cutoff),
                            notExists(
                                db
                                    .select({ one: sql`1` })
                                    .from(wishes)
                                    .where(
                                        and(
                                            eq(
                                                wishes.userId,
                                                listImports.userId
                                            ),
                                            isNotNull(wishes.sourceImageUrl)
                                        )
                                    )
                            )
                        )
                    )
                    .returning({ id: listImports.id });

                return deleted.length;
            });
        }
    };
};

export type ListImportRepository = ReturnType<
    typeof createListImportRepository
>;
