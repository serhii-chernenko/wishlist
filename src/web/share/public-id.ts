export const SHARE_PAGE_LANGUAGES = ['uk', 'en', 'pl'] as const;

export type SharePageLanguage = (typeof SHARE_PAGE_LANGUAGES)[number];

export const SHARE_PUBLIC_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/;

export const CANONICAL_SHARE_HOST = 'wishlist.chernenko.dev';

const SHARE_PATH_SEGMENT = 'w';

export const isSharePageLanguage = (
    value: string | undefined
): value is SharePageLanguage => {
    return SHARE_PAGE_LANGUAGES.some(language => language === value);
};

export const isValidSharePublicId = (value: string) => {
    return SHARE_PUBLIC_ID_PATTERN.test(value);
};

export const normalizeSharePublicId = (value: string) => {
    const lowercase = value.toLowerCase();

    return isValidSharePublicId(lowercase) ? lowercase : null;
};

export const buildSharePath = (
    publicId: string,
    language?: SharePageLanguage
) => {
    const sharePath = `/${SHARE_PATH_SEGMENT}/${encodeURIComponent(publicId)}`;

    return language === undefined ? sharePath : `/${language}${sharePath}`;
};

export const buildShareUrl = (
    origin: string,
    publicId: string,
    language?: SharePageLanguage
) => {
    return new URL(buildSharePath(publicId, language), origin).toString();
};
