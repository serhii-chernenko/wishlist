export type StickyPhase = 'unstuck' | 'stuck' | 'settling';

export interface StickyEdge {
    isIntersecting: boolean;
    top: number;
}

export const STICKY_SETTLE_MS = 250;

export const isPastStickyEdge = (edge: StickyEdge) => {
    return !edge.isIntersecting && edge.top < 0;
};

/** The shell around the header keeps the full (expanded) height as its minimum, so collapsing never changes the page layout. The full height is learned only while unstuck, and only grows while the header is still expanding back, so the minimum never dips under the content mid-transition. */
export const learnStickyFullHeight = (
    fullHeight: number,
    barHeight: number,
    phase: StickyPhase
) => {
    switch (phase) {
        case 'unstuck':
            return barHeight;
        case 'settling':
            return Math.max(fullHeight, barHeight);
        case 'stuck':
            return fullHeight;
    }
};
