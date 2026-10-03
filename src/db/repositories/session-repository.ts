import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import type { AppDb } from '../client';
import { sessions, type userLanguages } from '../schema';
import { chunk, DELETE_CHUNK_SIZE } from './chunk';
import { createTryDb } from './try-db';

export type SessionRecord = typeof sessions.$inferSelect;
export type SessionLanguage = (typeof userLanguages)[number];

const tryDb = createTryDb('Session repository');

export type PendingContactAuthType = 'phone' | 'both';

export type WishReferenceScope = readonly number[] | 'all';

export interface ClearedWishReferences {
    pendingInput: boolean;
    album: boolean;
}

const hasValidState = sql`json_valid(${sessions.state})`;

const extractFromValidState = (path: string) => {
    return sql`case when ${hasValidState} then json_extract(${sessions.state}, ${path}) end`;
};

const pendingInputKind = extractFromValidState('$.pendingInput.kind');

const pendingInputWishId = extractFromValidState('$.pendingInput.wishId');

const pendingInputVia = extractFromValidState('$.pendingInput.via');

const albumWishId = extractFromValidState('$.album.wishId');

const clearPendingInputState = sql`json_set(${sessions.state}, '$.pendingInput', json('null'))`;

const serializeState = (state: string | object) => {
    return typeof state === 'string' ? state : JSON.stringify(state);
};

export const createSessionRepository = (db: AppDb) => {
    return {
        get(telegramUserId: number) {
            return tryDb(async () => {
                const [session] = await db
                    .select()
                    .from(sessions)
                    .where(eq(sessions.telegramUserId, telegramUserId))
                    .limit(1);

                return session ?? null;
            });
        },
        saveState(telegramUserId: number, state: string | object, now: Date) {
            return tryDb(async () => {
                const serialized = serializeState(state);

                await db
                    .insert(sessions)
                    .values({
                        telegramUserId,
                        state: serialized,
                        updatedAt: now
                    })
                    .onConflictDoUpdate({
                        target: sessions.telegramUserId,
                        set: { state: serialized, updatedAt: now }
                    });
            });
        },
        setLanguage(
            telegramUserId: number,
            language: SessionLanguage | null,
            now: Date
        ) {
            return tryDb(async () => {
                await db
                    .insert(sessions)
                    .values({ telegramUserId, language, updatedAt: now })
                    .onConflictDoUpdate({
                        target: sessions.telegramUserId,
                        set: { language, updatedAt: now }
                    });
            });
        },
        markMediaGroup(
            telegramUserId: number,
            mediaGroupId: string,
            marker: number,
            now: Date
        ) {
            return tryDb(async () => {
                await db
                    .insert(sessions)
                    .values({
                        telegramUserId,
                        mediaGroupId,
                        mediaGroupMarker: marker,
                        updatedAt: now
                    })
                    .onConflictDoUpdate({
                        target: sessions.telegramUserId,
                        set: {
                            mediaGroupId,
                            mediaGroupMarker: marker,
                            updatedAt: now
                        },
                        setWhere: sql`${sessions.mediaGroupMarker} is null or ${sessions.mediaGroupId} is not ${mediaGroupId} or ${sessions.mediaGroupMarker} < ${marker}`
                    });
            });
        },
        readMediaGroupMarker(telegramUserId: number) {
            return tryDb(async () => {
                const [session] = await db
                    .select({ marker: sessions.mediaGroupMarker })
                    .from(sessions)
                    .where(eq(sessions.telegramUserId, telegramUserId))
                    .limit(1);

                return session?.marker ?? null;
            });
        },
        clearMediaGroup(telegramUserId: number, marker: number) {
            return tryDb(async () => {
                const cleared = await db
                    .update(sessions)
                    .set({ mediaGroupId: null, mediaGroupMarker: null })
                    .where(
                        and(
                            eq(sessions.telegramUserId, telegramUserId),
                            eq(sessions.mediaGroupMarker, marker)
                        )
                    )
                    .returning({ telegramUserId: sessions.telegramUserId });

                return cleared.length > 0;
            });
        },
        clearWishReferences(telegramUserId: number, scope: WishReferenceScope) {
            return tryDb(async (): Promise<ClearedWishReferences> => {
                const scopes =
                    scope === 'all'
                        ? ['all' as const]
                        : chunk(scope, DELETE_CHUNK_SIZE);
                const cleared: ClearedWishReferences = {
                    pendingInput: false,
                    album: false
                };

                for (const wishIds of scopes) {
                    const ownSession = eq(
                        sessions.telegramUserId,
                        telegramUserId
                    );
                    const [pendingRows, albumRows] = await db.batch([
                        db
                            .update(sessions)
                            .set({ state: clearPendingInputState })
                            .where(
                                and(
                                    ownSession,
                                    sql`${pendingInputKind} = 'wishField'`,
                                    wishIds === 'all'
                                        ? undefined
                                        : inArray(pendingInputWishId, wishIds)
                                )
                            )
                            .returning({ id: sessions.telegramUserId }),
                        db
                            .update(sessions)
                            .set({
                                state: sql`json_remove(${sessions.state}, '$.album')`
                            })
                            .where(
                                and(
                                    ownSession,
                                    sql`${albumWishId} is not null`,
                                    wishIds === 'all'
                                        ? undefined
                                        : inArray(albumWishId, wishIds)
                                )
                            )
                            .returning({ id: sessions.telegramUserId })
                    ]);

                    cleared.pendingInput ||= pendingRows.length > 0;
                    cleared.album ||= albumRows.length > 0;
                }

                return cleared;
            });
        },
        setPendingContact(
            telegramUserId: number,
            authType: PendingContactAuthType,
            now: Date
        ) {
            return tryDb(async () => {
                const pendingInput = {
                    kind: 'contact',
                    authType,
                    via: 'app',
                    createdAt: now.getTime()
                };
                const pendingInputJson = JSON.stringify(pendingInput);
                const freshState = JSON.stringify({
                    v: 1,
                    pendingInput,
                    find: null
                });

                await db
                    .insert(sessions)
                    .values({
                        telegramUserId,
                        state: freshState,
                        updatedAt: now
                    })
                    .onConflictDoUpdate({
                        target: sessions.telegramUserId,
                        set: {
                            state: sql`case when ${hasValidState} then json_set(${sessions.state}, '$.pendingInput', json(${pendingInputJson})) else ${freshState} end`,
                            updatedAt: now
                        }
                    });
            });
        },
        clearPendingContact(telegramUserId: number, now: Date) {
            return tryDb(async () => {
                const cleared = await db
                    .update(sessions)
                    .set({
                        state: clearPendingInputState,
                        updatedAt: now
                    })
                    .where(
                        and(
                            eq(sessions.telegramUserId, telegramUserId),
                            sql`${pendingInputKind} = 'contact'`,
                            sql`${pendingInputVia} = 'app'`
                        )
                    )
                    .returning({ id: sessions.telegramUserId });

                return cleared.length > 0;
            });
        },
        pruneUpdatedBefore(updatedBefore: Date) {
            return tryDb(async () => {
                const pruned = await db
                    .delete(sessions)
                    .where(lt(sessions.updatedAt, updatedBefore))
                    .returning({ telegramUserId: sessions.telegramUserId });

                return pruned.length;
            });
        }
    };
};
