import { getErrorType } from '../errors';
import type { WishlistBotTelemetry } from './types';

export type WaitUntil = (promise: Promise<unknown>) => void;

export type Sleep = (milliseconds: number) => Promise<void>;

interface WorkersScheduler {
    wait(milliseconds: number): Promise<void>;
}

const getWorkersScheduler = (): WorkersScheduler | null => {
    const candidate = (globalThis as { scheduler?: Partial<WorkersScheduler> })
        .scheduler;

    return typeof candidate?.wait === 'function'
        ? (candidate as WorkersScheduler)
        : null;
};

export const defaultSleep: Sleep = milliseconds => {
    const scheduler = getWorkersScheduler();

    if (scheduler) {
        return scheduler.wait(milliseconds);
    }

    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
};

export interface DeferQueue {
    defer(task: () => Promise<void>, delayMs: number): void;
    flush(): Promise<void>;
}

/**
 * Runs delayed work after the update is handled. With `waitUntil` the work is
 * handed to the Workers runtime; without it the tasks are collected and
 * `flush()` awaits them (tests and local runs stay deterministic).
 */
export const createDeferQueue = (deps: {
    waitUntil?: WaitUntil | undefined;
    sleep?: Sleep | undefined;
    telemetry?: WishlistBotTelemetry | undefined;
}): DeferQueue => {
    const sleep = deps.sleep ?? defaultSleep;
    const pending: Promise<void>[] = [];

    const reportFailure = (error: unknown) => {
        deps.telemetry?.internalFailure({
            event: 'deferred_render_failed',
            errorType: getErrorType(error)
        });
        console.error(
            JSON.stringify({
                event: 'deferred_render_failed',
                errorType: getErrorType(error)
            })
        );
    };

    return {
        defer(task, delayMs) {
            const run = sleep(Math.max(0, delayMs))
                .then(task)
                .catch(reportFailure);

            if (deps.waitUntil) {
                deps.waitUntil(run);
                return;
            }

            pending.push(run);
        },
        async flush() {
            while (pending.length > 0) {
                await Promise.all(pending.splice(0));
            }
        }
    };
};
