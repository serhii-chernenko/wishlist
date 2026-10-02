import { Effect } from 'effect';

import { createDb } from '../../db/client';
import { createRepositories } from '../../db/repositories';
import type { WorkerBindings } from '../env';

export const snapshotLocales = ['uk', 'en', 'pl', 'auto'] as const;

export type SnapshotLocale = (typeof snapshotLocales)[number];

export interface BotStateSnapshot {
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
    languageCounts: Record<SnapshotLocale, number>;
}

export const readBotStateSnapshot = (
    env: WorkerBindings,
    asOf: Date
): Promise<BotStateSnapshot> => {
    const repository = createRepositories(createDb(env)).stats;

    return Effect.runPromise(repository.snapshot(asOf));
};
