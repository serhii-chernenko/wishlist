import type { ClientScreen, OwnerDto } from '../../shared/app-api';
import { parseStartParam, type StartScreen } from '../../shared/app-links';

export type ThirdListSource =
    | { kind: 'owner'; owner: OwnerDto }
    | { kind: 'share'; publicId: string };

export type Route =
    | { screen: 'home' }
    | { screen: 'onboarding' }
    | { screen: 'wishes' }
    | { screen: 'wishEditor'; wishId: number | null; importLink?: string }
    | { screen: 'linkImport' }
    | { screen: 'gives' }
    | { screen: 'find' }
    | { screen: 'thirdList'; source: ThirdListSource }
    | { screen: 'share' }
    | { screen: 'settings' }
    | { screen: 'visibility' }
    | { screen: 'payments' }
    | { screen: 'currency' }
    | { screen: 'delivery' }
    | { screen: 'language' }
    | { screen: 'feedback' }
    | { screen: 'stats' }
    | { screen: 'donate' }
    | { screen: 'releases' }
    | { screen: 'about' };

export type ScreenId = Route['screen'];

export type PlainScreenId = Exclude<ScreenId, 'wishEditor' | 'thirdList'>;

export type MissingScreenFallback = 'push' | 'replace';

export type RouteOf<Screen extends ScreenId> = Extract<
    Route,
    { screen: Screen }
>;

export interface NavEntry {
    key: number;
    route: Route;
}

export interface NavState {
    entries: NavEntry[];
    nextKey: number;
}

export const SCREEN_IDS = [
    'home',
    'onboarding',
    'wishes',
    'wishEditor',
    'linkImport',
    'gives',
    'find',
    'thirdList',
    'share',
    'settings',
    'visibility',
    'payments',
    'currency',
    'delivery',
    'language',
    'feedback',
    'stats',
    'donate',
    'releases',
    'about'
] as const satisfies readonly ScreenId[] & readonly ClientScreen[];

export const REGISTERED_ONLY_SCREENS: ReadonlySet<ScreenId> = new Set([
    'wishes',
    'wishEditor',
    'linkImport',
    'gives',
    'find',
    'thirdList',
    'share',
    'payments',
    'currency',
    'delivery'
]);

const SIMPLE_START_ROUTES = {
    wishes: [{ screen: 'wishes' }],
    gives: [{ screen: 'gives' }],
    find: [{ screen: 'find' }],
    share: [{ screen: 'share' }],
    settings: [{ screen: 'settings' }],
    visibility: [{ screen: 'visibility' }],
    payments: [{ screen: 'payments' }],
    language: [{ screen: 'language' }],
    feedback: [{ screen: 'feedback' }],
    stats: [{ screen: 'stats' }],
    donate: [{ screen: 'donate' }],
    releases: [{ screen: 'releases' }],
    about: [{ screen: 'about' }]
} as const satisfies Record<Exclude<StartScreen, 'add'>, readonly Route[]>;

export interface StartRouteOptions {
    linkImportEnabled: boolean;
}

const WITHOUT_LINK_IMPORT: StartRouteOptions = { linkImportEnabled: false };

/** Where "add a wish" leads: the link step while link import is on, otherwise straight to an empty editor. */
export const newWishRoute = (linkImportEnabled: boolean): Route => {
    return linkImportEnabled
        ? { screen: 'linkImport' }
        : { screen: 'wishEditor', wishId: null };
};

export const rootRoute = (registered: boolean): Route => {
    return registered ? { screen: 'home' } : { screen: 'onboarding' };
};

export const isRootScreen = (screen: ScreenId) => {
    return screen === 'home' || screen === 'onboarding';
};

export const requiresRegistration = (route: Route) => {
    return REGISTERED_ONLY_SCREENS.has(route.screen);
};

const routesForStart = (
    startParam: string | null,
    options: StartRouteOptions
): readonly Route[] => {
    const target = parseStartParam(startParam);

    if (target === null) {
        return [];
    }

    if (target.kind === 'screen') {
        const { screen } = target;

        return screen === 'add'
            ? [{ screen: 'wishes' }, newWishRoute(options.linkImportEnabled)]
            : SIMPLE_START_ROUTES[screen];
    }

    if (target.kind === 'wish') {
        return [
            { screen: 'wishes' },
            { screen: 'wishEditor', wishId: target.wishId }
        ];
    }

    return [
        {
            screen: 'thirdList',
            source: { kind: 'share', publicId: target.publicId }
        }
    ];
};

