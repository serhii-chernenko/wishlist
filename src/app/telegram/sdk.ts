import { toAppPlatform, type AppPlatform } from '../../shared/app-api';
import type { WebApp } from './types';

export const MIN_SUPPORTED_VERSION = '6.9';

const FEATURE_VERSIONS = {
    backButton: '6.1',
    haptics: '6.1',
    popup: '6.2',
    closingConfirmation: '6.2',
    headerColor: '6.9',
    writeAccess: '6.9',
    contact: '6.9',
    settingsButton: '7.0',
    verticalSwipes: '7.7',
    bottomBarColor: '7.10',
    bottomButton: '7.10',
    activated: '8.0',
    safeArea: '8.0'
} as const;

export type TelegramFeature = keyof typeof FEATURE_VERSIONS;

export interface LaunchContext {
    webApp: WebApp | null;
    initData: string;
    startParam: string | null;
    platform: AppPlatform;
    version: string;
    native: boolean;
}

const START_QUERY_PARAM = 'start';
const UNKNOWN_VERSION = '0';

export const getWebApp = (): WebApp | null => {
    return window.Telegram?.WebApp ?? null;
};

const readQueryStart = () => {
    try {
        return new URLSearchParams(window.location.search).get(
            START_QUERY_PARAM
        );
    } catch {
        return null;
    }
};

export const readLaunchContext = (): LaunchContext => {
    const webApp = getWebApp();
    const platform = toAppPlatform(webApp?.platform);

    return {
        webApp,
        initData: webApp?.initData ?? '',
        startParam:
            webApp?.initDataUnsafe.start_param ?? readQueryStart() ?? null,
        platform,
        version: webApp?.version ?? UNKNOWN_VERSION,
        native: webApp !== null && platform !== 'unknown'
    };
};

let cachedLaunch: LaunchContext | null = null;

export const getLaunchContext = (): LaunchContext => {
    cachedLaunch ??= readLaunchContext();

    return cachedLaunch;
};

export const isNativeShell = () => {
    return getLaunchContext().native;
};

export const isVersionAtLeast = (webApp: WebApp | null, version: string) => {
    if (webApp === null) {
        return false;
    }

    try {
        return webApp.isVersionAtLeast(version);
    } catch {
        return false;
    }
};

export const supports = (webApp: WebApp | null, feature: TelegramFeature) => {
    return isVersionAtLeast(webApp, FEATURE_VERSIONS[feature]);
};

export const isSupportedClient = (webApp: WebApp | null) => {
    return isVersionAtLeast(webApp, MIN_SUPPORTED_VERSION);
};

export const supportsNative = (feature: TelegramFeature) => {
    const { webApp, native } = getLaunchContext();

    return native && supports(webApp, feature);
};

export const callSafely = (action: () => void) => {
    try {
        action();
    } catch {
        return;
    }
};
