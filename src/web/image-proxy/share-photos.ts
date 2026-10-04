import { parseWishImages } from '../../bot/input/wish-images';
import { getTranslator, type AppLocale } from '../../bot/i18n';
import type { ApiCrypto } from '../../api/auth/crypto';
import { getImageIdentity } from '../../api/photos/image-key';
import { SHARE_IMAGE_PATH_PREFIX } from '../../shared/app-api';
import { withImageTheme } from '../../shared/image-theme';
import type { WebTheme } from '../theme';
import type { ShareWishPhoto } from '../share/view-model';

export const buildShareImagePath = (
    publicId: string,
    wishId: number,
    index: number,
    hash: string
) => {
    return `${SHARE_IMAGE_PATH_PREFIX}/${publicId}/${wishId}/${index}/${hash}`;
};

export const buildShareWishPhotos = async (input: {
    crypto: ApiCrypto;
    language: AppLocale;
    publicId: string;
    theme?: WebTheme;
    wish: { id: number; images: string };
}): Promise<ShareWishPhoto[]> => {
    const LL = getTranslator(input.language);
    const fileIds = parseWishImages(input.wish.images);

    return Promise.all(
        fileIds.map(async (fileId, index) => {
            const { hash } = await getImageIdentity(input.crypto, fileId);

            const path = buildShareImagePath(
                input.publicId,
                input.wish.id,
                index,
                hash
            );

            return {
                url:
                    input.theme === undefined || input.theme === 'system'
                        ? path
                        : withImageTheme(path, input.theme),
                alt: LL.web.wish.photo({
                    index: index + 1,
                    total: fileIds.length
                })
            };
        })
    );
};
