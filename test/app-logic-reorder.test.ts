import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createOrderQueue,
    hasMovedBeyond,
    isSameOrder,
    keyboardTargetIndex,
    liftOffset,
    LONG_PRESS_MS,
    moveItem,
    orderImagesByHashes,
    pickupDelayMs,
    reorderHashes,
    shouldCancelPendingPress,
    shouldStartMouseDrag,
    targetIndexFromRects,
    toLocalPoint,
    toLocalRect,
    toPointerKind,
    type SlotRect
} from '../src/app/logic/reorder';

const TILE = 100;
const GAP = 8;
const COLUMNS = 3;

const gridSlots = (count: number): SlotRect[] => {
    return Array.from({ length: count }, (_value, index) => {
        return {
            left: (index % COLUMNS) * (TILE + GAP),
            top: Math.floor(index / COLUMNS) * (TILE + GAP),
            width: TILE,
            height: TILE
        };
    });
};

const images = (hashes: readonly string[]) => {
    return hashes.map(hash => {
        return { hash, url: `/img/${hash}` };
    });
};

const deferred = <Value>() => {
    let resolve: (value: Value) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const promise = new Promise<Value>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });

    return { promise, resolve, reject };
};

test('moveItem moves forward and backward without mutating the input', () => {
    const items = ['a', 'b', 'c', 'd'] as const;

    assert.deepEqual(moveItem(items, 0, 2), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveItem(items, 3, 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(moveItem(items, 1, 3), ['a', 'c', 'd', 'b']);
    assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

test('moveItem returns an unchanged copy for the same index and for out-of-range or fractional indexes', () => {
    const items = ['a', 'b', 'c'];

    for (const [from, to] of [
        [1, 1],
        [-1, 0],
        [0, 3],
        [3, 0],
        [0.5, 1]
    ] as const) {
        const moved = moveItem(items, from, to);

        assert.deepEqual(moved, items);
        assert.notEqual(moved, items);
    }

    assert.deepEqual(moveItem([], 0, 0), []);
});

test('reorderHashes returns the full new order of hashes', () => {
    assert.deepEqual(reorderHashes(images(['h1', 'h2', 'h3']), 2, 0), [
        'h3',
        'h1',
        'h2'
    ]);
});

test('orderImagesByHashes keeps the image objects and drops unknown hashes', () => {
    const list = images(['h1', 'h2', 'h3']);
    const ordered = orderImagesByHashes(list, ['h3', 'h1', 'missing', 'h2']);

    assert.deepEqual(
        ordered.map(image => image.hash),
        ['h3', 'h1', 'h2']
    );
    assert.equal(ordered[0], list[2]);
});

test('isSameOrder compares length and position', () => {
    assert.equal(isSameOrder(['a', 'b'], ['a', 'b']), true);
    assert.equal(isSameOrder(['a', 'b'], ['b', 'a']), false);
    assert.equal(isSameOrder(['a'], ['a', 'b']), false);
    assert.equal(isSameOrder([], []), true);
});

test('targetIndexFromRects returns the slot under the point', () => {
    const slots = gridSlots(5);

    assert.equal(targetIndexFromRects(slots, { x: 10, y: 10 }), 0);
    assert.equal(targetIndexFromRects(slots, { x: 150, y: 50 }), 1);
    assert.equal(targetIndexFromRects(slots, { x: 120, y: 150 }), 4);
});

test('targetIndexFromRects treats the right and bottom edges as outside the slot', () => {
    const slots = gridSlots(2);

    assert.equal(targetIndexFromRects(slots, { x: TILE - 1, y: 0 }), 0);
    assert.equal(targetIndexFromRects(slots, { x: TILE + GAP, y: 0 }), 1);
});

test('targetIndexFromRects picks the nearest slot centre in gaps and outside the grid', () => {
    const slots = gridSlots(5);

    assert.equal(targetIndexFromRects(slots, { x: 103, y: 50 }), 0);
    assert.equal(targetIndexFromRects(slots, { x: 105, y: 50 }), 1);
    assert.equal(targetIndexFromRects(slots, { x: -200, y: -200 }), 0);
    assert.equal(targetIndexFromRects(slots, { x: 400, y: 0 }), 2);
    assert.equal(targetIndexFromRects(slots, { x: 260, y: 230 }), 4);
    assert.equal(targetIndexFromRects(slots, { x: 50, y: 900 }), 3);
});

test('targetIndexFromRects returns -1 without slots', () => {
    assert.equal(targetIndexFromRects([], { x: 0, y: 0 }), -1);
});

test('keyboardTargetIndex moves one step with the arrow keys', () => {
    assert.equal(keyboardTargetIndex('ArrowLeft', 2, 5), 1);
    assert.equal(keyboardTargetIndex('ArrowUp', 2, 5), 1);
    assert.equal(keyboardTargetIndex('ArrowRight', 2, 5), 3);
    assert.equal(keyboardTargetIndex('ArrowDown', 2, 5), 3);
});

test('keyboardTargetIndex jumps to either end with Home and End', () => {
    assert.equal(keyboardTargetIndex('Home', 3, 5), 0);
    assert.equal(keyboardTargetIndex('End', 1, 5), 4);
});

test('keyboardTargetIndex ignores other keys, moves past either end and no-op moves', () => {
    assert.equal(keyboardTargetIndex('Enter', 1, 5), null);
    assert.equal(keyboardTargetIndex('ArrowLeft', 0, 5), null);
    assert.equal(keyboardTargetIndex('ArrowRight', 4, 5), null);
    assert.equal(keyboardTargetIndex('Home', 0, 5), null);
    assert.equal(keyboardTargetIndex('End', 4, 5), null);
});

test('keyboardTargetIndex rejects indexes outside the list', () => {
    assert.equal(keyboardTargetIndex('ArrowLeft', 5, 5), null);
    assert.equal(keyboardTargetIndex('ArrowRight', -1, 5), null);
    assert.equal(keyboardTargetIndex('Home', 1.5, 5), null);
    assert.equal(keyboardTargetIndex('Home', 0, 0), null);
});

test('touch and pen wait for a long-press, a mouse picks up at once', () => {
    assert.equal(toPointerKind('mouse'), 'mouse');
    assert.equal(toPointerKind('pen'), 'pen');
    assert.equal(toPointerKind('touch'), 'touch');
    assert.equal(toPointerKind(''), 'touch');
    assert.equal(pickupDelayMs('mouse'), 0);
    assert.equal(pickupDelayMs('touch'), LONG_PRESS_MS);
    assert.equal(pickupDelayMs('pen'), LONG_PRESS_MS);
});

test('a pending touch press cancels past the slop so the swipe scrolls', () => {
    const start = { x: 100, y: 100 };

    assert.equal(
        shouldCancelPendingPress('touch', start, { x: 104, y: 105 }),
        false
    );
    assert.equal(
        shouldCancelPendingPress('touch', start, { x: 100, y: 112 }),
        true
    );
    assert.equal(
        shouldCancelPendingPress('pen', start, { x: 110, y: 100 }),
        true
    );
    assert.equal(
        shouldCancelPendingPress('mouse', start, { x: 200, y: 200 }),
        false
    );
});

test('a mouse drag starts only after a short move', () => {
    const start = { x: 10, y: 10 };

    assert.equal(shouldStartMouseDrag(start, { x: 12, y: 12 }), false);
    assert.equal(shouldStartMouseDrag(start, { x: 15, y: 10 }), true);
    assert.equal(hasMovedBeyond(start, { x: 13, y: 14 }, 5), false);
    assert.equal(hasMovedBeyond(start, { x: 14, y: 14 }, 5), true);
});

test('local coordinates are relative to the grid origin', () => {
    const origin = { x: 20, y: 300 };

    assert.deepEqual(toLocalPoint({ x: 70, y: 350 }, origin), {
        x: 50,
        y: 50
    });
    assert.deepEqual(
        toLocalRect({ left: 128, top: 300, width: 100, height: 100 }, origin),
        { left: 108, top: 0, width: 100, height: 100 }
    );
});

test('liftOffset keeps the grabbed point under the pointer in any slot', () => {
    const [first, second] = gridSlots(2) as [SlotRect, SlotRect];
    const grab = { x: 30, y: 40 };

    assert.deepEqual(liftOffset({ x: 30, y: 40 }, grab, first), {
        x: 0,
        y: 0
    });
    assert.deepEqual(liftOffset({ x: 150, y: 60 }, grab, second), {
        x: 12,
        y: 20
    });
    assert.deepEqual(liftOffset({ x: 150, y: 60 }, grab, first), {
        x: 120,
        y: 20
    });
});

test('createOrderQueue commits one order and reports it as the latest', async () => {
    const sent: string[][] = [];
    const committed: [string, boolean][] = [];
    const queue = createOrderQueue<string>({
        async commit(hashes) {
            sent.push([...hashes]);

            return hashes.join(',');
        },
        committed(result, isLatest) {
            committed.push([result, isLatest]);
        },
        failed() {
            assert.fail('no failure expected');
        }
    });

    await queue.submit(['b', 'a']);

    assert.deepEqual(sent, [['b', 'a']]);
    assert.deepEqual(committed, [['b,a', true]]);
    assert.equal(queue.isBusy(), false);
});

test('createOrderQueue collapses orders submitted in flight into the newest one', async () => {
    const sent: string[][] = [];
    const committed: [string, boolean][] = [];
    const pending: ReturnType<typeof deferred<string>>[] = [];
    const queue = createOrderQueue<string>({
        commit(hashes) {
            sent.push([...hashes]);

            const next = deferred<string>();

            pending.push(next);

            return next.promise;
        },
        committed(result, isLatest) {
            committed.push([result, isLatest]);
        },
        failed() {
            assert.fail('no failure expected');
        }
    });

    const first = queue.submit(['b', 'a', 'c']);

    assert.equal(queue.isBusy(), true);
    await queue.submit(['b', 'c', 'a']);
    await queue.submit(['c', 'b', 'a']);
    pending[0]?.resolve('first');
    await new Promise(resolve => setImmediate(resolve));
    pending[1]?.resolve('second');
    await first;

    assert.deepEqual(sent, [
        ['b', 'a', 'c'],
        ['c', 'b', 'a']
    ]);
    assert.deepEqual(committed, [
        ['first', false],
        ['second', true]
    ]);
    assert.equal(queue.isBusy(), false);
});

test('createOrderQueue drops the queued order after a failure and accepts new ones', async () => {
    const sent: string[][] = [];
    const failures: unknown[] = [];
    let failNext = true;
    const queue = createOrderQueue<string>({
        async commit(hashes) {
            sent.push([...hashes]);

            if (failNext) {
                failNext = false;
                await Promise.resolve();
                throw new Error('conflict');
            }

            return 'ok';
        },
        committed() {},
        failed(error) {
            failures.push(error);
        }
    });

    const first = queue.submit(['b', 'a']);

    await queue.submit(['a', 'b']);
    await first;

    assert.equal(failures.length, 1);
    assert.deepEqual(sent, [['b', 'a']]);

    await queue.submit(['a', 'b']);

    assert.deepEqual(sent, [
        ['b', 'a'],
        ['a', 'b']
    ]);
});
