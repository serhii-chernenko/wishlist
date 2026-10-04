import { useState } from 'hono/jsx/dom';

import { PhotoPlaceholder } from './photo-placeholder';

/** A wish photo that swaps itself for the grey placeholder when the image cannot be loaded. */
export const PhotoFrame = ({ src, alt }: { src: string; alt: string }) => {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    return failedSrc === src ? (
        <PhotoPlaceholder label={alt} />
    ) : (
        <img
            src={src}
            alt={alt}
            loading='lazy'
            decoding='async'
            onError={() => {
                setFailedSrc(src);
            }}
        />
    );
};
