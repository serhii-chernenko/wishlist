import { Effect } from 'effect';

import type { ApiCrypto } from '../../api/auth/crypto';
import type { AppLocale } from '../../bot/i18n';
import type {
    PublicShareFingerprint,
    Repositories
} from '../../db/repositories';
import { APP_THIRD_PARTY_GIFTED_LIMIT } from '../../shared/app-api';
import { toWishCurrency } from '../../shared/money';
import { toWishPriority } from '../../shared/priority';
import {
    buildShareWishPhotos,
    isSharePhotoPending
} from '../image-proxy/share-photos';
import type { WebTheme } from '../theme';
import type { ShareWishView } from './view-model';

export const loadShareGiftedWishes = async (input: {
    repositories: Pick<Repositories, 'wishes'>;
    share: Pick<PublicShareFingerprint, 'publicId' | 'userId' | 'showGifted'>;
    crypto: ApiCrypto;
    language: AppLocale;
    theme?: WebTheme;
}): Promise<ShareWishView[]> => {
    if (!input.share.showGifted) {
        return [];
    }

    const wishes = await Effect.runPromise(
        input.repositories.wishes.listGiftedVisibleOf(input.share.userId, {
            filter: null,
            limit: APP_THIRD_PARTY_GIFTED_LIMIT
        })
    );

    return Promise.all(
        wishes.map(async (wish): Promise<ShareWishView> => {
            const photos = await buildShareWishPhotos({
                crypto: input.crypto,
                language: input.language,
                publicId: input.share.publicId,
                ...(input.theme !== undefined && { theme: input.theme }),
                wish
            });

            return {
                title: wish.title,
                description: wish.description,
                link: wish.link,
                price: wish.price,
                currency: toWishCurrency(wish.currency),
                priority: toWishPriority(wish.priorityLevel),
                createdAt: wish.createdAt,
                updatedAt: wish.updatedAt,
                photos,
                gifted: true,
                ...(isSharePhotoPending(wish, photos) && {
                    photoPending: true
                })
            };
        })
    );
};
