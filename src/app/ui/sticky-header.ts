import { useEffect, useRef } from 'hono/jsx/dom';

import {
    isPastStickyEdge,
    learnStickyFullHeight,
    STICKY_SETTLE_MS,
    type StickyPhase
} from '../logic/sticky-header';

const supportsObservers = () => {
    return (
        typeof IntersectionObserver !== 'undefined' &&
        typeof ResizeObserver !== 'undefined'
    );
};

/** Marks the header `data-stuck` once the sentinel above it scrolls past the sticky edge. The header shell keeps the expanded height as `min-height`, so the collapse happens inside a box that never changes the document layout. */
export const useStickyHeader = (enabled: boolean) => {
    const sentinel = useRef<HTMLDivElement>(null);
    const header = useRef<HTMLElement>(null);
    const bar = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sentinelElement = sentinel.current;
        const headerElement = header.current;
        const barElement = bar.current;

        if (
            !enabled ||
            sentinelElement === null ||
            headerElement === null ||
            barElement === null ||
            !supportsObservers()
        ) {
            return undefined;
        }

        let phase: StickyPhase = 'unstuck';
        let fullHeight = 0;
        let settleTimer: ReturnType<typeof setTimeout> | undefined;

        const measure = () => {
            fullHeight = learnStickyFullHeight(
                fullHeight,
                barElement.getBoundingClientRect().height,
                phase
            );
            headerElement.style.minHeight = `${fullHeight}px`;
        };

        const settle = () => {
            phase = 'unstuck';
            measure();
        };

        const setStuck = (stuck: boolean) => {
            if (stuck === (phase === 'stuck')) {
                return;
            }

            clearTimeout(settleTimer);
            phase = stuck ? 'stuck' : 'settling';
            headerElement.toggleAttribute('data-stuck', stuck);

            if (!stuck) {
                settleTimer = setTimeout(settle, STICKY_SETTLE_MS);
            }
        };

        const resizes = new ResizeObserver(measure);
        const crossings = new IntersectionObserver(entries => {
            const latest = entries[entries.length - 1];

            if (latest !== undefined) {
                setStuck(
                    isPastStickyEdge({
                        isIntersecting: latest.isIntersecting,
                        top: latest.boundingClientRect.top
                    })
                );
            }
        });

        resizes.observe(barElement, { box: 'border-box' });
        crossings.observe(sentinelElement);

        return () => {
            clearTimeout(settleTimer);
            resizes.disconnect();
            crossings.disconnect();
            headerElement.removeAttribute('data-stuck');
            headerElement.style.minHeight = '';
        };
    }, [enabled]);

    return { sentinel, header, bar };
};
