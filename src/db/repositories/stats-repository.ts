import { count, isNull, sql } from 'drizzle-orm';

import type { AppDb } from '../client';
import { gives, users, wishes } from '../schema';
import { createTryDb } from './try-db';

export interface PublicStats {
    users: number;
    wishes: number;
    done: number;
}

export interface StatsSnapshot {
    registeredUsers: number;
    blockedUsers: number;
    activeUsers1d: number;
    activeUsers7d: number;
    activeUsers30d: number;
    totalWishes: number;
    activeWishes: number;
    hiddenWishes: number;
    priorityWishes: number;
    doneWishes: number;
    gives: number;
    usersWithPayments: number;
    languageCounts: Record<'uk' | 'en' | 'pl' | 'auto', number>;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const tryDb = createTryDb('Stats repository');

const countWhere = (condition: ReturnType<typeof sql>) => {
    return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
};

export const createStatsRepository = (db: AppDb) => {
    return {
        publicStats() {
            return tryDb(async (): Promise<PublicStats> => {
                const [userTotals, wishTotals] = await Promise.all([
                    db
                        .select({ total: count() })
                        .from(users)
                        .where(isNull(users.blockedAt)),
                    db
                        .select({
                            total: count(),
                            done: countWhere(sql`${wishes.done} = 1`)
                        })
                        .from(wishes)
                ]);

                return {
                    users: userTotals[0]?.total ?? 0,
                    wishes: wishTotals[0]?.total ?? 0,
                    done: wishTotals[0]?.done ?? 0
                };
            });
        },
        snapshot(asOf: Date) {
            return tryDb(async (): Promise<StatsSnapshot> => {
                const activeSince = (days: number) => {
                    return asOf.getTime() - days * MILLISECONDS_PER_DAY;
                };
                const isActive = (days: number) => {
                    return sql`${users.blockedAt} is null and ${users.lastSeenAt} >= ${activeSince(days)}`;
                };
                const languageCount = (language: string) => {
                    return countWhere(
                        sql`${users.blockedAt} is null and ${users.language} = ${language}`
                    );
                };
                const [userRows, wishRows, giveRows] = await Promise.all([
                    db
                        .select({
                            registeredUsers: count(),
                            blockedUsers: countWhere(
                                sql`${users.blockedAt} is not null`
                            ),
                            activeUsers1d: countWhere(isActive(1)),
                            activeUsers7d: countWhere(isActive(7)),
                            activeUsers30d: countWhere(isActive(30)),
                            usersWithPayments: countWhere(
                                sql`${users.payments} is not null`
                            ),
                            uk: languageCount('uk'),
                            en: languageCount('en'),
                            pl: languageCount('pl'),
                            auto: countWhere(
                                sql`${users.blockedAt} is null and ${users.language} is null`
                            )
                        })
                        .from(users),
                    db
                        .select({
                            totalWishes: count(),
                            activeWishes: countWhere(
                                sql`${wishes.removed} = 0`
                            ),
                            hiddenWishes: countWhere(
                                sql`${wishes.removed} = 0 and ${wishes.hidden} = 1`
                            ),
                            priorityWishes: countWhere(
                                sql`${wishes.removed} = 0 and ${wishes.priority} = 1`
                            ),
                            doneWishes: countWhere(sql`${wishes.done} = 1`)
                        })
                        .from(wishes),
                    db.select({ total: count() }).from(gives)
                ]);
                const userTotals = userRows[0];
                const wishTotals = wishRows[0];

                return {
                    registeredUsers: userTotals?.registeredUsers ?? 0,
                    blockedUsers: userTotals?.blockedUsers ?? 0,
                    activeUsers1d: userTotals?.activeUsers1d ?? 0,
                    activeUsers7d: userTotals?.activeUsers7d ?? 0,
                    activeUsers30d: userTotals?.activeUsers30d ?? 0,
                    totalWishes: wishTotals?.totalWishes ?? 0,
                    activeWishes: wishTotals?.activeWishes ?? 0,
                    hiddenWishes: wishTotals?.hiddenWishes ?? 0,
                    priorityWishes: wishTotals?.priorityWishes ?? 0,
                    doneWishes: wishTotals?.doneWishes ?? 0,
                    gives: giveRows[0]?.total ?? 0,
                    usersWithPayments: userTotals?.usersWithPayments ?? 0,
                    languageCounts: {
                        uk: userTotals?.uk ?? 0,
                        en: userTotals?.en ?? 0,
                        pl: userTotals?.pl ?? 0,
                        auto: userTotals?.auto ?? 0
                    }
                };
            });
        }
    };
};
