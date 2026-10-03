import { Hono } from 'hono';

import type { AppApiDependencies } from '../api/context';
import { registerAppApiRoutes } from '../api/routes';
import { registerAppShellRoutes } from '../web/app-shell/route';
import {
    registerImageProxyRoutes,
    type ImageProxyRouteDependencies
} from '../web/image-proxy/route';
import {
    registerHomeRoutes,
    registerShareRoutes,
    type ShareRouteDependencies
} from '../web/routes';
import type { WorkerBindings } from './env';
import {
    registerAdminRoutes,
    type AdminRouteDependencies
} from './routes/admin';
import { registerHealthRoutes } from './routes/health';
import {
    registerTelegramRoutes,
    type TelegramRouteDependencies
} from './routes/telegram';

export type WorkerApp = Hono<{ Bindings: WorkerBindings }>;

export const createApp = (
    telegramDependencies: TelegramRouteDependencies = {},
    adminDependencies: AdminRouteDependencies = {},
    shareDependencies: ShareRouteDependencies = {},
    appApiDependencies: AppApiDependencies = {},
    imageProxyDependencies: ImageProxyRouteDependencies = {}
) => {
    const app = new Hono<{ Bindings: WorkerBindings }>();

    app.get('/status', c => {
        return c.json({
            service: 'wishlist',
            runtime: 'cloudflare-workers',
            status: 'runtime-ready'
        });
    });

    registerHealthRoutes(app, telegramDependencies);
    registerAdminRoutes(app, {
        ...(telegramDependencies.secretsMatch && {
            secretsMatch: telegramDependencies.secretsMatch
        }),
        ...adminDependencies
    });
    registerAppShellRoutes(app);
    registerAppApiRoutes(app, appApiDependencies);
    registerImageProxyRoutes(app, imageProxyDependencies);
    registerHomeRoutes(app, shareDependencies);
    registerShareRoutes(app, shareDependencies);
    registerTelegramRoutes(app, telegramDependencies);

    return app;
};
