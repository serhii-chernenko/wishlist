import { Effect } from 'effect';

import type { Repositories } from '../runtime/types';

export const createStatsService = (deps: { repos: Repositories }) => {
    return {
        getPublicStats() {
            return Effect.runPromise(deps.repos.stats.publicStats());
        }
    };
};

export type StatsService = ReturnType<typeof createStatsService>;
