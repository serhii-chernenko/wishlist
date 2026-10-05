const NON_DIGITS = /\D/g;
const GENERIC_GROUP_SIZE = 3;

interface CountryPhoneLayout {
    countryCode: string;
    totalDigits: number;
    groups: readonly number[];
}

const COUNTRY_PHONE_LAYOUTS: readonly CountryPhoneLayout[] = [
    { countryCode: '380', totalDigits: 12, groups: [2, 3, 2, 2] },
    { countryCode: '48', totalDigits: 11, groups: [3, 3, 3] }
];

const toPhoneDigits = (phone: string) => {
    return phone.replace(NON_DIGITS, '');
};

const splitByGroups = (digits: string, groups: readonly number[]) => {
    const parts: string[] = [];
    let start = 0;

    for (const size of groups) {
        parts.push(digits.slice(start, start + size));
        start += size;
    }

    return parts;
};

const splitEvenly = (digits: string) => {
    const parts: string[] = [];

    for (let start = 0; start < digits.length; start += GENERIC_GROUP_SIZE) {
        parts.push(digits.slice(start, start + GENERIC_GROUP_SIZE));
    }

    return parts;
};

const findLayout = (digits: string) => {
    return COUNTRY_PHONE_LAYOUTS.find(layout => {
        return (
            digits.length === layout.totalDigits &&
            digits.startsWith(layout.countryCode)
        );
    });
};

export const formatPhone = (phone: string): string | null => {
    const digits = toPhoneDigits(phone);

    if (digits.length === 0) {
        return null;
    }

    const layout = findLayout(digits);

    if (layout === undefined) {
        return `+${splitEvenly(digits).join(' ')}`;
    }

    const national = digits.slice(layout.countryCode.length);

    return [
        `+${layout.countryCode}`,
        ...splitByGroups(national, layout.groups)
    ].join(' ');
};

export const buildPhoneHref = (phone: string): string | null => {
    const digits = toPhoneDigits(phone);

    return digits.length === 0 ? null : `tel:+${digits}`;
};
