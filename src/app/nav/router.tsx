import type { FC } from 'hono/jsx';
import { ErrorBoundary, useEffect } from 'hono/jsx/dom';

import {
    canGoBack,
    createNavState,
    currentEntry,
    rootRoute,
    toClientScreen,
    type NavState,
    type Route
} from '../logic/nav';
import { createNavigatorCore } from '../logic/navigator';
import { SCREENS, type ScreenProps } from '../screens';
import {
    EntryContext,
    useApp,
    type Navigator,
    type Session
} from '../state/context';
import { dismissibleLayers, dismissTopLayer } from '../state/layers';
import { createStore, useStore, type Store } from '../state/store';
import { useBackButton, useHomeButton } from '../telegram/buttons';
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
    const scrollPositions = new Map<number, number>();
    const navigator = createNavigatorCore({
        state,
        confirmDiscard: () => confirmDiscard(session.get()),
        rootRoutes: () => [rootRoute(session.get().me.registered)],
        rememberScroll: entryKey => {
            scrollPositions.set(entryKey, window.scrollY);
        }
    });

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
    const { reportEvent, session } = useApp();
    const { LL } = useStore(session);
    const layers = useStore(dismissibleLayers);

    useBackButton(canGoBack(nav) || layers.length > 0, () => {
        haptics.selection();

        if (!dismissTopLayer()) {
            void handle.navigator.back();
        }
    });
    useHomeButton(canGoBack(nav), LL.common.toHome(), () => {
        haptics.selection();
        void handle.navigator.home();
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
