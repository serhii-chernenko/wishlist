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

    if (value.toLowerCase().includes('http')) {
        return { ok: false, reason: 'containsLink' };
    }

    return { ok: true, value };
};
