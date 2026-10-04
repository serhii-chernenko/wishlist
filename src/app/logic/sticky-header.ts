export const STICKY_SETTLE_MS = 250;

export type StickyPhase = 'unstuck' | 'stuck' | 'settling';

export interface StickyEdge {
    isIntersecting: boolean;
    top: number;
}

export interface StickyMeasure {
    fullHeight: number;
    reserve: number;
}

export const isPastStickyEdge = (edge: StickyEdge) => {
    return !edge.isIntersecting && edge.top < 0;
};

/** The full (unstuck) header height is learned only while unstuck; the reserve below the header makes up the difference while it is compact or still growing back, so the content never moves. */
export const measureStickyHeader = (
    fullHeight: number,
    height: number,
    phase: StickyPhase
): StickyMeasure => {
    const nextFullHeight =
        phase === 'unstuck'
            ? height
            : phase === 'settling'
              ? Math.max(fullHeight, height)
              : fullHeight;

    return {
        fullHeight: nextFullHeight,
        reserve: Math.max(0, nextFullHeight - height)
    };
};
