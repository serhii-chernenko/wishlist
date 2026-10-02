export const WISHES_PAGE_SIZE = 10;

export interface PageWindow {
    offset: number;
    firstPosition: number;
    lastPosition: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
    isFirstPage: boolean;
    isPaginated: boolean;
}

export const normalizeOffset = (offset: number, total: number) => {
    if (!Number.isFinite(offset) || offset < 0 || total <= 0) {
        return 0;
    }

    const lastPageOffset =
        Math.floor((total - 1) / WISHES_PAGE_SIZE) * WISHES_PAGE_SIZE;

    return Math.min(Math.floor(offset), lastPageOffset);
};

export const getPageWindow = (
    offset: number,
    itemCount: number,
    total: number
): PageWindow => {
    const end = offset + itemCount;
    const hasMore = end < total;

    return {
        offset,
        firstPosition: itemCount === 0 ? 0 : offset + 1,
        lastPosition: end,
        total,
        hasMore,
        nextOffset: hasMore ? end : null,
        isFirstPage: offset === 0,
        isPaginated: total > WISHES_PAGE_SIZE
    };
};
