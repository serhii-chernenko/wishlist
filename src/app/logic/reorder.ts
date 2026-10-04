export interface SlotRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

export type PointerKind = 'mouse' | 'touch' | 'pen';

export const LONG_PRESS_MS = 300;
export const TOUCH_SLOP_PX = 8;
export const MOUSE_DRAG_THRESHOLD_PX = 4;

const KEYBOARD_STEPS: Readonly<Record<string, -1 | 1>> = {
    ArrowLeft: -1,
    ArrowUp: -1,
    ArrowRight: 1,
    ArrowDown: 1
};

const isIndexOf = (items: readonly unknown[], index: number) => {
    return Number.isInteger(index) && index >= 0 && index < items.length;
};

/** Returns a copy with the item at `from` moved to `to`; out-of-range indexes return an unchanged copy. */
export const moveItem = <Item>(
    items: readonly Item[],
    from: number,
    to: number
): Item[] => {
    if (!isIndexOf(items, from) || !isIndexOf(items, to) || from === to) {
        return [...items];
    }

    const next = [...items];
    const [moved] = next.splice(from, 1) as [Item];

    next.splice(to, 0, moved);

    return next;
};

export const reorderHashes = (
    images: readonly { hash: string }[],
    from: number,
    to: number
): string[] => {
    return moveItem(
        images.map(image => image.hash),
        from,
        to
    );
};

export const orderImagesByHashes = <Image extends { hash: string }>(
    images: readonly Image[],
    hashes: readonly string[]
): Image[] => {
    const byHash = new Map(images.map(image => [image.hash, image]));

    return hashes.flatMap(hash => {
        const image = byHash.get(hash);

        return image === undefined ? [] : [image];
    });
};

export const isSameOrder = (
    left: readonly string[],
    right: readonly string[]
) => {
    return (
        left.length === right.length &&
        left.every((value, index) => {
            return value === right[index];
        })
    );
};

const containsPoint = (rect: SlotRect, point: Point) => {
    return (
        point.x >= rect.left &&
        point.x < rect.left + rect.width &&
        point.y >= rect.top &&
        point.y < rect.top + rect.height
    );
};

const distanceToCenter = (rect: SlotRect, point: Point) => {
    return Math.hypot(
        rect.left + rect.width / 2 - point.x,
        rect.top + rect.height / 2 - point.y
    );
};

/** The slot under the point, or the slot with the nearest centre when the point falls in a gap or outside the grid; -1 for no slots. */
export const targetIndexFromRects = (
    rects: readonly SlotRect[],
    point: Point
): number => {
    const hit = rects.findIndex(rect => containsPoint(rect, point));

    if (hit !== -1) {
        return hit;
    }

    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    rects.forEach((rect, index) => {
        const distance = distanceToCenter(rect, point);

        if (distance < nearestDistance) {
            nearest = index;
            nearestDistance = distance;
        }
    });

    return nearest;
};

const resolveKeyboardTarget = (key: string, index: number, total: number) => {
    if (key === 'Home') {
        return 0;
    }

    if (key === 'End') {
        return total - 1;
    }

    const step = KEYBOARD_STEPS[key];

    return step === undefined ? null : index + step;
};

/** The index a keyboard key moves the photo at `index` to, or null for other keys and for moves past either end. */
export const keyboardTargetIndex = (
    key: string,
    index: number,
    total: number
): number | null => {
    if (!Number.isInteger(index) || index < 0 || index >= total) {
        return null;
    }

    const target = resolveKeyboardTarget(key, index, total);

    if (target === null || target < 0 || target >= total) {
        return null;
    }

    return target === index ? null : target;
};

export const toPointerKind = (pointerType: string): PointerKind => {
    return pointerType === 'mouse' || pointerType === 'pen'
        ? pointerType
        : 'touch';
};

export const pickupDelayMs = (kind: PointerKind) => {
    return kind === 'mouse' ? 0 : LONG_PRESS_MS;
};

export const hasMovedBeyond = (start: Point, current: Point, limit: number) => {
    return Math.hypot(current.x - start.x, current.y - start.y) > limit;
};

/** A touch press waiting for its long-press cancels once the finger travels past the slop, so the gesture stays a scroll. */
export const shouldCancelPendingPress = (
    kind: PointerKind,
    start: Point,
    current: Point
) => {
    return kind !== 'mouse' && hasMovedBeyond(start, current, TOUCH_SLOP_PX);
};

/** A mouse press turns into a drag only after a short move, so a plain click on the handle never reorders. */
export const shouldStartMouseDrag = (start: Point, current: Point) => {
    return hasMovedBeyond(start, current, MOUSE_DRAG_THRESHOLD_PX);
};

export const toLocalPoint = (point: Point, origin: Point): Point => {
    return { x: point.x - origin.x, y: point.y - origin.y };
};

export const toLocalRect = (rect: SlotRect, origin: Point): SlotRect => {
    return {
        left: rect.left - origin.x,
        top: rect.top - origin.y,
        width: rect.width,
        height: rect.height
    };
};

/** The translate that keeps a lifted tile under the pointer while it sits in `slot`, given where inside the tile it was grabbed. */
export const liftOffset = (
    pointer: Point,
    grab: Point,
    slot: SlotRect
): Point => {
    return {
        x: pointer.x - grab.x - slot.left,
        y: pointer.y - grab.y - slot.top
    };
};

export interface OrderCommitter<Result> {
    commit(hashes: readonly string[]): Promise<Result>;
    committed(result: Result, isLatest: boolean): void;
    failed(error: unknown): void;
}

/** Sends one order at a time; orders submitted while a request is in flight collapse into the newest one, so the last arrangement always wins. */
export const createOrderQueue = <Result>(committer: OrderCommitter<Result>) => {
    let inFlight = false;
    let queued: readonly string[] | null = null;

    const run = async (hashes: readonly string[]): Promise<void> => {
        inFlight = true;

        try {
            const result = await committer.commit(hashes);

            committer.committed(result, queued === null);
        } catch (error) {
            queued = null;
            committer.failed(error);
        } finally {
            inFlight = false;
        }

        if (queued !== null) {
            const next = queued;

            queued = null;
            await run(next);
        }
    };

    return {
        submit(hashes: readonly string[]): Promise<void> {
            if (inFlight) {
                queued = hashes;

                return Promise.resolve();
            }

            return run(hashes);
        },
        isBusy() {
            return inFlight;
        }
    };
};
