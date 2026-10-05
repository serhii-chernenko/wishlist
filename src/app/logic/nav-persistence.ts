import { LINK_MAX_LENGTH } from '../../bot/input/limits';
import type { OwnerDto } from '../../shared/app-api';
import { parseStartParam } from '../../shared/app-links';
import {
    isRootScreen,
    requiresRegistration,
    resolveStartRoutes,
    rootRoute,
    SCREEN_IDS,
    type Route,
    type ScreenId
} from './nav';

export const NAV_STORAGE_KEY = 'wl.nav.v2';
export const NAV_SNAPSHOT_VERSION = 2;
export const NAV_SNAPSHOT_MAX_ROUTES = 24;

type StoredOwner = Omit<OwnerDto, 'payments' | 'contact'>;

type StoredRoute =
    | { screen: Exclude<ScreenId, 'wishEditor' | 'thirdList'> }
    | { screen: 'wishEditor'; wishId: number | null; importLink?: string }
    | {
          screen: 'thirdList';
          source:
              | { kind: 'share'; publicId: string }
              | { kind: 'owner'; owner: StoredOwner };
      };

interface NavSnapshot {
    v: typeof NAV_SNAPSHOT_VERSION;
    launch: string;
    routes: StoredRoute[];
}

export interface InitialRoutesInput {
    stored: string | null;
    initData: string;
    startParam: string | null;
    registered: boolean;
}

const PARAMETERLESS_SCREENS: ReadonlySet<string> = new Set(
    SCREEN_IDS.filter(screen => {
        return screen !== 'wishEditor' && screen !== 'thirdList';
    })
);

const OWNER_SOURCES: ReadonlySet<unknown> = new Set(['search', 'share']);

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/** Identifies one launch: a reload keeps the same signed initData, a new launch gets a new auth_date and hash. */
export const getLaunchIdentity = (initData: string): string | null => {
    const params = new URLSearchParams(initData);
    const authDate = params.get('auth_date');
    const hash = params.get('hash');

    return authDate && hash ? `${authDate}:${hash}` : null;
};

const toStoredRoute = (route: Route): StoredRoute => {
    if (route.screen === 'thirdList' && route.source.kind === 'owner') {
        const { token, label, source, canGive } = route.source.owner;

        return {
            screen: 'thirdList',
            source: {
                kind: 'owner',
                owner: { token, label, source, canGive }
            }
        };
    }

    return route as StoredRoute;
};

export const serializeNavSnapshot = (
    routes: readonly Route[],
    launch: string
): string => {
    const snapshot: NavSnapshot = {
        v: NAV_SNAPSHOT_VERSION,
        launch,
        routes: routes.slice(-NAV_SNAPSHOT_MAX_ROUTES).map(toStoredRoute)
    };

    return JSON.stringify(snapshot);
};

const parseOwner = (value: unknown): OwnerDto | null => {
    if (
        !isRecord(value) ||
        !(value.token === null || typeof value.token === 'string') ||
        typeof value.label !== 'string' ||
        !OWNER_SOURCES.has(value.source) ||
        typeof value.canGive !== 'boolean'
    ) {
        return null;
    }

    return {
        token: value.token,
        label: value.label,
        payments: null,
        contact: null,
        source: value.source as OwnerDto['source'],
        canGive: value.canGive
    };
};

const parseThirdList = (source: unknown): Route | null => {
    if (!isRecord(source)) {
        return null;
    }

    if (source.kind === 'share' && typeof source.publicId === 'string') {
        const target = parseStartParam(`s_${source.publicId}`);

        return target?.kind === 'share' && target.publicId === source.publicId
            ? {
                  screen: 'thirdList',
                  source: { kind: 'share', publicId: target.publicId }
              }
            : null;
    }

    const owner = source.kind === 'owner' ? parseOwner(source.owner) : null;

    return owner === null
        ? null
        : { screen: 'thirdList', source: { kind: 'owner', owner } };
};

const isWishId = (value: unknown): value is number | null => {
    return (
        value === null ||
        (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    );
};

const isImportLink = (value: unknown): value is string => {
    return (
        typeof value === 'string' &&
        value !== '' &&
        value.length <= LINK_MAX_LENGTH
    );
};

const parseWishEditor = (
    wishId: unknown,
    importLink: unknown
): Route | null => {
    if (!isWishId(wishId)) {
        return null;
    }

    if (importLink === undefined) {
        return { screen: 'wishEditor', wishId };
    }

    return wishId === null && isImportLink(importLink)
        ? { screen: 'wishEditor', wishId, importLink }
        : null;
};

/** Rebuilds one stored route, or null when its screen or params no longer match a known shape. */
export const parseStoredRoute = (value: unknown): Route | null => {
    if (!isRecord(value) || typeof value.screen !== 'string') {
        return null;
    }

    if (value.screen === 'wishEditor') {
        return parseWishEditor(value.wishId, value.importLink);
    }

    if (value.screen === 'thirdList') {
        return parseThirdList(value.source);
    }

    return PARAMETERLESS_SCREENS.has(value.screen)
        ? ({ screen: value.screen } as Route)
        : null;
};

const parseSnapshot = (stored: string | null): NavSnapshot | null => {
    if (stored === null) {
        return null;
    }

    try {
        const value: unknown = JSON.parse(stored);

        return isRecord(value) &&
            value.v === NAV_SNAPSHOT_VERSION &&
            typeof value.launch === 'string' &&
            Array.isArray(value.routes)
            ? (value as unknown as NavSnapshot)
            : null;
    } catch {
        return null;
    }
};

/** Keeps valid routes up to the first invalid or (for guests) registered-only one, always under the right root. */
export const restoreRoutes = (
    stored: readonly unknown[],
    registered: boolean
): Route[] => {
    const restored: Route[] = [];

    for (const value of stored.slice(0, NAV_SNAPSHOT_MAX_ROUTES)) {
        const route = parseStoredRoute(value);

        if (route === null || (!registered && requiresRegistration(route))) {
            break;
        }

        if (!isRootScreen(route.screen)) {
            restored.push(route);
        }
    }

    return [rootRoute(registered), ...restored];
};

/** A reload of the same launch restores the saved stack; a new launch (or no usable snapshot) follows its start_param. */
export const resolveInitialRoutes = ({
    stored,
    initData,
    startParam,
    registered
}: InitialRoutesInput): Route[] => {
    const launch = getLaunchIdentity(initData);
    const snapshot = parseSnapshot(stored);

    if (launch === null || snapshot === null || snapshot.launch !== launch) {
        return resolveStartRoutes(startParam, registered);
    }

    return restoreRoutes(snapshot.routes, registered);
};
