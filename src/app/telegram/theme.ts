import { callSafely, supports } from './sdk';
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

export const readColorScheme = (webApp: WebApp | null): ColorScheme => {
    return webApp?.colorScheme === 'dark' ? 'dark' : 'light';
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

export const applyTheme = (webApp: WebApp | null) => {
    const scheme = readColorScheme(webApp);

    paintDocument(scheme);

    if (webApp !== null) {
        paintTelegramChrome(webApp, scheme);
    }

    return scheme;
};

/** Our palette always wins: Telegram only decides light or dark, never the colors. */
export const watchTheme = (
    webApp: WebApp | null,
    onChange?: (scheme: ColorScheme) => void
) => {
    applyTheme(webApp);

    if (webApp === null) {
        return () => undefined;
    }

    const handleThemeChanged = () => {
        onChange?.(applyTheme(webApp));
    };

    webApp.onEvent('themeChanged', handleThemeChanged);

    return () => {
        webApp.offEvent('themeChanged', handleThemeChanged);
    };
};
