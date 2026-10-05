import type { ApiImage } from '../../shared/app-api';
import { useLL } from '../state/context';
import { PhotoFrame } from './photo-frame';

/** Read-only photo thumbnails; the editor's picker (WP7) adds upload and remove controls around it. */
export const PhotoGrid = ({
    images,
    title,
    onRemove
}: {
    images: readonly ApiImage[];
    title: string;
    onRemove?: (index: number, image: ApiImage) => void;
}) => {
    const LL = useLL();

    if (images.length === 0) {
        return null;
    }

    return (
        <ul class='photo-grid'>
            {images.map((image, index) => {
                return (
                    <li key={image.hash} class='photo-tile'>
                        <PhotoFrame
                            src={image.url}
                            alt={LL.a11y.photo({
                                index: index + 1,
                                total: images.length,
                                title
                            })}
                        />
                        {onRemove === undefined ? null : (
                            <button
                                type='button'
                                class='photo-remove'
                                aria-label={LL.photos.remove()}
                                onClick={() => {
                                    onRemove(index, image);
                                }}
                            >
                                <span aria-hidden='true'>×</span>
                            </button>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};
