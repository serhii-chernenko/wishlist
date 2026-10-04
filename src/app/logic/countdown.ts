const SECOND_MS = 1000;

export const DESTRUCTIVE_COUNTDOWN_MS = 5000;

export const DESTRUCTIVE_COUNTDOWN_SECONDS =
    DESTRUCTIVE_COUNTDOWN_MS / SECOND_MS;

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface CountdownClock {
    now(): number;
    schedule(callback: () => void, delayMs: number): TimerHandle;
    cancel(handle: TimerHandle): void;
}

export const systemClock: CountdownClock = {
    now: () => Date.now(),
    schedule: (callback, delayMs) => setTimeout(callback, delayMs),
    cancel: handle => clearTimeout(handle)
};

export const secondsLeft = (deadline: number, now: number) => {
    return Math.max(0, Math.ceil((deadline - now) / SECOND_MS));
};

const delayToNextSecond = (remainingMs: number) => {
    return remainingMs % SECOND_MS || SECOND_MS;
};

export interface CountdownOptions {
    onCommit: () => void;
    onTick?: (seconds: number) => void;
    durationMs?: number;
    clock?: CountdownClock;
}

export interface Countdown {
    start(): boolean;
    cancel(): boolean;
    flush(): boolean;
    isRunning(): boolean;
}

/** A one-shot timer that reports whole seconds left and commits at zero unless cancelled first; `flush` commits at once. */
export const createCountdown = ({
    onCommit,
    onTick,
    durationMs = DESTRUCTIVE_COUNTDOWN_MS,
    clock = systemClock
}: CountdownOptions): Countdown => {
    let deadline: number | null = null;
    let handle: TimerHandle | null = null;

    const stop = () => {
        if (handle !== null) {
            clock.cancel(handle);
        }

        handle = null;
        deadline = null;
    };

    const tick = () => {
        if (deadline === null) {
            return;
        }

        const now = clock.now();
        const remainingMs = deadline - now;

        if (remainingMs <= 0) {
            stop();
            onCommit();

            return;
        }

        onTick?.(secondsLeft(deadline, now));
        handle = clock.schedule(tick, delayToNextSecond(remainingMs));
    };

    return {
        start() {
            if (deadline !== null) {
                return false;
            }

            deadline = clock.now() + durationMs;
            tick();

            return true;
        },
        cancel() {
            if (deadline === null) {
                return false;
            }

            stop();

            return true;
        },
        flush() {
            if (deadline === null) {
                return false;
            }

            stop();
            onCommit();

            return true;
        },
        isRunning() {
            return deadline !== null;
        }
    };
};

export interface UndoableAction {
    apply(): void;
    restore(): void;
    commit(): Promise<unknown>;
    committed?(): void;
    failed?(error: unknown): void;
}

export interface UndoableOptions {
    onTick?: (seconds: number) => void;
    durationMs?: number;
    clock?: CountdownClock;
}

export interface UndoHandle {
    undo(): boolean;
    flush(): boolean;
    isPending(): boolean;
}

/** Applies a change locally at once and sends it only when the countdown ends; an undo before then restores it without any server write. */
export const runUndoable = (
    action: UndoableAction,
    options: UndoableOptions = {}
): UndoHandle => {
    const send = async () => {
        try {
            await action.commit();
        } catch (error) {
            action.restore();
            action.failed?.(error);

            return;
        }

        action.committed?.();
    };
    const countdown = createCountdown({
        ...options,
        onCommit: () => {
            void send();
        }
    });

    action.apply();
    countdown.start();

    return {
        undo() {
            if (!countdown.cancel()) {
                return false;
            }

            action.restore();

            return true;
        },
        flush() {
            return countdown.flush();
        },
        isPending() {
            return countdown.isRunning();
        }
    };
};
