import type { User } from 'telegraf/types';

import {
    getPriceRange,
    toWishFilter,
    WISH_FILTERS
} from '../bot/content/filters';
import { DEFAULT_CURRENCY } from '../bot/content/intl';
import { getSupportLinks } from '../bot/content/support-links';
import { getTranslator, resolveAppLocale, type AppLocale } from '../bot/i18n';
import {
    cutDescription,
    cutTitle,
    truncateWithMark
} from '../bot/input/limits';
import { isRenderableLink } from '../bot/input/link';
import { parseWishImages } from '../bot/input/wish-images';
import type { GiverSummary } from '../bot/services/give-service';
import { canShowPublicUsername } from '../bot/services/share-service';
import {
    getStoredLanguageChoice,
    getVisibilityType
} from '../bot/services/user-service';
import type { ShareRecord, UserRecord, WishRecord } from '../db/repositories';
import { loadedLocales } from '../i18n/i18n-util';
import { loadLocale } from '../i18n/i18n-util.sync';
import {
    APP_IMAGE_HASH_LENGTH,
    APP_LIMITS,
    APP_THIRD_PARTY_PAYMENTS_MAX_LENGTH,
    type ApiImage,
    type AppDictionary,
    type AppLinkId,
    type BootstrapDto,
    type GiverSummaryDto,
    type MeDto,
    type OwnerDto,
    type OwnWishDto,
    type PageDto,
    type PriceFilterDto,
    type ShareDto,
    type ThirdWishDto
} from '../shared/app-api';
import type { WorkerBindings } from '../worker/env';
import { sha256Hex, type ApiCrypto } from './auth/crypto';
import type { Signer } from './auth/signing';
import { getNextOffset } from './validate';

const PHONE_MASK = '•• •••';
const PHONE_NATIONAL_DIGITS = 9;
const PHONE_VISIBLE_DIGITS = 4;
const WWW_PREFIX = 'www.';

export const getAppMessages = (locale: AppLocale): AppDictionary => {
    loadLocale(locale);

    const translation = loadedLocales[locale];

    if (!translation) {
        throw new Error(`Translations are not loaded for locale ${locale}`);
    }

    return translation.app as AppDictionary;
};

export const resolveRequestLocale = (
    actor: Pick<User, 'language_code'>,
    user: UserRecord | null,
    sessionLanguage: AppLocale | null
): AppLocale => {
    return resolveAppLocale(
        user ? user.language : sessionLanguage,
        actor.language_code ?? user?.telegramLanguageCode ?? null
    );
};

export const maskPhone = (phone: string | null) => {
    if (phone === null) {
        return null;
    }

    const digits = phone.replace(/\D/g, '');

    if (digits.length < PHONE_VISIBLE_DIGITS) {
        return PHONE_MASK;
    }

    const visible = digits.slice(-PHONE_VISIBLE_DIGITS);
    const country =
        digits.length > PHONE_NATIONAL_DIGITS
            ? digits.slice(0, digits.length - PHONE_NATIONAL_DIGITS)
            : '';
    const masked = `${PHONE_MASK} ${visible.slice(0, 2)} ${visible.slice(2)}`;

    return country ? `+${country} ${masked}` : masked;
};

export const getRenderableLink = (link: string | null) => {
    return isRenderableLink(link) ? link : null;
};

export const getLinkHost = (link: string | null) => {
    if (!isRenderableLink(link)) {
        return null;
    }

    const host = new URL(link).host;

    return host.startsWith(WWW_PREFIX) ? host.slice(WWW_PREFIX.length) : host;
};

export const toImageHash = async (crypto: ApiCrypto, fileId: string) => {
    return (await sha256Hex(crypto, fileId)).slice(0, APP_IMAGE_HASH_LENGTH);
};

export interface ImageMintingContext {
    crypto: ApiCrypto;
    signer: Signer;
    now: Date;
}

export const mintWishImages = (
    context: ImageMintingContext,
    wish: Pick<WishRecord, 'id' | 'images'>
): Promise<ApiImage[]> => {
    return Promise.all(
        parseWishImages(wish.images).map(async (fileId, index) => {
            const hash = await toImageHash(context.crypto, fileId);

            return {
                hash,
                url: await context.signer.buildImageUrl(
                    { wishId: wish.id, index, hash },
                    context.now
                )
            };
        })
    );
};

export const toOwnWishDto = (
    wish: WishRecord,
    images: ApiImage[]
): OwnWishDto => {
    const link = getRenderableLink(wish.link);

    return {
        id: wish.id,
        title: cutTitle(wish.title),
        description:
            wish.description === null ? null : cutDescription(wish.description),
        link,
        linkHost: getLinkHost(link),
        price: wish.price,
        priority: wish.priority,
        hidden: wish.hidden,
        images,
        createdAt: wish.createdAt.toISOString(),
        updatedAt: wish.updatedAt.toISOString()
    };
};

