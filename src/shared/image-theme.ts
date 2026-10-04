import { APP_IMAGE_PATH_PREFIX, SHARE_IMAGE_PATH_PREFIX } from './app-api';
import type { PlaceholderTheme } from './photo-placeholder';

export const IMAGE_THEME_PARAM = 't';

const THEMED_PATH_PREFIXES = [
    `${APP_IMAGE_PATH_PREFIX}/`,
    `${SHARE_IMAGE_PATH_PREFIX}/`
] as const;
const PARSE_BASE = 'https://image.invalid';

export const parseImageTheme = (
    raw: string | null | undefined
): PlaceholderTheme | undefined => {
    return raw === 'light' || raw === 'dark' ? raw : undefined;
};

/**
 * Tells the image proxy which palette its fallback placeholder should use. The parameter is advisory: it is never part of a signed payload, so a signed `/img/w` URL stays valid with or without it. Other URLs (blob previews, `/img/i`) are returned untouched.
 */
export const withImageTheme = (url: string, theme: PlaceholderTheme) => {
    if (
        !THEMED_PATH_PREFIXES.some(prefix => {
            return url.startsWith(prefix);
        })
    ) {
        return url;
    }

    const parsed = new URL(url, PARSE_BASE);

    parsed.searchParams.set(IMAGE_THEME_PARAM, theme);

    return `${parsed.pathname}${parsed.search}`;
};
