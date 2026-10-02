import { LINK_MAX_LENGTH } from './limits';
import { isRemoveCommand } from './remove-command';

export type LinkParseResult =
    | { ok: true; value: string | null }
    | { ok: false; reason: 'invalid' };

const linkPattern = /https?:\/\/\S+/i;

export const extractLink = (text: string | undefined) => {
    const match = linkPattern.exec(text ?? '');

    if (!match || match[0].length > LINK_MAX_LENGTH) {
        return null;
    }

    try {
        const url = new URL(match[0]);

        return url.protocol === 'http:' || url.protocol === 'https:'
            ? match[0]
            : null;
    } catch {
        return null;
    }
};

export const parseLink = (
    text: string | undefined,
    removeLabels: readonly string[]
): LinkParseResult => {
    if (isRemoveCommand(text, removeLabels)) {
        return { ok: true, value: null };
    }

    const link = extractLink(text);

    return link ? { ok: true, value: link } : { ok: false, reason: 'invalid' };
};
