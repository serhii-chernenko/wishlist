import { useCallback, useEffect, useRef, useState } from 'hono/jsx/dom';

import { ApiRequestError } from '../api/client';
import type { AppFailure } from '../logic/errors';

type Listener = () => void;

export type Updater<Value> = Value | ((current: Value) => Value);

export interface Store<Value> {
    get(): Value;
    set(next: Updater<Value>): void;
    subscribe(listener: Listener): () => void;
}

export const createStore = <Value>(initial: Value): Store<Value> => {
    let value = initial;
    const listeners = new Set<Listener>();

    return {
        get: () => value,
        set(next) {
            const resolved =
                typeof next === 'function'
                    ? (next as (current: Value) => Value)(value)
                    : next;

            if (Object.is(resolved, value)) {
                return;
            }

            value = resolved;

            for (const listener of listeners) {
                listener();
            }
        },
        subscribe(listener) {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        }
    };
};

/** Reads the snapshot on every render and re-renders when a subscribed change makes it differ. */
export const useSubscription = <Value>(
    subscribe: (listener: Listener) => () => void,
    getSnapshot: () => Value,
    dependencies: readonly unknown[]
): Value => {
    const [, setVersion] = useState(0);
    const snapshot = getSnapshot();
    const renderedRef = useRef(snapshot);

    renderedRef.current = snapshot;

    useEffect(() => {
        const check = () => {
            if (!Object.is(getSnapshot(), renderedRef.current)) {
                setVersion(version => version + 1);
            }
        };
        const unsubscribe = subscribe(check);

        check();

        return unsubscribe;
    }, dependencies);

    return snapshot;
};

export const useLatest = <Value>(value: Value): { current: Value } => {
    const [box] = useState(() => ({ current: value }));

    box.current = value;

    return box;
};

export const useStore = <Value>(store: Store<Value>): Value => {
    return useSubscription(store.subscribe, store.get, [store]);
};

const INTERNAL_FAILURE: AppFailure = {
    kind: 'api',
    status: 0,
    code: 'internal'
};

export const toFailure = (error: unknown): AppFailure => {
    return error instanceof ApiRequestError ? error.failure : INTERNAL_FAILURE;
};

export interface ResourceState<Value> {
    data: Value | undefined;
    failure: AppFailure | null;
    loading: boolean;
    updatedAt: number;
}

const EMPTY_RESOURCE: ResourceState<never> = Object.freeze({
    data: undefined,
    failure: null,
    loading: false,
    updatedAt: 0
});

export type ResourceLoader<Value> = (signal: AbortSignal) => Promise<Value>;

export interface ResourceCache {
    read<Value>(key: string): ResourceState<Value>;
    load<Value>(
        key: string,
        loader: ResourceLoader<Value>
    ): Promise<Value | undefined>;
    mutate<Value>(
        key: string,
        updater: (current: Value | undefined) => Value | undefined
    ): void;
    remove(key: string): void;
    invalidate(prefix: string): void;
    subscribe(listener: Listener): () => void;
}

export const createResourceCache = (): ResourceCache => {
    const entries = new Map<string, ResourceState<unknown>>();
    const inFlight = new Map<
        string,
        { promise: Promise<unknown>; controller: AbortController }
    >();
    const listeners = new Set<Listener>();

    const notify = () => {
        for (const listener of listeners) {
            listener();
        }
    };

    const write = (key: string, patch: Partial<ResourceState<unknown>>) => {
        entries.set(key, { ...(entries.get(key) ?? EMPTY_RESOURCE), ...patch });
        notify();
    };

    const read = <Value>(key: string) => {
        return (entries.get(key) ?? EMPTY_RESOURCE) as ResourceState<Value>;
    };

    const load = <Value>(key: string, loader: ResourceLoader<Value>) => {
        const running = inFlight.get(key);

        if (running !== undefined) {
            return running.promise as Promise<Value | undefined>;
        }

        const controller = new AbortController();
        const promise = loader(controller.signal)
            .then(data => {
                write(key, {
                    data,
                    failure: null,
                    loading: false,
                    updatedAt: Date.now()
                });

                return data;
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) {
                    return undefined;
                }

                write(key, { failure: toFailure(error), loading: false });

                return undefined;
            })
            .finally(() => {
                if (inFlight.get(key)?.controller === controller) {
                    inFlight.delete(key);
                }
            });

        inFlight.set(key, { promise, controller });
        write(key, { loading: true });

        return promise;
    };

    const cancel = (key: string) => {
        inFlight.get(key)?.controller.abort();
        inFlight.delete(key);
    };

    return {
        read,
        load,
        mutate(key, updater) {
            cancel(key);
            write(key, {
                data: updater(read(key).data as never),
                loading: false,
                updatedAt: Date.now()
            });
        },
        remove(key) {
            cancel(key);
            entries.delete(key);
            notify();
        },
        invalidate(prefix) {
            for (const [key, entry] of entries) {
                if (key.startsWith(prefix)) {
                    entries.set(key, { ...entry, updatedAt: 0 });
                }
            }

            notify();
        },
        subscribe(listener) {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        }
    };
};

export const DEFAULT_STALE_MS = 30_000;

export interface ResourceHandle<Value> extends ResourceState<Value> {
    reload(): Promise<Value | undefined>;
    mutate(updater: (current: Value | undefined) => Value | undefined): void;
}

export interface UseResourceOptions {
    cache: ResourceCache;
    revalidation: Store<number>;
    staleMs?: number;
}

/** Shows cached data immediately, loads when missing or stale, and reloads on every revalidation tick while mounted. */
export const useResource = <Value>(
    key: string | null,
    loader: ResourceLoader<Value>,
    { cache, revalidation, staleMs = DEFAULT_STALE_MS }: UseResourceOptions
): ResourceHandle<Value> => {
    const loaderRef = useLatest(loader);

    const state = useSubscription(
        cache.subscribe,
        () => {
            return key === null ? EMPTY_RESOURCE : cache.read<Value>(key);
        },
        [cache, key]
    ) as ResourceState<Value>;
    const tick = useStore(revalidation);
    const seenTick = useRef(tick);

    const reload = useCallback(() => {
        return key === null
            ? Promise.resolve(undefined)
            : cache.load(key, signal => loaderRef.current(signal));
    }, [cache, key]);

    useEffect(() => {
        if (key === null) {
            return;
        }

        const current = cache.read<Value>(key);
        const forced = seenTick.current !== tick;

        seenTick.current = tick;

        if (
            forced ||
            current.data === undefined ||
            Date.now() - current.updatedAt > staleMs
        ) {
            void reload();
        }
    }, [key, tick]);

    const mutate = useCallback(
        (updater: (current: Value | undefined) => Value | undefined) => {
            if (key !== null) {
                cache.mutate(key, updater);
            }
        },
        [cache, key]
    );

    return { ...state, reload, mutate };
};
