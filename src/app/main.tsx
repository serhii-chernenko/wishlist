import { render } from 'hono/jsx/dom';

import type { AppLocale, BootstrapDto } from '../shared/app-api';
import { createApiClient, ApiRequestError } from './api/client';
import { createAppServices, Root, type RootPhase } from './app';
import { resolveSystemLocale } from './i18n/system-texts';
import { flushPendingOnHide } from './logic/countdown';
import { toSystemScreen } from './logic/errors';
import { createStore } from './state/store';
import { connectBottomButton } from './telegram/buttons';
import {
    expandApp,
    markAppReady,
    watchActivation,
    watchViewport
} from './telegram/lifecycle';
import { getLaunchContext, isSupportedClient } from './telegram/sdk';
import {
    getEffectiveScheme,
    loadThemePreference,
    watchTheme
} from './telegram/theme';

if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, 'at', {
        configurable: true,
        writable: true,
        value(this: unknown[], index: number) {
            const position = Math.trunc(index) || 0;

            return this[position < 0 ? this.length + position : position];
        }
    });
}

const DEFAULT_BOT_URL = 'https://t.me/wishlist_ua_bot';

const readSystemLocale = (): AppLocale => {
    const { webApp } = getLaunchContext();

    return resolveSystemLocale(
        webApp?.initDataUnsafe.user?.language_code ?? navigator.language
    );
};

const start = (container: HTMLElement) => {
    const launch = getLaunchContext();
    const phase = createStore<RootPhase>({ kind: 'loading' });
    const online = createStore(navigator.onLine);
    let botUrl = container.dataset.botUrl || DEFAULT_BOT_URL;
    let locale = readSystemLocale();
    let mounted = false;

    const mount = () => {
        if (mounted) {
            return;
        }

        mounted = true;
        container.replaceChildren();
        render(
            <Root
                phase={phase}
                getLocale={() => locale}
                botUrl={() => botUrl}
                onRetry={() => {
                    void boot();
                }}
            />,
            container
        );
        markAppReady();
    };

    const api = createApiClient({
        initData: launch.initData,
        onSystemFailure: screen => {
            phase.set({ kind: 'system', screen });
            mount();
        },
        onConnectivity: isOnline => {
            online.set(isOnline);
        }
    });

    const loadBootstrap = (): Promise<BootstrapDto> => {
        return api.request('bootstrap', {
            query: {
                platform: launch.platform,
                version: launch.version,
                theme: getEffectiveScheme(launch.webApp),
                ...(launch.startParam !== null && { start: launch.startParam })
            }
        });
    };

    const boot = async () => {
        phase.set({ kind: 'loading' });

        try {
            const bootstrap = await loadBootstrap();

            locale = bootstrap.me.locale;
            botUrl = bootstrap.config.botUrl || botUrl;
            phase.set({
                kind: 'ready',
                ...createAppServices({
                    launch,
                    api,
                    bootstrap,
                    online,
                    loadBootstrap
                })
            });
        } catch (error) {
            const screen =
                error instanceof ApiRequestError
                    ? toSystemScreen(error.failure)
                    : null;

            phase.set(
                screen === null
                    ? { kind: 'bootError' }
                    : { kind: 'system', screen }
            );
        }

        mount();
    };

    watchTheme(launch.webApp);
    void loadThemePreference();
    watchViewport();
    expandApp();
    connectBottomButton();
    window.addEventListener('offline', () => {
        online.set(false);
    });
    window.addEventListener('online', () => {
        online.set(true);
    });
    flushPendingOnHide(document, window);
    watchActivation(() => {
        const current = phase.get();

        if (current.kind === 'ready') {
            current.services.revalidate();
        }
    });

    if (launch.webApp === null || launch.initData === '') {
        phase.set({ kind: 'system', screen: 'outsideTelegram' });
        mount();

        return;
    }

    if (!isSupportedClient(launch.webApp)) {
        phase.set({ kind: 'system', screen: 'unsupported' });
        mount();
        api.request('reportClientEvent', {
            body: { kind: 'sdkUnsupported', screen: 'unsupported' }
        }).catch(() => undefined);

        return;
    }

    void boot();
};

const root = document.getElementById('root');

if (root !== null) {
    start(root);
}
