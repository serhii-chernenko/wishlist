import { TITLE_MAX_LENGTH } from './limits';

export type TitleParseResult =
    | { ok: true; value: string }
    | { ok: false; reason: 'empty' | 'tooLong' | 'containsLink' };

export const parseTitle = (text: string | undefined): TitleParseResult => {
    const value = text?.trim() ?? '';

    if (!value) {
        return { ok: false, reason: 'empty' };
    }

    if (Array.from(value).length > TITLE_MAX_LENGTH) {
        return { ok: false, reason: 'tooLong' };
    }

    if (value.toLowerCase().includes('http')) {
        return { ok: false, reason: 'containsLink' };
    }

    return { ok: true, value };
};
