export const START_PARAM_MAX_LENGTH = 64;

export const APP_SHELL_PATH = '/app';

export const START_SCREENS = [
    'wishes',
    'add',
    'gives',
    'find',
    'share',
    'settings',
    'visibility',
    'payments',
    'language',
    'feedback',
    'stats',
    'donate',
    'releases',
    'about'
] as const;

export type StartScreen = (typeof START_SCREENS)[number];

export type StartTarget =
    | { kind: 'screen'; screen: StartScreen }
    | { kind: 'wish'; wishId: number }
    | { kind: 'share'; publicId: string };

export type StartKind = 'none' | StartTarget['kind'];

const START_PARAM_PATTERN = /^[A-Za-z0-9_-]+$/;
const WISH_START_PATTERN = /^w_([1-9]\d{0,15})$/;
const SHARE_START_PATTERN = /^s_([0-9a-hjkmnp-tv-z]{26})$/;
const WISH_START_PREFIX = 'w_';
const SHARE_START_PREFIX = 's_';

export const isValidStartParam = (value: string) => {
    return (
        value.length > 0 &&
        value.length <= START_PARAM_MAX_LENGTH &&
        START_PARAM_PATTERN.test(value)
    );
};

const isStartScreen = (value: string): value is StartScreen => {
    return START_SCREENS.some(screen => screen === value);
};

export const parseStartParam = (
    value: string | null | undefined
): StartTarget | null => {
    if (typeof value !== 'string' || !isValidStartParam(value)) {
        return null;
    }

    if (isStartScreen(value)) {
        return { kind: 'screen', screen: value };
    }

    const wishId = WISH_START_PATTERN.exec(value)?.[1];

    if (wishId !== undefined) {
        const parsed = Number(wishId);

        return Number.isSafeInteger(parsed)
            ? { kind: 'wish', wishId: parsed }
            : null;
    }

    const publicId = SHARE_START_PATTERN.exec(value)?.[1];

    return publicId === undefined ? null : { kind: 'share', publicId };
};

export const getStartKind = (value: string | null | undefined): StartKind => {
    return parseStartParam(value)?.kind ?? 'none';
};

export const formatStartParam = (target: StartTarget) => {
    if (target.kind === 'screen') {
        return target.screen;
    }

    if (target.kind === 'wish') {
        return `${WISH_START_PREFIX}${target.wishId}`;
    }

    return `${SHARE_START_PREFIX}${target.publicId}`;
};

const trimTrailingSlashes = (value: string) => {
    return value.replace(/\/+$/, '');
};

const toValidStartParam = (start: string | null | undefined) => {
    return typeof start === 'string' && isValidStartParam(start) ? start : null;
};

export const buildAppUrl = (origin: string, start?: string | null) => {
    const validStart = toValidStartParam(start);
    const base = `${trimTrailingSlashes(origin)}${APP_SHELL_PATH}`;

    return validStart === null ? base : `${base}?start=${validStart}`;
};

export const buildMainAppLink = (botUrl: string, start?: string | null) => {
    const validStart = toValidStartParam(start);
    const base = trimTrailingSlashes(botUrl);

    return validStart === null
        ? `${base}?startapp`
        : `${base}?startapp=${validStart}`;
};

export const buildShareAppLink = (
    botUrl: string | null | undefined,
    publicId: string
) => {
    if (typeof botUrl !== 'string' || botUrl.trim() === '') {
        return null;
    }

    return buildMainAppLink(
        botUrl.trim(),
        formatStartParam({ kind: 'share', publicId })
    );
};
