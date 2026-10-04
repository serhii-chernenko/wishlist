export const MAX_AUTO_ROWS = 12;

const SUBPIXEL_TOLERANCE_PX = 0.5;

export interface AutoRowsInput {
    contentHeight: number;
    lineHeight: number;
    minRows: number;
    maxRows?: number;
}

/** Rows a textarea needs for its content, clamped to `minRows..maxRows`; unusable measurements fall back to `minRows`. */
export const computeAutoRows = ({
    contentHeight,
    lineHeight,
    minRows,
    maxRows = MAX_AUTO_ROWS
}: AutoRowsInput) => {
    const ceiling = Math.max(minRows, maxRows);

    if (
        !Number.isFinite(contentHeight) ||
        !Number.isFinite(lineHeight) ||
        lineHeight <= 0
    ) {
        return minRows;
    }

    const needed = Math.ceil(
        (contentHeight - SUBPIXEL_TOLERANCE_PX) / lineHeight
    );

    return Math.min(ceiling, Math.max(minRows, needed));
};
