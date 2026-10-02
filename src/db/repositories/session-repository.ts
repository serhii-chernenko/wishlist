import { and, eq, lt, sql } from 'drizzle-orm';

import type { AppDb } from '../client';
import { sessions, type userLanguages } from '../schema';
import { createTryDb } from './try-db';

export type SessionRecord = typeof sessions.$inferSelect;
export type SessionLanguage = (typeof userLanguages)[number];

const tryDb = createTryDb('Session repository');

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
