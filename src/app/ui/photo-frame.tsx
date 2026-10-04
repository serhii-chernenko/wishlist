import { useState } from 'hono/jsx/dom';

import type { PhotoLoadingAttributes } from '../../shared/photo-loading';
import { PhotoPlaceholder } from './photo-placeholder';

const DEFAULT_LOADING: PhotoLoadingAttributes = {
    loading: 'lazy',
    decoding: 'async'
};

/** A wish photo that swaps itself for the grey placeholder when the image cannot be loaded. */
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

    return failedSrc === src ? (
        <PhotoPlaceholder label={alt} />
    ) : (
        <img
            src={src}
            alt={alt}
            {...loading}
            onError={() => {
                setFailedSrc(src);
            }}
        />
    );
};
