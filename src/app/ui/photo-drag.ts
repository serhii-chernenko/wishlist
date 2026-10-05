import { useEffect, useLayoutEffect, useRef, useState } from 'hono/jsx/dom';

import {
    liftOffset,
    LONG_PRESS_MS,
    shouldCancelPendingPress,
    shouldStartMouseDrag,
    targetIndexFromRects,
    toLocalPoint,
    toLocalRect,
    toPointerKind,
    type Point,
    type PointerKind,
    type SlotRect
} from '../logic/reorder';
import { haptics } from '../telegram/haptics';

export interface PhotoDrag {
    hash: string;
    from: number;
    target: number;
}

interface Press {
    pointerId: number;
    kind: PointerKind;
    hash: string;
    index: number;
    startClient: Point;
    grab: Point;
    pointer: Point;
    slots: SlotRect[];
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
}

interface DragSession {
    press: Press | null;
    drag: PhotoDrag | null;
    liftedHash: string | null;
    disabled: boolean;
}

export const PHOTO_SLOT_ATTRIBUTE = 'data-photo-slot';
export const PHOTO_HASH_ATTRIBUTE = 'data-photo-hash';
export const PHOTO_HANDLE_ATTRIBUTE = 'data-photo-handle';

const SLOT_SELECTOR = `[${PHOTO_SLOT_ATTRIBUTE}]`;
const BODY_SELECTOR = '.photo-tile-body';

const clientPointOf = (event: PointerEvent): Point => {
    return { x: event.clientX, y: event.clientY };
};

const originOf = (element: Element): Point => {
    const rect = element.getBoundingClientRect();

    return { x: rect.left, y: rect.top };
};

const readSlots = (grid: HTMLElement, origin: Point) => {
    return Array.from(grid.querySelectorAll(SLOT_SELECTOR), slot => {
        const { left, top, width, height } = slot.getBoundingClientRect();

        return toLocalRect({ left, top, width, height }, origin);
    });
};

const findTileBody = (grid: HTMLElement, hash: string) => {
    return grid.querySelector<HTMLElement>(
        `[${PHOTO_HASH_ATTRIBUTE}="${hash}"] ${BODY_SELECTOR}`
    );
};

const startsOnForeignButton = (target: Element) => {
    const button = target.closest('button');

    return button !== null && !button.hasAttribute(PHOTO_HANDLE_ATTRIBUTE);
};

const isPrimaryPress = (event: PointerEvent) => {
    return event.pointerType !== 'mouse' || event.button === 0;
};

/**
 * Pointer-driven photo dragging for touch, pen and mouse. Touch waits for a
 * long-press so a swipe across the grid still scrolls the page; once a photo is
 * lifted the grid captures the pointer and cancels the touch scroll, the tile
 * follows the pointer, and the photos reflow around its target slot.
 */
