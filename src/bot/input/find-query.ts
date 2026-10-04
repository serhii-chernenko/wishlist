export const MIN_PHONE_SEARCH_DIGITS = 10;

export interface FindQuery {
    username: string | null;
    phoneDigits: string | null;
}

export const parseFindQuery = (text: string | undefined): FindQuery | null => {
    const raw = text?.trim() ?? '';

    if (!raw) {
        return null;
    }

    const username = raw.replaceAll('@', '').trim();
    const digits = raw.replace(/\D/g, '');

    return {
        username: username || null,
        phoneDigits: digits.length >= MIN_PHONE_SEARCH_DIGITS ? digits : null
    };
};
