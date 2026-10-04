import type { PublicShareFingerprint } from '../../db/repositories';
import { getDisplayCurrency, type ExchangeRates } from '../../shared/money';
import type { SharePageLanguage } from './public-id';

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
    rates: ExchangeRates
) => {
    const fields = [
        deployId,
        language,
        getDisplayCurrency(language),
        rates.date,
        rates.perUnit,
        share.publicId,
        share.shareUpdatedAt.getTime(),
        share.showUsername,
        resolvePublicUsername(share),
        share.payments,
        share.currency,
        share.visibleCount,
        share.lastUpdatedAt?.getTime() ?? null
    ];

    return digestFields(fields);
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
