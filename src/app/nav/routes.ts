import type { RouteOf, ScreenId } from '../logic/nav';

export {
    REGISTERED_ONLY_SCREENS,
    SCREEN_IDS,
    requiresRegistration,
    resolveStartRoutes,
    rootRoute,
    type Route,
    type RouteOf,
    type ScreenId,
    type ThirdListSource
} from '../logic/nav';

export type ScreenProps<Screen extends ScreenId> = { route: RouteOf<Screen> };
