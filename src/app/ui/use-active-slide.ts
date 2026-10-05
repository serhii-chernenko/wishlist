import type { RefObject } from 'hono/jsx';
import { useEffect, useState } from 'hono/jsx/dom';

import { nearestSlideIndex } from '../logic/photo-carousel';

/** Tracks which slide of a scroll-snap strip fills the viewport while the user swipes. */
export const useActiveSlide = (
    strip: RefObject<HTMLDivElement>,
    count: number,
    initialIndex = 0
) => {
    const [activeIndex, setActiveIndex] = useState(initialIndex);

    useEffect(() => {
        const element = strip.current;

        if (element === null) {
            return undefined;
        }

        const syncActiveIndex = () => {
            setActiveIndex(
                nearestSlideIndex(
                    element.scrollLeft,
                    element.clientWidth,
                    count
                )
            );
        };

        element.addEventListener('scroll', syncActiveIndex, { passive: true });

        return () => {
            element.removeEventListener('scroll', syncActiveIndex);
        };
    }, [count]);

    return activeIndex;
};
