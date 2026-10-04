import { Hono, type MiddlewareHandler } from 'hono';

import {
    APP_API_PREFIX,
    APP_API_ROUTES,
    type ApiBodyKind,
    type AppApiRouteKey
} from '../shared/app-api';
import type { WorkerApp } from '../worker/app';
import {
    createApiEnvelopeMiddleware,
    createAuthMiddleware
} from './auth/middleware';
import {
    resolveApiDeps,
    type ApiHandler,
    type ApiRoute,
    type AppApiDependencies,
    type AppApiEnv
} from './context';
import { apiErrorResponse, toApiErrorResponse } from './errors';
import { bootstrap } from './handlers/bootstrap';
import { reportClientEvent } from './handlers/client-events';
import { sendFeedback } from './handlers/feedback';
import {
    removeDeliveryAddress,
    setContactDisclosure,
    setDeliveryAddress
} from './handlers/contact';
import { setCurrency } from './handlers/currency';
import { cleanGives, listGives, removeGive } from './handlers/gives';
import { hideGiftedWish, restoreWish, setShowGifted } from './handlers/gifted';
import {
    clearWishImages,
    importWishImage,
    removeWishImage,
    reorderWishImages,
    startImageChatIntent,
    uploadWishImage
} from './handlers/images';
import { getStats, listReleases } from './handlers/info';
import { importLink } from './handlers/link-import';
import {
    commitListImport,
    getListImport,
    previewListImport
} from './handlers/list-import';
import { giveWish, listOwnerWishes, openSharedList } from './handlers/lists';
import {
    cancelContactIntent,
    getMe,
    removePayments,
    setLanguage,
    setPayments,
    setVisibility,
    startContactIntent
} from './handlers/me';
import { search } from './handlers/search';
import {
    getShare,
    publishShare,
    rotateShare,
    setShareIndexing,
    setShareUsername,
    stopShare
} from './handlers/share';
import {
    cleanWishes,
    createWish,
    getWish,
    listWishes,
    removeWish,
    setWishFilter,
    updateWish
} from './handlers/wishes';
import { jsonBodyLimit, uploadBodyLimit } from './validate';

export const APP_API_HANDLERS: Readonly<Record<AppApiRouteKey, ApiHandler>> = {
    bootstrap,
    getMe,
    setVisibility,
    startContactIntent,
    cancelContactIntent,
    setLanguage,
    setPayments,
    removePayments,
    setCurrency,
    setDeliveryAddress,
    removeDeliveryAddress,
    setContactDisclosure,
    setShowGifted,
    listWishes,
    setWishFilter,
    createWish,
    getWish,
    updateWish,
    removeWish,
    cleanWishes,
    restoreWish,
    hideGiftedWish,
    uploadWishImage,
    importWishImage,
    removeWishImage,
    clearWishImages,
    reorderWishImages,
    startImageChatIntent,
    importLink,
    previewListImport,
    commitListImport,
    getListImport,
    listGives,
    removeGive,
    cleanGives,
    search,
    openSharedList,
    listOwnerWishes,
    giveWish,
    getShare,
    publishShare,
    setShareUsername,
    setShareIndexing,
    rotateShare,
    stopShare,
    sendFeedback,
    getStats,
    listReleases,
    reportClientEvent
};

const BODY_GUARDS: Readonly<
    Record<ApiBodyKind, (() => MiddlewareHandler) | null>
> = {
    none: null,
    json: jsonBodyLimit,
    upload: uploadBodyLimit
};

const ROUTE_KEYS = Object.keys(APP_API_ROUTES) as AppApiRouteKey[];

const toApiRoute = (key: AppApiRouteKey): ApiRoute => {
    const spec = APP_API_ROUTES[key];

    return { key, ...spec, template: `${APP_API_PREFIX}${spec.path}` };
};

const withErrorEnvelope = (handler: ApiHandler): ApiHandler => {
    return async c => {
        try {
            return await handler(c);
        } catch (error) {
            return toApiErrorResponse(error);
        }
    };
};

/**
 * Mounts every `/api/app` endpoint from `APP_API_ROUTES` behind the envelope
 * (kill switch, headers, telemetry) and the per-route auth chain.
 */
export const registerAppApiRoutes = (
    app: WorkerApp,
    dependencies: AppApiDependencies = {}
) => {
    const api = new Hono<AppApiEnv>();

    api.use('*', createApiEnvelopeMiddleware(resolveApiDeps(dependencies)));

    for (const key of ROUTE_KEYS) {
        const route = toApiRoute(key);
        const guard = BODY_GUARDS[route.body];

        api.on(
            route.method,
            route.path,
            createAuthMiddleware(route, guard ? guard() : undefined),
            withErrorEnvelope(APP_API_HANDLERS[key])
        );
    }

    api.all('*', () => {
        return apiErrorResponse('notFound');
    });

    app.route(APP_API_PREFIX, api);
};