export const resolveStartRoutes = (
    startParam: string | null,
    registered: boolean,
    options: StartRouteOptions = WITHOUT_LINK_IMPORT
): Route[] => {
    const targets = routesForStart(startParam, options);
    const blocked = !registered && targets.some(requiresRegistration);

    return [
        rootRoute(registered),
        ...(blocked ? [{ screen: 'visibility' } as const] : targets)
    ];
};

/** The stack a guest lands on right after registering: the deep link they opened the app with, never the Visibility screen they just finished. */
export const routesAfterRegistration = (
    startParam: string | null,
    options: StartRouteOptions = WITHOUT_LINK_IMPORT
): Route[] => {
    return resolveStartRoutes(startParam, true, options).filter(route => {
        return route.screen !== 'visibility';
    });
};

export const createNavState = (routes: readonly Route[]): NavState => {
    const entries = routes.map((route, index) => {
        return { key: index + 1, route };
    });

    return { entries, nextKey: entries.length + 1 };
};

export const currentEntry = (state: NavState): NavEntry => {
    const entry = state.entries[state.entries.length - 1];

    if (entry === undefined) {
        throw new Error('navigation stack is empty');
    }

    return entry;
};

export const getDepth = (state: NavState) => {
    return state.entries.length;
};

export const canGoBack = (state: NavState) => {
    return state.entries.length > 1;
};

export const pushRoute = (state: NavState, route: Route): NavState => {
    return {
        entries: [...state.entries, { key: state.nextKey, route }],
        nextKey: state.nextKey + 1
    };
};

export const popRoute = (state: NavState): NavState => {
    return canGoBack(state)
        ? { ...state, entries: state.entries.slice(0, -1) }
        : state;
};

export const replaceRoute = (state: NavState, route: Route): NavState => {
    return {
        entries: [...state.entries.slice(0, -1), { key: state.nextKey, route }],
        nextKey: state.nextKey + 1
    };
};

export const resetRoutes = (
    state: NavState,
    routes: readonly Route[]
): NavState => {
    if (routes.length === 0) {
        return state;
    }

    return {
        entries: routes.map((route, index) => {
            return { key: state.nextKey + index, route };
        }),
        nextKey: state.nextKey + routes.length
    };
};

const lastIndexOfScreen = (state: NavState, screen: ScreenId) => {
    return state.entries.map(entry => entry.route.screen).lastIndexOf(screen);
};

export const hasScreen = (state: NavState, screen: ScreenId) => {
    return lastIndexOfScreen(state, screen) !== -1;
};

export const popToScreen = (state: NavState, screen: ScreenId): NavState => {
    const index = lastIndexOfScreen(state, screen);

    return index === -1 || index === state.entries.length - 1
        ? state
        : { ...state, entries: state.entries.slice(0, index + 1) };
};

export const entriesAboveScreen = (
    state: NavState,
    screen: ScreenId
): NavEntry[] => {
    const index = lastIndexOfScreen(state, screen);

    return index === -1 ? [] : state.entries.slice(index + 1);
};

export const plainRoute = (screen: PlainScreenId): Route => {
    return { screen } as Route;
};

/** Goes back to the screen when it is already in the stack, so links between screens never grow it in cycles; otherwise pushes it (or replaces the current entry). */
export const navigateToScreen = (
    state: NavState,
    screen: PlainScreenId,
    fallback: MissingScreenFallback = 'push'
): NavState => {
    if (hasScreen(state, screen)) {
        return popToScreen(state, screen);
    }

    return fallback === 'push'
        ? pushRoute(state, plainRoute(screen))
        : replaceRoute(state, plainRoute(screen));
};

/** Swaps the current route in place (same entry key, so the screen keeps its state) and drops the entry right below it when that is `dropBelow`. */
export const retargetCurrent = (
    state: NavState,
    route: Route,
    dropBelow?: ScreenId
): NavState => {
    const { key } = currentEntry(state);
    const below = state.entries.slice(0, -1);
    const dropsBelow =
        dropBelow !== undefined &&
        below.length > 1 &&
        below[below.length - 1]?.route.screen === dropBelow;

    return {
        ...state,
        entries: [...(dropsBelow ? below.slice(0, -1) : below), { key, route }]
    };
};

export const toClientScreen = (route: Route): ClientScreen => {
    return route.screen;
};
