import assert from 'node:assert/strict';
import test from 'node:test';

import {
    appendPage,
    createLatestGate,
    emptyPage,
    patchInPage,
    pickFields,
    removeFromPage,
    replaceInPage,
    restoreToPage,
    revertInPage,
    runOptimistic
} from '../src/app/logic/optimistic';
import type { PageDto } from '../src/shared/app-api';

interface Item {
    id: number;
    priority: boolean;
    hidden: boolean;
}

const keyOf = (item: Item) => item.id;

const item = (id: number, patch: Partial<Item> = {}): Item => {
    return { id, priority: false, hidden: false, ...patch };
};

const page = (
    items: Item[],
    total = items.length,
    nextOffset: number | null = null
): PageDto<Item> & { filter: number | null } => {
    return { items, total, nextOffset, filter: null };
};

test('patch and replace touch only the matching item and keep extra fields', () => {
    const start = page([item(1), item(2)]);
    const patched = patchInPage(start, keyOf, 2, { priority: true });

    assert.deepEqual(patched.items, [item(1), item(2, { priority: true })]);
    assert.equal(patched.filter, null);
    assert.deepEqual(
        replaceInPage(patched, keyOf, item(1, { hidden: true })).items,
        [item(1, { hidden: true }), item(2, { priority: true })]
    );
    assert.deepEqual(start.items, [item(1), item(2)]);
});

test('a rollback restores previous values unless a newer change landed', () => {
    const start = page([item(1)]);
    const applied = { priority: true };
    const previous = pickFields(start.items[0] as Item, ['priority']);
    const optimistic = patchInPage(start, keyOf, 1, applied);

    assert.deepEqual(
        revertInPage(optimistic, keyOf, 1, applied, previous).items,
        [item(1)]
    );

    const newer = patchInPage(optimistic, keyOf, 1, { priority: false });

    assert.deepEqual(
        revertInPage(
            patchInPage(newer, keyOf, 1, { hidden: true }),
            keyOf,
            1,
            { ...applied, hidden: true },
            { priority: false, hidden: false }
        ).items,
        [item(1)]
    );
});

test('removing and restoring keeps position, total and offset in step', () => {
    const start = page([item(1), item(2), item(3)], 25, 3);
    const { page: without, removed } = removeFromPage(start, keyOf, 2);

    assert.deepEqual(without.items.map(keyOf), [1, 3]);
    assert.equal(without.total, 24);
    assert.equal(without.nextOffset, 2);
    assert.ok(removed);

    const restored = restoreToPage(without, keyOf, removed);

    assert.deepEqual(restored.items.map(keyOf), [1, 2, 3]);
    assert.equal(restored.total, 25);
    assert.equal(restored.nextOffset, 3);
    assert.deepEqual(restoreToPage(restored, keyOf, removed), restored);
});

test('removing a missing item changes nothing', () => {
    const start = page([item(1)], 1, null);
    const { page: same, removed } = removeFromPage(start, keyOf, 9);

    assert.equal(removed, null);
    assert.deepEqual(same, start);
});

test('a restore after the list shrank clamps the index', () => {
    const { page: without, removed } = removeFromPage(
        page([item(1), item(2), item(3)]),
        keyOf,
        3
    );

    assert.ok(removed);

    const shrunk = removeFromPage(without, keyOf, 2).page;

    assert.deepEqual(
        restoreToPage(shrunk, keyOf, removed).items.map(keyOf),
        [1, 3]
    );
});

test('show more appends without duplicates and takes the new cursor', () => {
    const first = page([item(1), item(2)], 5, 2);
    const merged = appendPage(first, page([item(2), item(3)], 4, 4), keyOf);

    assert.deepEqual(merged.items.map(keyOf), [1, 2, 3]);
    assert.equal(merged.total, 4);
    assert.equal(merged.nextOffset, 4);
    assert.equal(merged.filter, null);
});

test('an emptied page keeps its extra fields', () => {
    const cleared = emptyPage({ ...page([item(1)], 1, null), filter: 3 });

    assert.deepEqual(cleared, {
        items: [],
        total: 0,
        nextOffset: null,
        filter: 3
    });
});

test('a successful optimistic action applies, commits and settles', async () => {
    const calls: string[] = [];
    const ok = await runOptimistic({
        apply: () => calls.push('apply'),
        commit: async () => {
            calls.push('commit');

            return 42;
        },
        rollback: () => calls.push('rollback'),
        settle: result => calls.push(`settle:${result}`),
        fail: () => calls.push('fail')
    });

    assert.equal(ok, true);
    assert.deepEqual(calls, ['apply', 'commit', 'settle:42']);
});

test('a failed optimistic action rolls back before reporting', async () => {
    const calls: string[] = [];
    const failure = new Error('nope');
    const ok = await runOptimistic({
        apply: () => calls.push('apply'),
        commit: () => Promise.reject(failure),
        rollback: () => calls.push('rollback'),
        settle: () => calls.push('settle'),
        fail: error => calls.push(error === failure ? 'fail' : 'other')
    });

    assert.equal(ok, false);
    assert.deepEqual(calls, ['apply', 'rollback', 'fail']);
});

test('only the latest ticket of overlapping requests wins', () => {
    const gate = createLatestGate();
    const first = gate.next();
    const second = gate.next();

    assert.equal(gate.isLatest(first), false);
    assert.equal(gate.isLatest(second), true);
});
