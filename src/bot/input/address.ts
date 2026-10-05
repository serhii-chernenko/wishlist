import { countMeaningfulCharacters } from '../utils/strings';
import {
    ADDRESS_MAX_LENGTH,
    ADDRESS_MAX_LINES,
    ADDRESS_MIN_MEANINGFUL_CHARACTERS
} from './limits';

export type AddressRejection =
    | 'tooShort'
    | 'tooLong'
    | 'tooManyLines'
    | 'containsLink';

export type AddressParseResult =
    | { ok: true; value: string }
    | { ok: false; reason: AddressRejection };

const LINE_BREAK = /\r\n|\r|\n/;

const LINKED_DOMAIN_SUFFIXES = [
    'com',
    'net',
    'org',
    'info',
    'biz',
    'io',
    'me',
    'co',
    'ly',
    'gl',
    'gg',
    'to',
    'cc',
    'tv',
    'su',
    'ua',
    'pl',
    'ru',
    'by',
    'kz',
    'eu',
    'de',
    'uk',
    'us',
    'app',
    'dev',
    'shop',
    'store',
    'online',
    'site',
    'xyz',
    'top',
    'link',
    'page'
].join('|');

const WORD_START = '(?:^|[^\\p{L}\\d_])';
const WORD_END = '(?![\\p{L}\\d])';

const LINK_PATTERNS: readonly RegExp[] = [
    /[a-z][a-z\d+.-]*:\/\//iu,
    /https?:/iu,
    new RegExp(`${WORD_START}(?:www\\.|tg:)`, 'iu'),
    new RegExp(`${WORD_START}(?:t|telegram)\\.me${WORD_END}`, 'iu'),
    new RegExp(`${WORD_START}@[a-z\\d_]{3,}`, 'iu'),
    new RegExp(
        `${WORD_START}[a-z\\d-]+(?:\\.[a-z\\d-]+)*\\.(?:${LINKED_DOMAIN_SUFFIXES})${WORD_END}`,
        'iu'
    )
];

const containsLink = (value: string) => {
    return LINK_PATTERNS.some(pattern => {
        return pattern.test(value);
    });
};

export const normalizeAddress = (text: string) => {
    return text
        .split(LINE_BREAK)
        .map(line => {
            return line.trim();
        })
        .filter(line => {
            return line.length > 0;
        })
        .join('\n');
};

export const parseAddress = (
    text: string | null | undefined
): AddressParseResult => {
    const value = normalizeAddress(text ?? '');

    if (countMeaningfulCharacters(value) < ADDRESS_MIN_MEANINGFUL_CHARACTERS) {
        return { ok: false, reason: 'tooShort' };
    }

    if (Array.from(value).length > ADDRESS_MAX_LENGTH) {
        return { ok: false, reason: 'tooLong' };
    }

    if (value.split('\n').length > ADDRESS_MAX_LINES) {
        return { ok: false, reason: 'tooManyLines' };
    }

    if (containsLink(value)) {
        return { ok: false, reason: 'containsLink' };
    }

    return { ok: true, value };
};
