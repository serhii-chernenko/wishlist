export type TextSegment =
    | { kind: 'text'; text: string }
    | { kind: 'link'; text: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]”’]+$/;

const trimTrailingPunctuation = (candidate: string) => {
    const match = TRAILING_PUNCTUATION.exec(candidate);

    if (match === null) {
        return candidate;
    }

    let trimmed = candidate.slice(0, match.index);
    const tail = match[0];

    for (const character of tail) {
        const opens = (trimmed.match(/\(/g) ?? []).length;
        const closes = (trimmed.match(/\)/g) ?? []).length;

        if (character === ')' && opens > closes) {
            trimmed += character;
        } else {
            break;
        }
    }

    return trimmed;
};

const isHttpUrl = (value: string) => {
    try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

/** Splits plain text into text and http(s) link segments; sentence punctuation after a URL stays text, and everything else is left untouched (line breaks included). */
export const splitTextLinks = (text: string): TextSegment[] => {
    const segments: TextSegment[] = [];
    let cursor = 0;

    const pushText = (value: string) => {
        if (value === '') {
            return;
        }

        const previous = segments.at(-1);

        if (previous?.kind === 'text') {
            previous.text += value;
        } else {
            segments.push({ kind: 'text', text: value });
        }
    };

    for (const match of text.matchAll(URL_PATTERN)) {
        const start = match.index;
        const url = trimTrailingPunctuation(match[0]);

        pushText(text.slice(cursor, start));

        if (isHttpUrl(url)) {
            segments.push({ kind: 'link', text: url, href: url });
        } else {
            pushText(url);
        }

        cursor = start + url.length;
    }

    pushText(text.slice(cursor));

    return segments;
};
