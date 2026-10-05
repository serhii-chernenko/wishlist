import { DESCRIPTION_MAX_LENGTH } from './limits';
import { isRemoveCommand } from './remove-command';

export type DescriptionParseResult =
    | { ok: true; value: string | null }
    | { ok: false; reason: 'empty' | 'tooLong' };

export const parseDescription = (
    text: string | undefined,
    removeLabels: readonly string[]
): DescriptionParseResult => {
    if (isRemoveCommand(text, removeLabels)) {
        return { ok: true, value: null };
    }

    const value = text?.trim() ?? '';

    if (!value) {
        return { ok: false, reason: 'empty' };
    }

    if (Array.from(value).length > DESCRIPTION_MAX_LENGTH) {
        return { ok: false, reason: 'tooLong' };
    }

    return { ok: true, value };
};
