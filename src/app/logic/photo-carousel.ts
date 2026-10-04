export const SWIPE_SLOP_PX = 10;

export interface GesturePoint {
    x: number;
    y: number;
    scrollLeft: number;
}

export type PointerGesture = 'tap' | 'swipe';

/** Index of the slide that fills most of the viewport; RTL scroll offsets are negative, hence the absolute value. */
export const nearestSlideIndex = (
    scrollLeft: number,
    slideWidth: number,
    count: number
) => {
    if (count <= 0 || slideWidth <= 0) {
        return 0;
    }

    const index = Math.round(Math.abs(scrollLeft) / slideWidth);

    return Math.min(count - 1, Math.max(0, index));
};

/** A press that moved or scrolled the carousel is a swipe and must not open the card. */
export const classifyPointerGesture = (
    start: GesturePoint,
    end: GesturePoint,
    slopPx: number = SWIPE_SLOP_PX
): PointerGesture => {
    const moved = Math.hypot(end.x - start.x, end.y - start.y) > slopPx;
    const scrolled = Math.abs(end.scrollLeft - start.scrollLeft) > 0;

    return moved || scrolled ? 'swipe' : 'tap';
};
