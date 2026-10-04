import { useEffect, useRef, useState } from 'hono/jsx/dom';

import type { ApiImage } from '../../shared/app-api';
import { getPhotoLoading } from '../../shared/photo-loading';
import {
    classifyPointerGesture,
    nearestSlideIndex,
    type GesturePoint
} from '../logic/photo-carousel';
import { PhotoFrame } from './photo-frame';

export interface PhotoCarouselProps {
    images: readonly ApiImage[];
    label: string;
    describeSlide: (slideIndex: number) => string;
    cardIndex: number;
    onOpen?: () => void;
}

/** Swipeable photo strip with dot indicators; a tap opens the card, a swipe only scrolls. */
export const PhotoCarousel = ({
    images,
    label,
    describeSlide,
    cardIndex,
    onOpen
}: PhotoCarouselProps) => {
    const scroller = useRef<HTMLDivElement>(null);
    const pressStart = useRef<GesturePoint | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const count = images.length;

    useEffect(() => {
        const element = scroller.current;

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

    const readPoint = (event: MouseEvent): GesturePoint => {
        return {
            x: event.clientX,
            y: event.clientY,
            scrollLeft: scroller.current?.scrollLeft ?? 0
        };
    };

    const tapHandlers =
        onOpen === undefined
            ? {}
            : {
                  onPointerDown: (event: PointerEvent) => {
                      pressStart.current = readPoint(event);
                  },
                  onClick: (event: MouseEvent) => {
                      const start = pressStart.current;

                      pressStart.current = null;

                      if (
                          start === null ||
                          classifyPointerGesture(start, readPoint(event)) ===
                              'tap'
                      ) {
                          onOpen();
                      }
                  }
              };

    return (
        <>
            <div
                ref={scroller}
                class='carousel wish-carousel'
                role='group'
                aria-label={label}
                {...tapHandlers}
            >
                {images.map((image, slideIndex) => {
                    return (
                        <div key={image.url} class='carousel-item'>
                            <PhotoFrame
                                src={image.url}
                                alt={describeSlide(slideIndex)}
                                loading={getPhotoLoading(cardIndex, slideIndex)}
                            />
                        </div>
                    );
                })}
            </div>
            <div class='photo-dots' aria-hidden='true'>
                {images.map((image, slideIndex) => {
                    return (
                        <span
                            key={image.url}
                            class={
                                slideIndex === activeIndex
                                    ? 'photo-dot photo-dot-active'
                                    : 'photo-dot'
                            }
                        />
                    );
                })}
            </div>
        </>
    );
};
