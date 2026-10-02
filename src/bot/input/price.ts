import { PRICE_MAX_VALUE } from './limits';
import { isRemoveCommand } from './remove-command';

export type PriceParseResult =
    | { ok: true; value: number }
    | { ok: false; reason: 'invalid' };

const invisibleSpacesPattern = /[\s  ]+/g;
const leadingNumberPattern = /^\d+(?:\.\d+)?/;

export const parsePrice = (
    text: string | undefined,
    removeLabels: readonly string[]
): PriceParseResult => {
    if (isRemoveCommand(text, removeLabels)) {
        return { ok: true, value: 0 };
    }

    const normalized = (text ?? '')
        .replace(invisibleSpacesPattern, '')
        .replace(',', '.');
    const match = leadingNumberPattern.exec(normalized);

    if (!match) {
        return { ok: false, reason: 'invalid' };
    }

    const value = Math.round(Number.parseFloat(match[0]));

    if (!Number.isFinite(value) || value < 0 || value > PRICE_MAX_VALUE) {
        return { ok: false, reason: 'invalid' };
    }

    return { ok: true, value };
};
