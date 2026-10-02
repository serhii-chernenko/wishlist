import { PRICE_MAX_VALUE } from './limits';
import { isRemoveCommand } from './remove-command';

export type PriceParseResult =
    | { ok: true; value: number }
    | { ok: false; reason: 'invalid' };

const invisibleSpacesPattern = /[\s  ]+/g;
const groupedThousandsPattern = /^[1-9]\d{0,2}(?:[.,]\d{3})+(?!\d)/;
const groupedFractionPattern = /^[.,](\d{1,2})(?!\d)/;
const separatorsPattern = /[.,]/g;
const leadingNumberPattern = /^\d+(?:\.\d+)?/;

const readLeadingNumber = (normalized: string): number | null => {
    const grouped = groupedThousandsPattern.exec(normalized);

    if (grouped) {
        const integerPart = grouped[0].replace(separatorsPattern, '');
        const fraction = groupedFractionPattern.exec(
            normalized.slice(grouped[0].length)
        );

        return Number.parseFloat(
            fraction ? `${integerPart}.${fraction[1]}` : integerPart
        );
    }

    const match = leadingNumberPattern.exec(normalized.replace(',', '.'));

    return match ? Number.parseFloat(match[0]) : null;
};

export const parsePrice = (
    text: string | undefined,
    removeLabels: readonly string[]
): PriceParseResult => {
    if (isRemoveCommand(text, removeLabels)) {
        return { ok: true, value: 0 };
    }

    const parsed = readLeadingNumber(
        (text ?? '').replace(invisibleSpacesPattern, '')
    );

    if (parsed === null) {
        return { ok: false, reason: 'invalid' };
    }

    const value = Math.round(parsed);

    if (!Number.isFinite(value) || value < 0 || value > PRICE_MAX_VALUE) {
        return { ok: false, reason: 'invalid' };
    }

    return { ok: true, value };
};
