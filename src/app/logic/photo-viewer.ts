/** Keeps a requested slide index inside the photo list; a non-finite index falls back to the first photo. */
export const clampSlideIndex = (index: number, count: number) => {
    if (count <= 0 || !Number.isFinite(index)) {
        return 0;
    }

    return Math.min(count - 1, Math.max(0, Math.trunc(index)));
};

/** Scroll offset that brings a slide to the start of a strip whose slides are as wide as the strip. */
export const slideScrollOffset = (
    index: number,
    slideWidth: number,
    count: number
) => {
    return clampSlideIndex(index, count) * Math.max(0, slideWidth);
};
