import type { ApiImage } from '../../shared/app-api';

export const PhotoDots = ({
    images,
    activeIndex
}: {
    images: readonly ApiImage[];
    activeIndex: number;
}) => {
    return (
        <div class='photo-dots' aria-hidden='true'>
            {images.map((image, slideIndex) => {
                return (
                    <span
                        key={image.url}
                        class={
                            slideIndex === activeIndex
                                ? 'photo-dot-active'
                                : undefined
                        }
                    />
                );
            })}
        </div>
    );
};
