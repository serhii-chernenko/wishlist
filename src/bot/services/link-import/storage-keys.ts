import { LINK_IMPORT_R2_PREFIX } from './types';

export const EXPIRES_AT_METADATA_KEY = 'expiresAt';

const META_FILE_NAME = 'meta.json';

export const importMetaKey = (urlHash: string) => {
    return `${LINK_IMPORT_R2_PREFIX}${urlHash}/${META_FILE_NAME}`;
};

export const importImageKey = (urlHash: string, index: number) => {
    return `${LINK_IMPORT_R2_PREFIX}${urlHash}/${index}`;
};

export const isLinkImportKey = (key: string) => {
    return key.startsWith(LINK_IMPORT_R2_PREFIX);
};

export const expiryMetadata = (expiresAt: number) => {
    return { [EXPIRES_AT_METADATA_KEY]: String(expiresAt) };
};
