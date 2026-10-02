const restrictSymbols = [
    {
        symbol: '<3',
        replace: '❤️'
    }
] as const;

const PAYMENTS_IGNORED_CHARACTERS = /\s+|[.,/\-_!?&]/g;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
};

export const escapeUserLabel = (value: string) => {
    let result = value;

    for (const { symbol, replace } of restrictSymbols) {
        result = result.replace(symbol, replace);
    }

    return result;
};

export const escapeHtml = (value: string) => {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
};

export const replaceTemplate = (
    value: string,
    replacements: Record<string, string>
) => {
    let result = value;

    for (const [token, replacement] of Object.entries(replacements)) {
        result = result.replaceAll(token, replacement);
    }

    return result;
};

/**
 * Length of the text Telegram renders from an HTML message, which is what the
 * 1024-character caption and 4096-character message limits are measured on.
 */
export const getVisibleHtmlLength = (html: string) => {
    return htmlToPlainText(html).length;
};

export const countMeaningfulCharacters = (value: string) => {
    return value.replace(PAYMENTS_IGNORED_CHARACTERS, '').length;
};

export const stripNonDigits = (value: string) => {
    return value.replace(/\D/g, '');
};

export const htmlToPlainText = (html: string) => {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&(amp|lt|gt|quot|#39);/g, entity => {
            return HTML_ENTITIES[entity] ?? entity;
        });
};

export const truncateText = (value: string, maxLength: number) => {
    const characters = Array.from(value);

    if (characters.length <= maxLength) {
        return value;
    }

    return `${characters.slice(0, Math.max(0, maxLength - 1)).join('')}…`;
};
