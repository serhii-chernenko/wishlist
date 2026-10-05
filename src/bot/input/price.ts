import type { Currency } from '../../shared/money';
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

export const readPriceAmount = (text: string): number | null => {
    return readLeadingNumber(text.replace(invisibleSpacesPattern, ''));
};

export const parsePrice = (
    text: string | undefined,
    removeLabels: readonly string[]
): PriceParseResult => {
    if (isRemoveCommand(text, removeLabels)) {
        return { ok: true, value: 0 };
    }

    const parsed = readPriceAmount(text ?? '');

    if (parsed === null) {
        return { ok: false, reason: 'invalid' };
    }

    const value = Math.round(parsed);

    if (!Number.isFinite(value) || value < 0 || value > PRICE_MAX_VALUE) {
        return { ok: false, reason: 'invalid' };
    }

    return { ok: true, value };
};

export type PriceWithCurrencyParseResult =
    | { ok: true; value: number; currency: Currency | null }
    | { ok: false; reason: 'invalid' };

interface CurrencyMarker {
    currency: Currency;
    symbols: readonly string[];
    words: readonly string[];
}

const CURRENCY_MARKERS: readonly CurrencyMarker[] = [
    { currency: 'UAH', symbols: ['₴'], words: ['грн', 'грив', 'uah', 'hrn'] },
    { currency: 'USD', symbols: ['$'], words: ['usd', 'дол'] },
    { currency: 'EUR', symbols: ['€'], words: ['eur', 'євро', 'euro'] },
    { currency: 'PLN', symbols: ['zł'], words: ['zl', 'pln', 'зл'] }
];

const WORD_TAIL = '[\\p{L}.]*';

const escapeRegExp = (value: string) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const buildMarkerAlternation = (marker: CurrencyMarker) => {
    return [
        ...marker.symbols.map(escapeRegExp),
        ...marker.words.map(word => {
            return `${escapeRegExp(word)}${WORD_TAIL}`;
        })
    ].join('|');
};

const buildMarkerMatchers = (marker: CurrencyMarker) => {
    const alternation = buildMarkerAlternation(marker);

    return {
        currency: marker.currency,
        prefix: new RegExp(`^\\s*(?:${alternation})\\s*`, 'iu'),
        suffix: new RegExp(`\\s*(?:${alternation})\\s*$`, 'iu')
    };
};

const CURRENCY_MARKER_MATCHERS = CURRENCY_MARKERS.map(buildMarkerMatchers);

const stripCurrencyMarker = (text: string) => {
    for (const { currency, prefix, suffix } of CURRENCY_MARKER_MATCHERS) {
        if (prefix.test(text)) {
            return { currency, rest: text.replace(prefix, '') };
        }

        if (suffix.test(text)) {
            return { currency, rest: text.replace(suffix, '') };
        }
    }

    return { currency: null, rest: text };
};

export const parsePriceWithCurrency = (
    text: string | undefined,
    removeLabels: readonly string[]
): PriceWithCurrencyParseResult => {
    if (isRemoveCommand(text, removeLabels)) {
        return { ok: true, value: 0, currency: null };
    }

    const { currency, rest } = stripCurrencyMarker((text ?? '').trim());
    const parsed = parsePrice(rest, []);

    return parsed.ok
        ? { ok: true, value: parsed.value, currency }
        : { ok: false, reason: 'invalid' };
};
