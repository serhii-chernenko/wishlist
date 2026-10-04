import { LINK_IMPORT_R2_PREFIX } from './types';

export const LINK_IMPORT_USAGE_PREFIX = `${LINK_IMPORT_R2_PREFIX}_usage/`;
export const EXPIRES_AT_METADATA_KEY = 'expiresAt';
export const TRANSFORM_METADATA_KEY = 'transform';

const META_FILE_NAME = 'meta.json';
const USAGE_FILE_EXTENSION = '.json';

export const importMetaKey = (urlHash: string) => {
    return `${LINK_IMPORT_R2_PREFIX}${urlHash}/${META_FILE_NAME}`;
};

export const importImageKey = (urlHash: string, index: number) => {
    return `${LINK_IMPORT_R2_PREFIX}${urlHash}/${index}`;
};

export const importUsageKey = (usageDate: string) => {
    return `${LINK_IMPORT_USAGE_PREFIX}${usageDate}${USAGE_FILE_EXTENSION}`;
};

export const isLinkImportKey = (key: string) => {
    return key.startsWith(LINK_IMPORT_R2_PREFIX);
};

export const expiryMetadata = (expiresAt: number) => {
    return { [EXPIRES_AT_METADATA_KEY]: String(expiresAt) };
};
