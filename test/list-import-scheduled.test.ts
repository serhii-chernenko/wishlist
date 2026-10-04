import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type {
    ListImportDrainRequest,
    ListImportService
} from '../src/bot/services/list-import/types';
import { LIST_IMPORT_CRON_BUDGET_MS } from '../src/shared/app-api';
import type { WorkerBindings } from '../src/worker/env';
import { kickListImport } from '../src/worker/list-import';
import { runScheduledTasks } from '../src/worker/scheduled/tasks';

const createController = (cron: string): ScheduledController => {
    return { cron, scheduledTime: Date.now(), noRetry() {} };
};

const createEnv = (enabled: string) => {
    return {
        BOT_ENVIRONMENT: 'local',
        WISHLIST_IMPORT_ENABLED: enabled
    } as unknown as WorkerBindings;
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
    it('adds nothing while the import is switched off', async () => {
        const { service, calls } = createFakeService();
        const { result } = await quietly(() => {
            return runScheduledTasks(
                createController('*/10 * * * *'),
                createEnv('false'),
                {} as ExecutionContext,
                {
                    listImport: service,
                    async broadcastRelease() {
                        return null;
                    }
                }
            );
        });

        assert.deepEqual(result.taskNames, [
            'release:broadcast',
            'bot:state-snapshot'
        ]);
        assert.deepEqual(calls, []);
    });

    it('resumes stale commits and drains photos on the ten-minute cron', async () => {
        const { service, calls, drains } = createFakeService();
        const { result } = await quietly(() => {
            return runScheduledTasks(
                createController('*/10 * * * *'),
                createEnv('true'),
                {} as ExecutionContext,
                {
                    listImport: service,
                    async broadcastRelease() {
                        return null;
                    }
                }
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
                createEnv('true'),
                {} as ExecutionContext,
                {
                    listImport: service,
                    purgeLinkImportCache: purgeNothing
                }
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
                createEnv('true'),
                {} as ExecutionContext,
                {
                    listImport: service,
                    async broadcastRelease() {
                        return null;
                    }
                }
            );
        });

        assert.ok(result.taskNames.includes('import:drain'));
        assert.equal(errors, 1);
    });
});

describe('list import kick', () => {
    it('kicks one user in the background only while the import is on', async () => {
        const { service, calls } = createFakeService();
        const scheduled: Promise<unknown>[] = [];
        const waitUntil = (promise: Promise<unknown>) => {
            scheduled.push(promise);
        };

        kickListImport(service, { env: createEnv('false'), waitUntil }, 3);
        kickListImport(undefined, { env: createEnv('true'), waitUntil }, 3);
        kickListImport(service, { env: createEnv('true'), waitUntil }, 3);
        await Promise.all(scheduled);

        assert.equal(scheduled.length, 1);
        assert.deepEqual(calls, ['kick:3']);
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
                env: createEnv('true'),
                waitUntil: promise => {
                    scheduled.push(promise);
                }
            });
            await Promise.all(scheduled);
        });

        assert.equal(scheduled.length, 1);
    });
});
