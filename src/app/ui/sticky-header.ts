import { useEffect, useRef } from 'hono/jsx/dom';

import {
    isPastStickyEdge,
    measureStickyHeader,
    STICKY_SETTLE_MS,
    type StickyPhase
} from '../logic/sticky-header';

const supportsObservers = () => {
    return (
        typeof IntersectionObserver !== 'undefined' &&
        typeof ResizeObserver !== 'undefined'
    );
};

/** Marks the header `data-stuck` once the sentinel above it scrolls past the sticky edge, and sizes the reserve below it so the collapse never shifts the content. */
export const useStickyHeader = (enabled: boolean) => {
    const sentinel = useRef<HTMLDivElement>(null);
    const header = useRef<HTMLElement>(null);
    const reserve = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sentinelElement = sentinel.current;
        const headerElement = header.current;
        const reserveElement = reserve.current;

        if (
            !enabled ||
            sentinelElement === null ||
            headerElement === null ||
            reserveElement === null ||
            !supportsObservers()
        ) {
            return undefined;
        }

        let phase: StickyPhase = 'unstuck';
        let fullHeight = 0;
        let settleTimer: ReturnType<typeof setTimeout> | undefined;

        const measure = () => {
            const next = measureStickyHeader(
                fullHeight,
                headerElement.getBoundingClientRect().height,
                phase
            );

            fullHeight = next.fullHeight;
            reserveElement.style.height = `${next.reserve}px`;
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

        resizes.observe(headerElement, { box: 'border-box' });
        crossings.observe(sentinelElement);

        return () => {
            clearTimeout(settleTimer);
            resizes.disconnect();
            crossings.disconnect();
            headerElement.removeAttribute('data-stuck');
            reserveElement.style.height = '';
        };
    }, [enabled]);

    return { sentinel, header, reserve };
};
