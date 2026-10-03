import {
    APP_IMAGE_PATH_PREFIX,
    SHARE_IMAGE_PATH_PREFIX
} from '../../shared/app-api';
import type { WorkerApp } from '../../worker/app';

export interface ImageProxyRouteDependencies {
    now?: () => Date;
}

const NOT_IMPLEMENTED_STATUS = 501;

const IMAGE_SECURITY_HEADERS = {
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
} as const;

const notImplemented = () => {
    return new Response(null, {
        status: NOT_IMPLEMENTED_STATUS,
        headers: IMAGE_SECURITY_HEADERS
    });
};

export const registerImageProxyRoutes = (
    app: WorkerApp,
    _dependencies: ImageProxyRouteDependencies = {}
) => {
    app.get(`${APP_IMAGE_PATH_PREFIX}/*`, notImplemented);
    app.get(`${SHARE_IMAGE_PATH_PREFIX}/*`, notImplemented);
};
