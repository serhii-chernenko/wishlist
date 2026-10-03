import type { SharePageLanguage } from '../public-id';

export const WISH_DETAILS_LABEL = {
    uk: 'Детальніше',
    en: 'More details',
    pl: 'Szczegóły'
} as const satisfies Record<SharePageLanguage, string>;
