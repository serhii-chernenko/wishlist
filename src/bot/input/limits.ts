export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 500;
export const LINK_MAX_LENGTH = 2048;
export const PRICE_MAX_VALUE = 1_000_000_000;
export const PAYMENTS_MAX_LENGTH = 1000;
export const ADDRESS_MAX_LENGTH = 300;
export const ADDRESS_MIN_MEANINGFUL_CHARACTERS = 5;
export const ADDRESS_MAX_LINES = 6;
export const FEEDBACK_MAX_LENGTH = 2000;
export const FIND_QUERY_MAX_LENGTH = 64;
export const MAX_ACTIVE_WISHES_PER_USER = 500;
export const TRUNCATION_MARK = '…';

export const cutText = (value: string, maxLength: number) => {
    const codePoints = Array.from(value);

    if (codePoints.length <= maxLength) {
        return value;
    }

    return codePoints.slice(0, maxLength).join('');
};

export const truncateWithMark = (value: string, maxLength: number) => {
    if (Array.from(value).length <= maxLength) {
        return value;
    }

    return `${cutText(value, maxLength - 1)}${TRUNCATION_MARK}`;
};

export const cutTitle = (value: string) => {
    return cutText(value, TITLE_MAX_LENGTH);
};

export const cutDescription = (value: string) => {
    return cutText(value, DESCRIPTION_MAX_LENGTH);
};