export const toGiverSummaryDto = (summary: GiverSummary): GiverSummaryDto => {
    switch (summary.kind) {
        case 'none':
            return { kind: 'none', count: 0 };
        case 'you':
            return { kind: 'you', count: 1 };
        case 'somebodyAndYou':
            return { kind: 'somebodyAndYou', count: summary.others };
        case 'somebody':
            return { kind: 'somebody', count: summary.count };
    }
};

export const toVisibleWishDto = (
    wish: WishRecord,
    images: ApiImage[]
): Omit<ThirdWishDto, 'givers'> => {
    const { hidden: _hidden, ...visible } = toOwnWishDto(wish, images);

    return visible;
};

export const toThirdWishDto = (
    wish: WishRecord,
    images: ApiImage[],
    givers: GiverSummary
): ThirdWishDto => {
    return {
        ...toVisibleWishDto(wish, images),
        givers: toGiverSummaryDto(givers)
    };
};

export const toThirdPartyPayments = (payments: string | null) => {
    return payments === null
        ? null
        : truncateWithMark(payments, APP_THIRD_PARTY_PAYMENTS_MAX_LENGTH);
};

export const toOwnerDto = (input: {
    owner: Pick<UserRecord, 'payments' | 'currency'>;
    token: string | null;
    label: string;
    source: OwnerDto['source'];
}): OwnerDto => {
    return {
        token: input.token,
        label: input.label,
        payments: toThirdPartyPayments(input.owner.payments),
        currency: input.owner.currency || DEFAULT_CURRENCY,
        source: input.source,
        canGive: input.token !== null
    };
};

export const toMeDto = (input: {
    actor: Pick<User, 'username'>;
    user: UserRecord | null;
    sessionLanguage: AppLocale | null;
    locale: AppLocale;
}): MeDto => {
    const { user } = input;

    return {
        registered: user !== null,
        visibility: getVisibilityType(user),
        telegramUsername: input.actor.username ?? null,
        phoneMasked: maskPhone(user?.phone ?? null),
        payments: user?.payments ?? null,
        currency: user?.currency || DEFAULT_CURRENCY,
        languageChoice: getStoredLanguageChoice(user, input.sessionLanguage),
        locale: input.locale,
        wishlistFilter: toWishFilter(user?.wishlistFilter),
        canShowPublicUsername:
            user === null ? false : canShowPublicUsername(user)
    };
};

export const toShareDto = (input: {
    state: ShareDto['state'];
    share: ShareRecord | null;
    url: string | null;
    appUrl: string | null;
    user: Pick<UserRecord, 'username' | 'usernameSearchable'>;
    consentName: string;
    host: string;
}): ShareDto => {
    return {
        state: input.state,
        url: input.state === 'shared' ? input.url : null,
        appUrl: input.state === 'shared' ? input.appUrl : null,
        showUsername: input.share?.showUsername ?? false,
        canShowUsername: canShowPublicUsername(input.user),
        consent: { name: input.consentName, host: input.host }
    };
};

export const toPageDto = <Item>(
    items: Item[],
    total: number,
    offset: number
): PageDto<Item> => {
    return {
        items,
        total,
        nextOffset: getNextOffset(offset, items.length, total)
    };
};

export const getPriceFilters = (): PriceFilterDto[] => {
    return WISH_FILTERS.map(filter => {
        return { filter, ...getPriceRange(filter) };
    });
};

const trimToNull = (value: string | undefined) => {
    const trimmed = value?.trim() ?? '';

    return trimmed.length > 0 ? trimmed : null;
};

export const getAppLinks = (
    env: WorkerBindings
): Record<AppLinkId, string | null> => {
    return {
        github: trimToNull(env.GITHUB_REPO_URL),
        princess: trimToNull(env.PRINCESS_TG_URL),
        youtube: trimToNull(env.YT_CHANNEL),
        telegram: trimToNull(env.TG_CHANNEL),
        x: trimToNull(env.AUTHOR_TWITTER_LINK)
    };
};

export const buildAppConfig = (
    env: WorkerBindings,
    locale: AppLocale
): BootstrapDto['config'] => {
    return {
        botUrl: env.WISHLIST_TG_URL,
        limits: APP_LIMITS,
        priceFilters: getPriceFilters(),
        supportLinks: getSupportLinks(env, getTranslator(locale)),
        links: getAppLinks(env)
    };
};
