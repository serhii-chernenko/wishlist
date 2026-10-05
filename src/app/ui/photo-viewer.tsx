import { useLayoutEffect, useRef } from 'hono/jsx/dom';

import type { ApiImage } from '../../shared/app-api';
import { clampSlideIndex, slideScrollOffset } from '../logic/photo-viewer';
import { pushDismissibleLayer } from '../state/layers';
import { useLatest } from '../state/store';
import { PhotoDots } from './photo-dots';
import { PhotoFrame } from './photo-frame';
import { useActiveSlide } from './use-active-slide';

export interface PhotoViewerProps {
    images: readonly ApiImage[];
    startIndex: number;
    label: string;
    closeLabel: string;
    describeSlide: (slideIndex: number) => string;
    onClose: () => void;
}

const stopPropagation = (event: Event) => {
    event.stopPropagation();
};

/** Fullscreen swipeable photo viewer; Escape, the close button and the Telegram back button close it. */
export const PhotoViewer = ({
    images,
    startIndex,
    label,
    closeLabel,
    describeSlide,
    onClose
}: PhotoViewerProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const close = useLatest(onClose);
    const count = images.length;
    const firstIndex = clampSlideIndex(startIndex, count);
    const activeIndex = useActiveSlide(stripRef, count, firstIndex);

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        const strip = stripRef.current;
        const previous = document.activeElement;
        const removeLayer = pushDismissibleLayer(() => {
            close.current();
        });

        if (dialog !== null && !dialog.open) {
            dialog.showModal();
        }

        if (strip !== null) {
            strip.scrollLeft = slideScrollOffset(
                firstIndex,
                strip.clientWidth,
                count
            );
        }

        return () => {
            removeLayer();
            dialog?.close();

            if (previous instanceof HTMLElement && previous.isConnected) {
                previous.focus({ preventScroll: true });
            }
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            class='photo-viewer'
            aria-label={label}
            onCancel={(event: Event) => {
                event.preventDefault();
                close.current();
            }}
            onPointerDown={stopPropagation}
            onPointerUp={stopPropagation}
            onPointerCancel={stopPropagation}
        >
            <button
                type='button'
                class='photo-viewer-close'
                aria-label={closeLabel}
                onClick={() => {
                    close.current();
                }}
            />
            <div
                ref={stripRef}
                class='carousel photo-viewer-track'
                role='group'
                tabindex={0}
                aria-label={label}
            >
                {images.map((image, slideIndex) => {
                    return (
                        <div key={image.url} class='carousel-item'>
                            <PhotoFrame
                                src={image.url}
                                alt={describeSlide(slideIndex)}
                            />
                        </div>
                    );
                })}
            </div>
            {count > 1 ? (
                <PhotoDots images={images} activeIndex={activeIndex} />
            ) : null}
        </dialog>
    );
};
