import {
    LINK_IMPORT_SHOPS,
    type LinkImportShop
} from '../../../shared/app-api';

const DEFAULT_SHOP: LinkImportShop = 'other';
const LABEL_SEPARATOR = '.';
const SECOND_LEVEL_SUFFIXES: ReadonlySet<string> = new Set([
    'com',
    'co',
    'net',
    'org'
]);

const registrableLabel = (labels: readonly string[]) => {
    const secondLevel = labels.at(-2);

    return secondLevel !== undefined && SECOND_LEVEL_SUFFIXES.has(secondLevel)
        ? labels.at(-3)
        : secondLevel;
};

/** Maps a hostname to the closed shop label used in telemetry; the host itself is never returned. */
export const resolveShop = (host: string): LinkImportShop => {
    const label = registrableLabel(host.toLowerCase().split(LABEL_SEPARATOR));

    return (
        LINK_IMPORT_SHOPS.find(shop => {
            return shop !== DEFAULT_SHOP && shop === label;
        }) ?? DEFAULT_SHOP
    );
};
