import { LINK_IMPORT_URL_HASH_LENGTH } from '../../../shared/app-api';
import { CANONICAL_SHARE_HOST } from '../../../web/share/public-id';
import { LINK_MAX_LENGTH } from '../../input/limits';
import type {
    HashImportUrl,
    NormalizeImportUrl,
    NormalizedImportUrl
} from './types';

const FETCHABLE_PROTOCOL = 'https:';
const UPGRADABLE_PROTOCOL = 'http:';
const LABEL_SEPARATOR = '.';
const TRACKING_PARAM_PREFIX = 'utm_';
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
    'fbclid',
    'gclid',
    'ref',
    'srsltid',
    'yclid'
]);
const SECOND_LEVEL_SUFFIXES: ReadonlySet<string> = new Set([
    'com',
    'co',
    'net',
    'org'
]);
const BLOCKED_HOST_NAMES: ReadonlySet<string> = new Set([
    'localhost',
    'workers.dev',
    CANONICAL_SHARE_HOST
]);
const BLOCKED_HOST_SUFFIXES: readonly string[] = [
    '.localhost',
    '.local',
    '.internal',
    '.workers.dev',
    `.${CANONICAL_SHARE_HOST}`
];
const IPV4_LITERAL_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_LITERAL_PREFIX = '[';
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;

const stripTrailingDot = (hostname: string) => {
    return hostname.endsWith(LABEL_SEPARATOR)
        ? hostname.slice(0, -1)
        : hostname;
};

const isIpLiteral = (hostname: string) => {
    return (
        hostname.startsWith(IPV6_LITERAL_PREFIX) ||
        hostname.includes(':') ||
        IPV4_LITERAL_PATTERN.test(hostname)
    );
};

/** True when a hostname must never be fetched: IP literals, local names, single labels and our own hosts. */
export const isBlockedImportHost = (rawHostname: string) => {
    const hostname = stripTrailingDot(rawHostname.toLowerCase());

    if (hostname.length === 0 || !hostname.includes(LABEL_SEPARATOR)) {
        return true;
    }

    if (isIpLiteral(hostname) || BLOCKED_HOST_NAMES.has(hostname)) {
        return true;
    }

    return BLOCKED_HOST_SUFFIXES.some(suffix => {
        return hostname.endsWith(suffix);
    });
};

/** The rules every fetched URL, including each redirect hop, must pass: https on the default port, no userinfo, an allowed host. */
export const isFetchableImportUrl = (url: URL) => {
    return (
        url.protocol === FETCHABLE_PROTOCOL &&
        url.port === '' &&
        url.username === '' &&
        url.password === '' &&
        !isBlockedImportHost(url.hostname)
    );
};

export const registrableDomain = (host: string) => {
    const labels = stripTrailingDot(host.toLowerCase()).split(LABEL_SEPARATOR);
    const secondLevel = labels.at(-2);
    const keptLabels =
        secondLevel !== undefined &&
        SECOND_LEVEL_SUFFIXES.has(secondLevel) &&
        labels.length > 2
            ? 3
            : 2;

    return labels.slice(-keptLabels).join(LABEL_SEPARATOR);
};

const isTrackingParam = (name: string) => {
    const lowered = name.toLowerCase();

    return (
        lowered.startsWith(TRACKING_PARAM_PREFIX) ||
        TRACKING_PARAMS.has(lowered)
    );
};

const parseWithScheme = (raw: string) => {
    const candidate = SCHEME_PATTERN.test(raw)
        ? raw
        : `${FETCHABLE_PROTOCOL}//${raw}`;

    try {
        return new URL(candidate);
    } catch {
        return null;
    }
};

const stripTrackingParams = (url: URL) => {
    const trackingNames = [...url.searchParams.keys()].filter(isTrackingParam);

    for (const name of trackingNames) {
        url.searchParams.delete(name);
    }

    if (url.searchParams.toString() === '') {
        url.search = '';
    }
};

/**
 * Lower-cases the host, upgrades http to https, drops the fragment and the
 * known tracking parameters, and keeps every other parameter because shops
 * put variant ids there. Returns null for anything `isFetchableImportUrl`
 * rejects.
 */
export const normalizeImportUrl: NormalizeImportUrl = raw => {
    const trimmed = raw.trim();

    if (trimmed.length === 0 || trimmed.length > LINK_MAX_LENGTH) {
        return null;
    }

    const url = parseWithScheme(trimmed);

    if (url === null) {
        return null;
    }

    if (url.protocol === UPGRADABLE_PROTOCOL) {
        url.protocol = FETCHABLE_PROTOCOL;
    }

    url.hostname = stripTrailingDot(url.hostname);
    url.hash = '';
    stripTrackingParams(url);

    if (!isFetchableImportUrl(url)) {
        return null;
    }

    const normalized: NormalizedImportUrl = {
        url: url.href,
        host: url.hostname,
        registrableDomain: registrableDomain(url.hostname)
    };

    return normalized;
};

const toHex = (buffer: ArrayBuffer) => {
    return Array.from(new Uint8Array(buffer), byte => {
        return byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, '0');
    }).join('');
};

export const hashImportUrl: HashImportUrl = async normalizedUrl => {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(normalizedUrl)
    );

    return toHex(digest).slice(0, LINK_IMPORT_URL_HASH_LENGTH);
};
