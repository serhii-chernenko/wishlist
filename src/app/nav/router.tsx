import type { FC } from 'hono/jsx';
import { ErrorBoundary, useEffect } from 'hono/jsx/dom';

import {
    canGoBack,
    createNavState,
    currentEntry,
    popRoute,
    popToScreen,
    pushRoute,
    replaceRoute,
    resetRoutes,
    toClientScreen,
    type NavState,
    type Route
} from '../logic/nav';
import { SCREENS, type ScreenProps } from '../screens';
import {
    EntryContext,
    useApp,
    type Navigator,
    type Session
} from '../state/context';
import { createStore, useStore, type Store } from '../state/store';
import { useBackButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { confirmAction } from '../telegram/popups';
import { ErrorState } from '../ui/error-state';

const SCREEN_TITLE_SELECTOR = 'main h1';

export interface NavigatorHandle {
    state: Store<NavState>;
    navigator: Navigator;
    scrollPositions: Map<number, number>;
}

const confirmDiscard = (session: Session) => {
    const texts = session.LL.editor.discard;

    return confirmAction({
        title: texts.title(),
        message: texts.text(),
        confirmText: texts.confirm(),
        cancelText: texts.keep(),
        destructive: true
    });
};

export const createNavigator = (
    initial: readonly Route[],
    session: Store<Session>
): NavigatorHandle => {
    const state = createStore(createNavState(initial));
    const dirtyEntries = new Set<number>();
    const scrollPositions = new Map<number, number>();

    const rememberScroll = () => {
        scrollPositions.set(currentEntry(state.get()).key, window.scrollY);
    };

    const isCurrentDirty = () => {
        return dirtyEntries.has(currentEntry(state.get()).key);
    };

    const navigator: Navigator = {
        push(route) {
            rememberScroll();
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
        async back() {
            if (!canGoBack(state.get())) {
                return false;
            }

            if (isCurrentDirty() && !(await confirmDiscard(session.get()))) {
                return false;
            }

            dirtyEntries.delete(currentEntry(state.get()).key);
            state.set(popRoute);

            return true;
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

    return { state, navigator, scrollPositions };
};

const focusScreenTitle = () => {
    const title = document.querySelector<HTMLElement>(SCREEN_TITLE_SELECTOR);

    if (title !== null) {
        if (!title.hasAttribute('tabindex')) {
            title.setAttribute('tabindex', '-1');
        }

        title.focus({ preventScroll: true });
    }
};

const ScreenCrash = ({ screen }: { screen: Route['screen'] }) => {
    const { reportEvent, nav, session } = useApp();
    const { LL } = useStore(session);

    useEffect(() => {
        reportEvent('renderError', toClientScreen({ screen } as Route));
    }, []);

    return (
        <main class='screen' data-screen={screen} aria-busy='false'>
            <h1 class='screen-title'>{LL.bootError.title()}</h1>
            <ErrorState
                failure={{ kind: 'api', status: 0, code: 'internal' }}
                onRetry={() => {
                    nav.reset([{ screen: 'home' }]);
                }}
            />
        </main>
    );
};

export const Router = ({ handle }: { handle: NavigatorHandle }) => {
    const nav = useStore(handle.state);
    const entry = currentEntry(nav);
    const Screen = SCREENS[entry.route.screen] as FC<
        ScreenProps<Route['screen']>
    >;
    const { scrollPositions } = handle;
    const { reportEvent } = useApp();

    useBackButton(canGoBack(nav), () => {
        haptics.selection();
        void handle.navigator.back();
    });

    useEffect(() => {
        const saved = scrollPositions.get(entry.key);

        window.scrollTo(0, saved ?? 0);
        scrollPositions.delete(entry.key);
        focusScreenTitle();
        reportEvent('screenView', toClientScreen(entry.route));
    }, [entry.key]);

    return (
        <EntryContext.Provider value={entry.key}>
            <ErrorBoundary
                key={entry.key}
                fallback={<ScreenCrash screen={entry.route.screen} />}
            >
                <Screen key={entry.key} route={entry.route as never} />
            </ErrorBoundary>
        </EntryContext.Provider>
    );
};
