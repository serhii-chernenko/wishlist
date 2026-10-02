export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 500;
export const LINK_MAX_LENGTH = 2048;
export const PRICE_MAX_VALUE = 1_000_000_000;

export const cutText = (value: string, maxLength: number) => {
    const codePoints = Array.from(value);

    if (codePoints.length <= maxLength) {
        return value;
    }

    return codePoints.slice(0, maxLength).join('');
};

export const cutTitle = (value: string) => {
    return cutText(value, TITLE_MAX_LENGTH);
};

export const cutDescription = (value: string) => {
    return cutText(value, DESCRIPTION_MAX_LENGTH);
};
