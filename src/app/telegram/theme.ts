import { settleNativeCall } from '../logic/native-call';
import {
    parseThemePreference,
    resolveColorScheme,
    THEME_STORAGE_KEY,
    type ThemePreference
} from '../logic/theme-preference';
import { createStore, type Store } from '../state/store';
import { callSafely, getLaunchContext, supports } from './sdk';
import type { ColorScheme, WebApp } from './types';

export const PAPER_COLORS = {
    light: '#f1e3fb',
    dark: '#1a1220'
} as const satisfies Record<ColorScheme, string>;

export const THEME_NAMES = {
    light: 'wishlist',
    dark: 'wishlist-dark'
} as const satisfies Record<ColorScheme, string>;

export const BOTTOM_BUTTON_COLORS = {
    color: '#f57aa6',
    textColor: '#000000'
} as const;

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

const readSystemScheme = (): ColorScheme => {
    try {
        return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
    } catch {
        return 'light';
    }
};

/** Telegram's light or dark, or the operating system's when the page runs outside Telegram. */
export const readColorScheme = (webApp: WebApp | null): ColorScheme => {
    if (webApp === null || webApp.initData === '') {
        return readSystemScheme();
    }

    return webApp.colorScheme === 'dark' ? 'dark' : 'light';
};

const paintDocument = (scheme: ColorScheme) => {
    const root = document.documentElement;

    root.dataset.theme = THEME_NAMES[scheme];
    document
        .querySelector(THEME_COLOR_SELECTOR)
        ?.setAttribute('content', PAPER_COLORS[scheme]);
};

const paintTelegramChrome = (webApp: WebApp, scheme: ColorScheme) => {
    const paper = PAPER_COLORS[scheme];

    if (supports(webApp, 'headerColor')) {
        callSafely(() => {
            webApp.setHeaderColor(paper);
        });
        callSafely(() => {
            webApp.setBackgroundColor(paper);
        });
    }

    if (supports(webApp, 'bottomBarColor')) {
        callSafely(() => {
            webApp.setBottomBarColor?.(paper);
        });
    }
};

const LOCAL_THEME_KEY = 'wl.theme';

const readLocalPreference = (): ThemePreference => {
    try {
        return parseThemePreference(
            window.localStorage.getItem(LOCAL_THEME_KEY)
        );
    } catch {
        return 'system';
    }
};

const writeLocalPreference = (preference: ThemePreference) => {
    try {
        window.localStorage.setItem(LOCAL_THEME_KEY, preference);
    } catch {
        return;
    }
};

/** The person's theme choice; `system` follows Telegram's light or dark. */
export const themePreference: Store<ThemePreference> =
    createStore<ThemePreference>(readLocalPreference());

let choiceMadeThisSession = false;

const getCloudStorage = () => {
    const { webApp } = getLaunchContext();

    return webApp !== null && supports(webApp, 'cloudStorage')
        ? (webApp.CloudStorage ?? null)
        : null;
};

export const getEffectiveScheme = (
    webApp: WebApp | null = getLaunchContext().webApp
): ColorScheme => {
    return resolveColorScheme(themePreference.get(), readColorScheme(webApp));
};

export const setThemePreference = (preference: ThemePreference) => {
    choiceMadeThisSession = true;
    themePreference.set(preference);
    writeLocalPreference(preference);

    const storage = getCloudStorage();

    if (storage !== null) {
        callSafely(() => {
            storage.setItem(THEME_STORAGE_KEY, preference);
        });
    }
};

/** Syncs the choice saved in Telegram CloudStorage (other devices) unless the person already changed it here. */
export const loadThemePreference = async () => {
    const storage = getCloudStorage();

    if (storage === null) {
        return;
    }

    const stored = await settleNativeCall<string | null>(settle => {
        storage.getItem(THEME_STORAGE_KEY, (error, value) => {
            settle(error === null ? (value ?? null) : null);
        });

        return true;
    }, null);

    if (stored !== null && stored !== '' && !choiceMadeThisSession) {
        const preference = parseThemePreference(stored);

        writeLocalPreference(preference);
        themePreference.set(preference);
    }
};

export const applyTheme = (webApp: WebApp | null) => {
    const scheme = getEffectiveScheme(webApp);

    paintDocument(scheme);

    if (webApp !== null) {
        paintTelegramChrome(webApp, scheme);
    }

    return scheme;
};

/** Our palette always wins: Telegram (or the person's explicit choice) only decides light or dark, never the colors. */
export const watchTheme = (
    webApp: WebApp | null,
    onChange?: (scheme: ColorScheme) => void
) => {
    applyTheme(webApp);

    const repaint = () => {
        const scheme = applyTheme(webApp);

        onChange?.(scheme);
    };
    const unsubscribe = themePreference.subscribe(repaint);

    if (webApp === null) {
        return unsubscribe;
    }

    const handleThemeChanged = () => {
        if (themePreference.get() === 'system') {
            repaint();
        }
    };

    webApp.onEvent('themeChanged', handleThemeChanged);

    return () => {
        unsubscribe();
        webApp.offEvent('themeChanged', handleThemeChanged);
    };
};
