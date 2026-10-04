import type { PublicShareFingerprint } from '../../db/repositories';
import type { Currency, ExchangeRates } from '../../shared/money';
import type { WebTheme } from '../theme';
import type { SharePageLanguage } from './public-id';
import type { WebCurrencyChoice } from './view-model';

export const FALLBACK_DEPLOY_ID = 'dev';

const FINGERPRINT_BYTES = 16;
const HOME_FINGERPRINT_KIND = 'home';

const bytesToHex = (bytes: Uint8Array) => {
    return Array.from(bytes, byte => {
        return byte.toString(16).padStart(2, '0');
    }).join('');
};

export const getDeployId = (env: {
    CF_VERSION_METADATA?: Partial<WorkerVersionMetadata> | undefined;
}) => {
    const deployId = env.CF_VERSION_METADATA?.id?.trim();

    return deployId ? deployId : FALLBACK_DEPLOY_ID;
};

export const resolvePublicUsername = (
    share: Pick<
        PublicShareFingerprint,
        'showUsername' | 'usernameSearchable' | 'username'
    >
) => {
    return share.showUsername && share.usernameSearchable
        ? share.username
        : null;
};

export const resolvePublicPayments = (
    share: Pick<PublicShareFingerprint, 'showPayments' | 'payments'>
) => {
    return share.showPayments ? share.payments : null;
};

/** The address is only ever served together with a visible phone, so a visible phone is the single condition for any delivery detail being available in Telegram. */
export const isDeliveryHintShown = (
    share: Pick<PublicShareFingerprint, 'showPhone' | 'hasPhone'>
) => {
    return share.showPhone && share.hasPhone;
};

export const isShareIndexable = (
    share: Pick<PublicShareFingerprint, 'allowIndexing' | 'visibleCount'>,
    isCanonicalHost: boolean
) => {
    return isCanonicalHost && share.allowIndexing && share.visibleCount > 0;
};

export interface ShareFingerprintInput {
    displayCurrency: Currency;
    showPayments: boolean;
    deliveryHintShown: boolean;
}

const digestFields = async (fields: readonly unknown[]) => {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(fields))
    );

    return bytesToHex(new Uint8Array(digest).slice(0, FINGERPRINT_BYTES));
};

export const computeHomeFingerprint = (
    deployId: string,
    language: SharePageLanguage
) => {
    return digestFields([HOME_FINGERPRINT_KIND, deployId, language]);
};

export const computeShareFingerprint = (
    deployId: string,
    language: SharePageLanguage,
    share: PublicShareFingerprint,
    rates: ExchangeRates,
    input: ShareFingerprintInput
) => {
    const fields = [
        deployId,
        language,
        input.displayCurrency,
        rates.date,
        rates.perUnit,
        share.publicId,
        share.shareUpdatedAt.getTime(),
        share.showUsername,
        share.allowIndexing,
        resolvePublicUsername(share),
        input.showPayments,
        resolvePublicPayments(share),
        input.deliveryHintShown,
        share.visibleCount,
        share.lastUpdatedAt?.getTime() ?? null
    ];

    return digestFields(fields);
};

export const variantFingerprint = (
    fingerprint: string,
    theme: WebTheme,
    currencyChoice: WebCurrencyChoice
) => {
    const themed = theme === 'system' ? fingerprint : `${fingerprint}-${theme}`;

    return currencyChoice === 'auto'
        ? themed
        : `${themed}-${currencyChoice.toLowerCase()}`;
};

export const etagMatches = (
    ifNoneMatch: string | null | undefined,
    fingerprint: string
) => {
    if (!ifNoneMatch) {
        return false;
    }

    return ifNoneMatch.split(',').some(candidate => {
        const trimmed = candidate.trim();

        if (trimmed === '*') {
            return true;
        }

        return (
            trimmed.replace(/^W\//, '').replace(/^"|"$/g, '') === fingerprint
        );
    });
};
