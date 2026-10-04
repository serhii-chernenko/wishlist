import type { ClientScreen, OwnerDto } from '../../shared/app-api';
import { parseStartParam, type StartScreen } from '../../shared/app-links';

export type ThirdListSource =
    | { kind: 'owner'; owner: OwnerDto }
    | { kind: 'share'; publicId: string };

export type Route =
    | { screen: 'home' }
    | { screen: 'onboarding' }
    | { screen: 'wishes' }
    | { screen: 'wishEditor'; wishId: number | null }
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
    add: [{ screen: 'wishes' }, { screen: 'wishEditor', wishId: null }],
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
} as const satisfies Record<StartScreen, readonly Route[]>;

export const rootRoute = (registered: boolean): Route => {
    return registered ? { screen: 'home' } : { screen: 'onboarding' };
};

export const isRootScreen = (screen: ScreenId) => {
    return screen === 'home' || screen === 'onboarding';
};

export const requiresRegistration = (route: Route) => {
    return REGISTERED_ONLY_SCREENS.has(route.screen);
};

const routesForStart = (startParam: string | null): readonly Route[] => {
    const target = parseStartParam(startParam);

    if (target === null) {
        return [];
    }

    if (target.kind === 'screen') {
        return SIMPLE_START_ROUTES[target.screen];
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
    registered: boolean
): Route[] => {
    const targets = routesForStart(startParam);
    const blocked = !registered && targets.some(requiresRegistration);

    return [
        rootRoute(registered),
        ...(blocked ? [{ screen: 'visibility' } as const] : targets)
    ];
};

/** The stack a guest lands on right after registering: the deep link they opened the app with, never the Visibility screen they just finished. */
export const routesAfterRegistration = (startParam: string | null): Route[] => {
    return resolveStartRoutes(startParam, true).filter(route => {
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

export const popToScreen = (state: NavState, screen: ScreenId): NavState => {
    const index = state.entries
        .map(entry => entry.route.screen)
        .lastIndexOf(screen);

    return index === -1
        ? state
        : { ...state, entries: state.entries.slice(0, index + 1) };
};

export const toClientScreen = (route: Route): ClientScreen => {
    return route.screen;
};
