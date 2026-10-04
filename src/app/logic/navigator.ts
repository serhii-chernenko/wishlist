import {
    canGoBack,
    currentEntry,
    entriesAboveScreen,
    hasScreen,
    navigateToScreen,
    popRoute,
    popToScreen,
    pushRoute,
    replaceRoute,
    resetRoutes,
    retargetCurrent,
    type MissingScreenFallback,
    type NavState,
    type PlainScreenId,
    type Route,
    type ScreenId
} from './nav';

export interface NavStateSlot {
    get(): NavState;
    set(next: NavState | ((current: NavState) => NavState)): void;
}

export interface NavigatorOptions {
    state: NavStateSlot;
    confirmDiscard: () => Promise<boolean>;
    rootRoutes: () => readonly Route[];
    rememberScroll?: (entryKey: number) => void;
}

export interface Navigator {
    push(route: Route): void;
    replace(route: Route): void;
    reset(routes: readonly Route[]): void;
    popTo(screen: ScreenId): void;
    navigateTo(
        screen: PlainScreenId,
        fallback?: MissingScreenFallback
    ): Promise<boolean>;
    retarget(route: Route, dropBelow?: ScreenId): void;
    back(): Promise<boolean>;
    home(): Promise<boolean>;
    canGoBack(): boolean;
    setDirty(entryKey: number, dirty: boolean): void;
}

/** The app's navigation stack with the discard guard: any move that drops a dirty entry asks first, and gives up when the stack changed while the popup was open. */
export const createNavigatorCore = ({
    state,
    confirmDiscard,
    rootRoutes,
    rememberScroll
}: NavigatorOptions): Navigator => {
    const dirtyEntries = new Set<number>();

    const currentKey = () => {
        return currentEntry(state.get()).key;
    };

    const rememberCurrentScroll = () => {
        rememberScroll?.(currentKey());
    };

    const leave = async (droppedKeys: readonly number[], apply: () => void) => {
        if (
            droppedKeys.some(key => {
                return dirtyEntries.has(key);
            })
        ) {
            const keyBeforePopup = currentKey();

            if (!(await confirmDiscard()) || currentKey() !== keyBeforePopup) {
                return false;
            }
        }

        for (const key of droppedKeys) {
            dirtyEntries.delete(key);
        }

        apply();

        return true;
    };

    return {
        push(route) {
            rememberCurrentScroll();
            state.set(current => pushRoute(current, route));
        },
        replace(route) {
            state.set(current => replaceRoute(current, route));
        },
        reset(routes) {
            dirtyEntries.clear();
            state.set(current => resetRoutes(current, routes));
        },
        popTo(screen) {
            state.set(current => popToScreen(current, screen));
        },
        navigateTo(screen, fallback = 'push') {
            const snapshot = state.get();

            if (!hasScreen(snapshot, screen) && fallback === 'push') {
                rememberCurrentScroll();
            }

            const droppedKeys = hasScreen(snapshot, screen)
                ? entriesAboveScreen(snapshot, screen).map(entry => entry.key)
                : fallback === 'replace'
                  ? [currentKey()]
                  : [];

            return leave(droppedKeys, () => {
                state.set(current => {
                    return navigateToScreen(current, screen, fallback);
                });
            });
        },
        retarget(route, dropBelow) {
            state.set(current => retargetCurrent(current, route, dropBelow));
        },
        back() {
            if (!canGoBack(state.get())) {
                return Promise.resolve(false);
            }

            return leave([currentKey()], () => {
                state.set(popRoute);
            });
        },
        home() {
            const snapshot = state.get();

            if (!canGoBack(snapshot)) {
                return Promise.resolve(false);
            }

            return leave(
                snapshot.entries.map(entry => entry.key),
                () => {
                    dirtyEntries.clear();
                    state.set(current => resetRoutes(current, rootRoutes()));
                }
            );
        },
        canGoBack() {
            return canGoBack(state.get());
        },
        setDirty(entryKey, dirty) {
            if (dirty) {
                dirtyEntries.add(entryKey);
            } else {
                dirtyEntries.delete(entryKey);
            }
        }
    };
};
