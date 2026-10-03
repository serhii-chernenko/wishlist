export const WEB_THEMES = ['system', 'light', 'dark'] as const;

export type WebTheme = (typeof WEB_THEMES)[number];

export type ExplicitWebTheme = Exclude<WebTheme, 'system'>;

export const THEME_COOKIE = 'theme';
export const THEME_PATH = '/theme';
export const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const DATA_THEME_BY_THEME = {
    light: 'wishlist',
    dark: 'wishlist-dark'
} as const satisfies Record<ExplicitWebTheme, string>;

const COOKIE_PAIR_SEPARATOR = /;\s*/;

export const isWebTheme = (value: unknown): value is WebTheme => {
    return WEB_THEMES.some(theme => theme === value);
};

/** Reads the visitor's explicit choice; anything missing or unknown means "follow the system". */
export const readThemeCookie = (cookieHeader: string | undefined): WebTheme => {
    for (const pair of (cookieHeader ?? '').split(COOKIE_PAIR_SEPARATOR)) {
        const separator = pair.indexOf('=');

        if (separator > 0 && pair.slice(0, separator).trim() === THEME_COOKIE) {
            const value = pair.slice(separator + 1).trim();

            return value === 'light' || value === 'dark' ? value : 'system';
        }
    }

    return 'system';
};

/** `data-theme` for the html element, or undefined so prefers-color-scheme decides. */
export const getDataTheme = (theme: WebTheme) => {
    return theme === 'system' ? undefined : DATA_THEME_BY_THEME[theme];
};

/** Separates per-theme copies in the page cache and in ETags; the system variant keeps the bare fingerprint. */
export const themedFingerprint = (fingerprint: string, theme: WebTheme) => {
    return theme === 'system' ? fingerprint : `${fingerprint}-${theme}`;
};

const SAFE_PATH = /^\/(?![/\\])[^\s\\]*$/;
const FALLBACK_PATH = '/';

/** Accepts only a same-origin relative path, so the switcher can never redirect off-site. */
export const toSafeBackPath = (back: string | undefined) => {
    if (back === undefined || !SAFE_PATH.test(back)) {
        return FALLBACK_PATH;
    }

    try {
        const base = 'https://wishlist.invalid';
        const url = new URL(back, base);

        return url.origin === base
            ? `${url.pathname}${url.search}`
            : FALLBACK_PATH;
    } catch {
        return FALLBACK_PATH;
    }
};

export const buildThemeCookie = (theme: WebTheme) => {
    const attributes = 'Path=/; SameSite=Lax; Secure';

    return theme === 'system'
        ? `${THEME_COOKIE}=; Max-Age=0; ${attributes}`
        : `${THEME_COOKIE}=${theme}; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; ${attributes}`;
};

export const buildThemeSwitchPath = (theme: WebTheme, back: string) => {
    const query = new URLSearchParams({ set: theme, back });

    return `${THEME_PATH}?${query.toString()}`;
};
