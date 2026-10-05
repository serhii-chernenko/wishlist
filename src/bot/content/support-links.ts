import type { TranslationFunctions } from '../../i18n/i18n-types';
import type { WorkerBindings } from '../../worker/env';

export const SUPPORT_LINK_IDS = [
    'monobank',
    'kofi',
    'paypal',
    'revolut'
] as const;

export type SupportLinkId = (typeof SUPPORT_LINK_IDS)[number];

export interface SupportLink {
    id: SupportLinkId;
    title: string;
    url: string;
}

export type SupportLinkEnv = Pick<
    WorkerBindings,
    'MONOBANK_URL' | 'KOFI_URL' | 'PAYPAL_URL' | 'REVOLUT_URL'
>;

const SUPPORT_LINK_ENV_KEYS = {
    monobank: 'MONOBANK_URL',
    kofi: 'KOFI_URL',
    paypal: 'PAYPAL_URL',
    revolut: 'REVOLUT_URL'
} as const satisfies Record<SupportLinkId, keyof SupportLinkEnv>;

export const getSupportLinks = (
    env: SupportLinkEnv,
    LL: TranslationFunctions
): SupportLink[] => {
    return SUPPORT_LINK_IDS.flatMap(id => {
        const url: string | undefined = env[SUPPORT_LINK_ENV_KEYS[id]];
        const trimmedUrl = url?.trim() ?? '';

        if (trimmedUrl.length === 0) {
            return [];
        }

        return [{ id, title: LL.donate.services[id].title(), url: trimmedUrl }];
    });
};
