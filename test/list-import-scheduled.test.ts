import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type {
    ListImportDrainRequest,
    ListImportService
} from '../src/bot/services/list-import/types';
import {
    LIST_IMPORT_CRON_BUDGET_MS,
    LIST_IMPORT_LOAD_KICK_INTERVAL_MS
} from '../src/shared/app-api';
import type { WorkerBindings } from '../src/worker/env';
import { kickListImport } from '../src/worker/list-import';
import { runScheduledTasks } from '../src/worker/scheduled/tasks';

const createController = (cron: string): ScheduledController => {
    return { cron, scheduledTime: Date.now(), noRetry() {} };
};

const createEnv = (
    environment: WorkerBindings['BOT_ENVIRONMENT'] = 'production'
) => {
    return { BOT_ENVIRONMENT: environment } as unknown as WorkerBindings;
};

const createFakeService = (failDrain = false) => {
    const calls: string[] = [];
    const drains: ListImportDrainRequest[] = [];
    const unexpected = async () => {
        throw new Error('unexpected call');
    };
    const service: ListImportService = {
        preview: unexpected,
        setVisibility: unexpected,
        startCommit: unexpected,
        runCommit: unexpected,
        status: unexpected,
        cancel: unexpected,
        async resumeStale(_deps, request) {
            calls.push(`resume:${request.userId ?? 'all'}`);

            return 0;
        },
        async drainPhotos(_deps, request) {
            calls.push(`drain:${request.trigger}`);
            drains.push(request);

            if (failDrain) {
                throw new TypeError('d1 unavailable');
            }

            return { result: 'idle', ingested: 0, failed: 0 };
        },
        async prune() {
            calls.push('prune');

            return 2;
        },
        async kick(_deps, request) {
            calls.push(`kick:${request.userId ?? 'all'}`);
        }
    };

    return { service, calls, drains };
};

const purgeNothing = async () => {
    return 0;
};

const productionTaskStubs = {
    async broadcastRelease() {
        return null;
    },
    async readBotStateSnapshot(): Promise<never> {
        throw new TypeError('no snapshot in tests');
    },
    async refreshExchangeRates(): Promise<never> {
        throw new TypeError('no rates in tests');
    },
    purgeLinkImportCache: purgeNothing,
    pruneSessions: purgeNothing,
    pruneProcessedTelegramUpdates: purgeNothing,
    pruneAbandonedTelegramUpdates: purgeNothing
};

const quietly = async <Result>(run: () => Promise<Result>) => {
    const log = mock.method(console, 'log', () => undefined);
    const error = mock.method(console, 'error', () => undefined);

    try {
        return { result: await run(), errors: error.mock.calls.length };
    } finally {
        log.mock.restore();
        error.mock.restore();
    }
};

describe('list import scheduled tasks', () => {
    it('adds nothing outside production, where kicks move imports along', async () => {
        const { service, calls } = createFakeService();

        for (const cron of ['*/10 * * * *', '0 0 * * *']) {
            const { result } = await quietly(() => {
                return runScheduledTasks(
                    createController(cron),
                    createEnv('preview'),
                    {} as ExecutionContext,
                    { ...productionTaskStubs, listImport: service }
                );
            });

            assert.equal(
                result.taskNames.some(name => {
                    return name.startsWith('import:');
                }),
                false
            );
        }

        assert.deepEqual(calls, []);
    });

    it('resumes stale commits and drains photos on the ten-minute cron', async () => {
        const { service, calls, drains } = createFakeService();
        const { result } = await quietly(() => {
            return runScheduledTasks(
                createController('*/10 * * * *'),
                createEnv(),
                {} as ExecutionContext,
                { ...productionTaskStubs, listImport: service }
            );
        });

        assert.deepEqual(result.taskNames, [
            'release:broadcast',
            'bot:state-snapshot',
            'import:drain'
        ]);
        assert.deepEqual(calls, ['resume:all', 'drain:cron']);
        assert.equal(drains[0]?.budgetMs, LIST_IMPORT_CRON_BUDGET_MS);
    });

    it('prunes finished imports on the daily cron', async () => {
        const { service, calls } = createFakeService();
        const { result } = await quietly(() => {
            return runScheduledTasks(
                createController('0 0 * * *'),
                createEnv(),
                {} as ExecutionContext,
                { ...productionTaskStubs, listImport: service }
            );
        });

        assert.deepEqual(result.taskNames, [
            'rates:refresh',
            'maintenance:prune',
            'import:prune'
        ]);
        assert.deepEqual(calls, ['prune']);
    });

    it('logs a failing drain without failing the scheduled run', async () => {
        const { service } = createFakeService(true);
        const { result, errors } = await quietly(() => {
            return runScheduledTasks(
                createController('*/10 * * * *'),
                createEnv(),
                {} as ExecutionContext,
                { ...productionTaskStubs, listImport: service }
            );
        });

        assert.ok(result.taskNames.includes('import:drain'));
        assert.equal(errors, 1);
    });
});

describe('list import kick', () => {
    it('kicks one user in the background only when there is a service', async () => {
        const { service, calls } = createFakeService();
        const scheduled: Promise<unknown>[] = [];
        const waitUntil = (promise: Promise<unknown>) => {
            scheduled.push(promise);
        };

        kickListImport(undefined, { env: createEnv(), waitUntil }, 3);
        kickListImport(service, { env: createEnv(), waitUntil }, 3);
        await Promise.all(scheduled);

        assert.equal(scheduled.length, 1);
        assert.deepEqual(calls, ['kick:3']);
    });

    it('asks a list-load kick to hold the drain lease for a minute and plain kicks not to', async () => {
        const { service } = createFakeService();
        const requests: unknown[] = [];
        const recording: ListImportService = {
            ...service,
            async kick(_deps, request) {
                requests.push(request);
            }
        };
        const scheduled: Promise<unknown>[] = [];
        const deps = {
            env: createEnv(),
            waitUntil: (promise: Promise<unknown>) => {
                scheduled.push(promise);
            }
        };

        kickListImport(recording, deps, 3);
        kickListImport(recording, deps, 4, { throttled: true });
        await Promise.all(scheduled);

        assert.equal(LIST_IMPORT_LOAD_KICK_INTERVAL_MS, 60_000);
        assert.deepEqual(requests, [
            { userId: 3 },
            { userId: 4, holdLeaseMs: LIST_IMPORT_LOAD_KICK_INTERVAL_MS }
        ]);
    });

    it('swallows a failing kick', async () => {
        const { service } = createFakeService();
        const scheduled: Promise<unknown>[] = [];
        const failing: ListImportService = {
            ...service,
            async kick() {
                throw new TypeError('boom');
            }
        };

        await quietly(async () => {
            kickListImport(failing, {
                env: createEnv(),
                waitUntil: promise => {
                    scheduled.push(promise);
                }
            });
            await Promise.all(scheduled);
        });

        assert.equal(scheduled.length, 1);
    });
});
