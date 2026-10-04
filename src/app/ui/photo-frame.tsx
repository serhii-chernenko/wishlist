import { useState } from 'hono/jsx/dom';

import { withImageTheme } from '../../shared/image-theme';
import type { PhotoLoadingAttributes } from '../../shared/photo-loading';
import { getEffectiveScheme } from '../telegram/theme';
import { PhotoPlaceholder } from './photo-placeholder';

const DEFAULT_LOADING: PhotoLoadingAttributes = {
    loading: 'lazy',
    decoding: 'async'
};

/** A wish photo that swaps itself for the grey placeholder when the image cannot be loaded; the theme it was mounted with rides on the proxy URL so the proxy's own fallback matches. */
export const PhotoFrame = ({
    src,
    alt,
    loading = DEFAULT_LOADING
}: {
    src: string;
    alt: string;
    loading?: PhotoLoadingAttributes;
}) => {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const [scheme] = useState(getEffectiveScheme);

    return failedSrc === src ? (
        <PhotoPlaceholder label={alt} />
    ) : (
        <img
            src={withImageTheme(src, scheme)}
            alt={alt}
            {...loading}
            onError={() => {
                setFailedSrc(src);
            }}
        />
    );
};
