export const EAGER_CARD_COUNT = 4;

export interface PhotoLoadingAttributes {
    loading: 'eager' | 'lazy';
    decoding: 'async';
    fetchpriority?: 'high';
}

/** Loading policy for a wish photo: only the first slide of the first cards is eager, and only the very first photo is prioritised. */
export const getPhotoLoading = (
    cardIndex: number,
    slideIndex: number
): PhotoLoadingAttributes => {
    const isFirstSlide = slideIndex === 0;
    const isEager =
        isFirstSlide && cardIndex >= 0 && cardIndex < EAGER_CARD_COUNT;

    return {
        loading: isEager ? 'eager' : 'lazy',
        decoding: 'async',
        ...(isFirstSlide &&
            cardIndex === 0 && { fetchpriority: 'high' as const })
    };
};
