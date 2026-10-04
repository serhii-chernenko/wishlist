import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    createCountdown,
    DESTRUCTIVE_COUNTDOWN_MS,
    runUndoable,
    secondsLeft,
    type CountdownClock,
    type TimerHandle
} from '../src/app/logic/countdown';

interface ScheduledCall {
    at: number;
    callback: () => void;
    handle: number;
}

const createFakeClock = () => {
    let now = 1_000;
    let nextHandle = 1;
    let scheduled: ScheduledCall[] = [];

    const clock: CountdownClock = {
        now: () => now,
        schedule(callback, delayMs) {
            const handle = nextHandle;

            nextHandle += 1;
            scheduled.push({ at: now + delayMs, callback, handle });

            return handle as unknown as TimerHandle;
        },
        cancel(handle) {
            scheduled = scheduled.filter(call => {
                return call.handle !== (handle as unknown as number);
            });
        }
    };

    const advance = (ms: number) => {
        const target = now + ms;

        for (;;) {
            const due = scheduled
                .filter(call => call.at <= target)
                .sort((left, right) => left.at - right.at)[0];

            if (due === undefined) {
                break;
            }

            scheduled = scheduled.filter(call => call !== due);
            now = due.at;
            due.callback();
        }

        now = target;
    };

    return {
        clock,
        advance,
        pending: () => scheduled.length
    };
};

const flushMicrotasks = async () => {
    await new Promise(resolve => {
        setImmediate(resolve);
    });
};

test('seconds left round up and never go below zero', () => {
    assert.equal(secondsLeft(5_000, 0), 5);
    assert.equal(secondsLeft(5_000, 1), 5);
    assert.equal(secondsLeft(5_000, 1_000), 4);
    assert.equal(secondsLeft(5_000, 4_999), 1);
    assert.equal(secondsLeft(5_000, 5_000), 0);
    assert.equal(secondsLeft(5_000, 9_000), 0);
});

test('a countdown ticks every second and commits once at zero', () => {
    const fake = createFakeClock();
    const ticks: number[] = [];
    let commits = 0;
    const countdown = createCountdown({
        clock: fake.clock,
        onTick: seconds => {
            ticks.push(seconds);
        },
        onCommit: () => {
            commits += 1;
        }
    });

    assert.equal(countdown.start(), true);
    assert.equal(countdown.start(), false);
    assert.equal(countdown.isRunning(), true);
    fake.advance(4_999);
    assert.equal(commits, 0);
    fake.advance(1);
    assert.deepEqual(ticks, [5, 4, 3, 2, 1]);
    assert.equal(commits, 1);
    assert.equal(countdown.isRunning(), false);
    assert.equal(fake.pending(), 0);
    fake.advance(10_000);
    assert.equal(commits, 1);
});

test('cancelling stops the countdown without committing', () => {
    const fake = createFakeClock();
    let commits = 0;
    const countdown = createCountdown({
        clock: fake.clock,
        onCommit: () => {
            commits += 1;
        }
    });

    countdown.start();
    fake.advance(2_500);
    assert.equal(countdown.cancel(), true);
    assert.equal(countdown.cancel(), false);
    fake.advance(10_000);
    assert.equal(commits, 0);
    assert.equal(fake.pending(), 0);
    assert.equal(countdown.start(), true);
    fake.advance(DESTRUCTIVE_COUNTDOWN_MS);
    assert.equal(commits, 1);
});

test('flushing commits at once and only while running', () => {
    const fake = createFakeClock();
    let commits = 0;
    const countdown = createCountdown({
        clock: fake.clock,
        durationMs: 3_000,
        onCommit: () => {
            commits += 1;
        }
    });

    assert.equal(countdown.flush(), false);
    countdown.start();
    assert.equal(countdown.flush(), true);
    assert.equal(commits, 1);
    fake.advance(5_000);
    assert.equal(commits, 1);
});

const createAction = (commit: () => Promise<unknown>) => {
    const calls: string[] = [];

    return {
        calls,
        action: {
            apply: () => calls.push('apply'),
            restore: () => calls.push('restore'),
            commit: () => {
                calls.push('commit');

                return commit();
            },
            committed: () => calls.push('committed'),
            failed: () => calls.push('failed')
        }
    };
};

test('an undoable change applies at once and writes only after the countdown', async () => {
    const fake = createFakeClock();
    const { calls, action } = createAction(() => Promise.resolve());
    const handle = runUndoable(action, { clock: fake.clock });

    assert.deepEqual(calls, ['apply']);
    assert.equal(handle.isPending(), true);
    fake.advance(DESTRUCTIVE_COUNTDOWN_MS - 1);
    assert.deepEqual(calls, ['apply']);
    fake.advance(1);
    await flushMicrotasks();
    assert.deepEqual(calls, ['apply', 'commit', 'committed']);
    assert.equal(handle.undo(), false);
});

test('an undo before the end restores the change and never writes', async () => {
    const fake = createFakeClock();
    const { calls, action } = createAction(() => Promise.resolve());
    const handle = runUndoable(action, { clock: fake.clock });

    fake.advance(4_000);
    assert.equal(handle.undo(), true);
    assert.equal(handle.undo(), false);
    fake.advance(10_000);
    await flushMicrotasks();
    assert.deepEqual(calls, ['apply', 'restore']);
    assert.equal(handle.flush(), false);
});

test('a failed write restores the change and reports the error', async () => {
    const fake = createFakeClock();
    const { calls, action } = createAction(() => {
        return Promise.reject(new Error('offline'));
    });
    const handle = runUndoable(action, { clock: fake.clock });

    assert.equal(handle.flush(), true);
    await flushMicrotasks();
    assert.deepEqual(calls, ['apply', 'commit', 'restore', 'failed']);
});

test('the CSS countdown duration matches the logic', () => {
    const source = readFileSync(
        new URL('../src/app/styles/app.css', import.meta.url),
        'utf8'
    );
    const duration = /--countdown-duration:\s*(\d+)s;/.exec(source)?.[1];

    assert.equal(Number(duration) * 1000, DESTRUCTIVE_COUNTDOWN_MS);
});