export const usePhotoDrag = ({
    hashes,
    disabled,
    onDrop
}: {
    hashes: readonly string[];
    disabled: boolean;
    onDrop: (from: number, to: number) => void;
}) => {
    const gridRef = useRef<HTMLUListElement>(null);
    const [drag, setDrag] = useState<PhotoDrag | null>(null);
    const [session] = useState<DragSession>(() => {
        return { press: null, drag: null, liftedHash: null, disabled };
    });

    session.disabled = disabled;

    const applyLift = () => {
        const grid = gridRef.current;
        const { press, drag: current } = session;
        const slot =
            current === null ? undefined : press?.slots[current.target];

        if (grid === null || press === null || current === null || !slot) {
            return;
        }

        const body = findTileBody(grid, current.hash);
        const offset = liftOffset(press.pointer, press.grab, slot);

        if (body !== null) {
            body.style.translate = `${offset.x}px ${offset.y}px`;
        }
    };

    const showDrag = (next: PhotoDrag | null) => {
        session.drag = next;
        setDrag(next);
    };

    const endPress = () => {
        const { press } = session;
        const grid = gridRef.current;

        if (press?.timer) {
            clearTimeout(press.timer);
        }

        session.press = null;

        if (press?.active && grid?.hasPointerCapture(press.pointerId)) {
            grid.releasePointerCapture(press.pointerId);
        }

        if (session.drag !== null) {
            showDrag(null);
        }
    };

    const pickUp = () => {
        const { press } = session;
        const grid = gridRef.current;

        if (press === null || press.active || grid === null) {
            return;
        }

        if (session.disabled) {
            endPress();

            return;
        }

        press.active = true;
        press.timer = null;
        session.liftedHash = press.hash;

        try {
            grid.setPointerCapture(press.pointerId);
        } catch {
            endPress();

            return;
        }

        showDrag({ hash: press.hash, from: press.index, target: press.index });
        haptics.selection();
    };

    const drop = () => {
        const current = session.drag;

        if (current !== null && current.target !== current.from) {
            onDrop(current.from, current.target);
            haptics.impact('light');
        }

        endPress();
    };

    const followPointer = (press: Press) => {
        const current = session.drag;

        if (current === null) {
            return;
        }

        const target = targetIndexFromRects(press.slots, press.pointer);

        if (target !== -1 && target !== current.target) {
            showDrag({ ...current, target });
            haptics.selection();
        }

        applyLift();
    };

    const onPointerDown = (event: PointerEvent) => {
        const grid = gridRef.current;
        const target = event.target;

        if (
            session.disabled ||
            session.press !== null ||
            grid === null ||
            hashes.length < 2 ||
            !isPrimaryPress(event) ||
            !(target instanceof Element) ||
            startsOnForeignButton(target)
        ) {
            return;
        }

        const tile = target.closest<HTMLElement>(SLOT_SELECTOR);
        const index = Number(tile?.getAttribute(PHOTO_SLOT_ATTRIBUTE));
        const hash = hashes[index];

        if (tile === null || !grid.contains(tile) || hash === undefined) {
            return;
        }

        const origin = originOf(grid);
        const slots = readSlots(grid, origin);
        const slot = slots[index];

        if (slot === undefined) {
            return;
        }

        const pointer = toLocalPoint(clientPointOf(event), origin);
        const kind = toPointerKind(event.pointerType);

        session.press = {
            pointerId: event.pointerId,
            kind,
            hash,
            index,
            startClient: clientPointOf(event),
            grab: toLocalPoint(pointer, { x: slot.left, y: slot.top }),
            pointer,
            slots,
            timer:
                kind === 'mouse'
                    ? null
                    : setTimeout(() => {
                          pickUp();
                      }, LONG_PRESS_MS),
            active: false
        };

        if (kind === 'mouse') {
            event.preventDefault();
        }
    };

    const onPointerMove = (event: PointerEvent) => {
        const { press } = session;
        const grid = gridRef.current;

        if (
            press === null ||
            grid === null ||
            event.pointerId !== press.pointerId
        ) {
            return;
        }

        const client = clientPointOf(event);

        press.pointer = toLocalPoint(client, originOf(grid));

        if (press.active) {
            event.preventDefault();
            followPointer(press);

            return;
        }

        if (shouldCancelPendingPress(press.kind, press.startClient, client)) {
            endPress();
        } else if (
            press.kind === 'mouse' &&
            shouldStartMouseDrag(press.startClient, client)
        ) {
            pickUp();
            followPointer(press);
        }
    };

    const onPointerUp = (event: PointerEvent) => {
        const { press } = session;

        if (press === null || event.pointerId !== press.pointerId) {
            return;
        }

        if (press.active) {
            drop();
        } else {
            endPress();
        }
    };

    const onPointerCancel = (event: PointerEvent) => {
        if (session.press?.pointerId === event.pointerId) {
            endPress();
        }
    };

    const onLostPointerCapture = (event: PointerEvent) => {
        const { press } = session;

        if (
            event.target === gridRef.current &&
            press?.active &&
            press.pointerId === event.pointerId
        ) {
            endPress();
        }
    };

    const preventWhilePressed = (event: Event) => {
        if (session.press !== null) {
            event.preventDefault();
        }
    };

    useLayoutEffect(() => {
        if (drag !== null) {
            applyLift();

            return;
        }

        const grid = gridRef.current;
        const { liftedHash } = session;

        if (grid !== null && liftedHash !== null) {
            const body = findTileBody(grid, liftedHash);

            session.liftedHash = null;

            if (body !== null) {
                body.style.translate = '';
            }
        }
    }, [drag]);

    useEffect(() => {
        const grid = gridRef.current;

        if (grid === null) {
            return;
        }

        const blockTouchScroll = (event: TouchEvent) => {
            if (session.press?.active && event.cancelable) {
                event.preventDefault();
            }
        };

        grid.addEventListener('touchmove', blockTouchScroll, {
            passive: false
        });

        return () => {
            grid.removeEventListener('touchmove', blockTouchScroll);
            endPress();
        };
    }, []);

    useEffect(() => {
        if (drag === null) {
            return;
        }

        const cancelOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                endPress();
            }
        };

        window.addEventListener('keydown', cancelOnEscape);

        return () => {
            window.removeEventListener('keydown', cancelOnEscape);
        };
    }, [drag === null]);

    useEffect(() => {
        const { press } = session;

        if (
            press !== null &&
            (disabled || hashes[press.index] !== press.hash)
        ) {
            endPress();
        }
    }, [disabled, hashes.join()]);

    return {
        gridRef,
        drag,
        gridEvents: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onLostPointerCapture,
            onContextMenu: preventWhilePressed,
            onDragStart: preventWhilePressed
        }
    };
};
