import { extractLink } from '../../bot/input/link';
import { LINK_MAX_LENGTH } from '../../bot/input/limits';
import { getLocaleTag } from '../../bot/content/intl';
import {
    LINK_IMPORT_PRESELECTED_IMAGES,
    type AppLocale,
    type LinkImportDto,
    type LinkImportOutcome,
    type LinkImportSourcePriceDto
} from '../../shared/app-api';
import type { Currency } from '../../shared/money';
import { getFieldErrors, type AppFailure } from './errors';
import { getLinkHost } from './format';
import {
    draftFromImport,
    draftWithLinkOnly,
    type WishDraft
} from './wish-draft';

export type ImportFailureReason =
    | 'blocked'
    | 'notProduct'
    | 'timeout'
    | 'rateLimited'
    | 'disabled';

export type ImportNote =
    | { kind: 'filled'; host: string }
    | { kind: 'partial'; host: string }
    | { kind: 'failed'; reason: ImportFailureReason };

export interface ImportTarget {
    url: string;
    host: string;
}

export interface ImportImageSource {
    importToken: string;
    index: number;
    previewUrl: string;
}

export interface ImportStart {
    draft: WishDraft;
    note: ImportNote | null;
    sourcePrice: LinkImportSourcePriceDto | null;
    images: readonly ImportImageSource[];
}

export type ImportFailureKind =
    | 'invalidUrl'
    | 'disabled'
    | 'rateLimited'
    | 'other';

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const WHITESPACE_PATTERN = /\s/;
const IPV4_HOST_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const NON_BREAKING_SPACE = ' ';
const SOURCE_PRICE_MAX_FRACTION_DIGITS = 2;

const resolveCandidate = (text: string) => {
    const trimmed = text.trim();
    const link = extractLink(trimmed);

    if (link !== null) {
        return link;
    }

    return trimmed !== '' &&
        !WHITESPACE_PATTERN.test(trimmed) &&
        !SCHEME_PATTERN.test(trimmed)
        ? `https://${trimmed}`
        : null;
};

const isPublicHostname = (hostname: string) => {
    return (
        hostname.includes('.') &&
        !hostname.startsWith('[') &&
        !hostname.endsWith('.') &&
        !IPV4_HOST_PATTERN.test(hostname)
    );
};

/** Reads a pasted product link, tolerating a missing scheme and surrounding text; null until it looks like a public http(s) address. */
export const parseImportTarget = (text: string): ImportTarget | null => {
    const candidate = resolveCandidate(text);

    if (candidate === null || candidate.length > LINK_MAX_LENGTH) {
        return null;
    }

    try {
        const url = new URL(candidate);
        const host = getLinkHost(candidate);

        return (url.protocol === 'https:' || url.protocol === 'http:') &&
            url.username === '' &&
            url.password === '' &&
            host !== null &&
            isPublicHostname(url.hostname)
            ? { url: candidate, host }
            : null;
    } catch {
        return null;
    }
};

export const noteForOutcome = (
    outcome: LinkImportOutcome,
    host: string
): ImportNote | null => {
    switch (outcome) {
        case 'ok':
            return { kind: 'filled', host };
        case 'partial':
            return { kind: 'partial', host };
        case 'invalidUrl':
            return null;
        default:
            return { kind: 'failed', reason: outcome };
    }
};

const isFilledOutcome = (outcome: LinkImportOutcome) => {
    return outcome === 'ok' || outcome === 'partial';
};

export const importImageSources = (
    result: Pick<LinkImportDto, 'importToken' | 'images'>,
    limit = LINK_IMPORT_PRESELECTED_IMAGES
): ImportImageSource[] => {
    const { importToken } = result;

    if (importToken === null) {
        return [];
    }

    return result.images.slice(0, limit).map(image => {
        return {
            importToken,
            index: image.index,
            previewUrl: image.url
        };
    });
};

export const linkOnlyStart = (
    link: string,
    currency: Currency,
    reason: ImportFailureReason | null
): ImportStart => {
    return {
        draft: draftWithLinkOnly(link, currency),
        note: reason === null ? null : { kind: 'failed', reason },
        sourcePrice: null,
        images: []
    };
};

/** The editor's starting point for an import answer; null when the server rejected the link itself. */
export const startFromResult = (
    result: LinkImportDto,
    target: ImportTarget,
    currency: Currency
): ImportStart | null => {
    const note = noteForOutcome(result.outcome, target.host);

    if (note === null) {
        return null;
    }

    if (!isFilledOutcome(result.outcome)) {
        return linkOnlyStart(
            target.url,
            currency,
            note.kind === 'failed' ? note.reason : null
        );
    }

    return {
        draft: draftFromImport(
            { ...result.draft, link: result.draft.link || target.url },
            currency
        ),
        note,
        sourcePrice: result.sourcePrice,
        images: importImageSources(result)
    };
};

const failureCode = (failure: AppFailure) => {
    return failure.kind === 'api' ? failure.code : null;
};

export const classifyImportFailure = (
    failure: AppFailure
): ImportFailureKind => {
    if (getFieldErrors(failure).url !== undefined) {
        return 'invalidUrl';
    }

    const code = failureCode(failure);

    if (code === 'disabled' || code === 'rateLimited') {
        return code;
    }

    return 'other';
};

export const formatSourcePrice = (
    sourcePrice: LinkImportSourcePriceDto,
    locale: AppLocale
) => {
    const amount = new Intl.NumberFormat(getLocaleTag(locale), {
        maximumFractionDigits: SOURCE_PRICE_MAX_FRACTION_DIGITS
    }).format(sourcePrice.amount);

    return `${amount}${NON_BREAKING_SPACE}${sourcePrice.currency}`;
};
