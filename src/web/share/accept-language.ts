import { isSharePageLanguage, type SharePageLanguage } from './public-id';

interface WeightedLanguageTag {
    primary: string;
    weight: number;
    position: number;
}

const parseWeight = (parameter: string | undefined) => {
    if (parameter === undefined) {
        return 1;
    }

    const match = /^\s*q\s*=\s*(\d(?:\.\d{0,3})?)\s*$/i.exec(parameter);

    return match?.[1] === undefined ? 0 : Number(match[1]);
};

const parseTags = (header: string): WeightedLanguageTag[] => {
    return header.split(',').flatMap((entry, position) => {
        const [rawTag = '', parameter] = entry.split(';');
        const primary = rawTag.trim().toLowerCase().split('-')[0] ?? '';
        const weight = parseWeight(parameter);

        return primary.length > 0 && weight > 0
            ? [{ primary, weight, position }]
            : [];
    });
};

export const matchAcceptLanguage = (
    header: string | null | undefined
): SharePageLanguage | null => {
    if (!header) {
        return null;
    }

    const ranked = parseTags(header).sort((left, right) => {
        return right.weight - left.weight || left.position - right.position;
    });

    for (const { primary } of ranked) {
        if (isSharePageLanguage(primary)) {
            return primary;
        }
    }

    return null;
};
