import type { PageDto } from '../../shared/app-api';

export type KeyOf<Item> = (item: Item) => number;

export interface RemovedItem<Item> {
    item: Item;
    index: number;
}

export const patchItem = <Item>(
    items: readonly Item[],
    keyOf: KeyOf<Item>,
    key: number,
    patch: Partial<Item>
): Item[] => {
    return items.map(item => {
        return keyOf(item) === key ? { ...item, ...patch } : item;
    });
};

export const replaceItem = <Item>(
    items: readonly Item[],
    keyOf: KeyOf<Item>,
    next: Item
): Item[] => {
    const key = keyOf(next);

    return items.map(item => {
        return keyOf(item) === key ? next : item;
    });
};

export const pickFields = <Item, Field extends keyof Item>(
    item: Item,
    fields: readonly Field[]
): Pick<Item, Field> => {
    const picked = {} as Pick<Item, Field>;

    for (const field of fields) {
        picked[field] = item[field];
    }

    return picked;
};

/** Undoes an optimistic patch only for fields nobody changed since, so a rollback never clobbers a newer toggle. */
export const revertPatch = <Item>(
    items: readonly Item[],
    keyOf: KeyOf<Item>,
    key: number,
    applied: Partial<Item>,
    previous: Partial<Item>
): Item[] => {
    return items.map(item => {
        if (keyOf(item) !== key) {
            return item;
        }

        const reverted = { ...item };

        for (const field of Object.keys(applied) as (keyof Item)[]) {
            if (Object.is(item[field], applied[field]) && field in previous) {
                reverted[field] = previous[field] as Item[keyof Item];
            }
        }

        return reverted;
    });
};

export const removeItem = <Item>(
    items: readonly Item[],
    keyOf: KeyOf<Item>,
    key: number
) => {
    const index = items.findIndex(item => keyOf(item) === key);
    const item = items[index];

    if (item === undefined) {
        return { items: [...items], removed: null };
    }

    return {
        items: items.filter((_, position) => position !== index),
        removed: { item, index } satisfies RemovedItem<Item>
    };
};

export const restoreItem = <Item>(
    items: readonly Item[],
    keyOf: KeyOf<Item>,
    removed: RemovedItem<Item>
): Item[] => {
    const key = keyOf(removed.item);

    if (items.some(item => keyOf(item) === key)) {
        return [...items];
    }

    const index = Math.min(Math.max(0, removed.index), items.length);

    return [...items.slice(0, index), removed.item, ...items.slice(index)];
};

export const patchInPage = <Item, Page extends PageDto<Item>>(
    page: Page,
    keyOf: KeyOf<Item>,
    key: number,
    patch: Partial<Item>
): Page => {
    return { ...page, items: patchItem(page.items, keyOf, key, patch) };
};

export const replaceInPage = <Item, Page extends PageDto<Item>>(
    page: Page,
    keyOf: KeyOf<Item>,
    next: Item
): Page => {
    return { ...page, items: replaceItem(page.items, keyOf, next) };
};

export const revertInPage = <Item, Page extends PageDto<Item>>(
    page: Page,
    keyOf: KeyOf<Item>,
    key: number,
    applied: Partial<Item>,
    previous: Partial<Item>
): Page => {
    return {
        ...page,
        items: revertPatch(page.items, keyOf, key, applied, previous)
    };
};

export const removeFromPage = <Item, Page extends PageDto<Item>>(
    page: Page,
    keyOf: KeyOf<Item>,
    key: number
) => {
    const { items, removed } = removeItem(page.items, keyOf, key);

    return {
        page: {
            ...page,
            items,
            total: removed === null ? page.total : Math.max(0, page.total - 1),
            nextOffset:
                removed === null || page.nextOffset === null
                    ? page.nextOffset
                    : Math.max(0, page.nextOffset - 1)
        },
        removed
    };
};

export const restoreToPage = <Item, Page extends PageDto<Item>>(
    page: Page,
    keyOf: KeyOf<Item>,
    removed: RemovedItem<Item>
): Page => {
    const items = restoreItem(page.items, keyOf, removed);
    const restored = items.length > page.items.length;

    return {
        ...page,
        items,
        total: restored ? page.total + 1 : page.total,
        nextOffset:
            restored && page.nextOffset !== null
                ? page.nextOffset + 1
                : page.nextOffset
    };
};

/** Appends a "Show more" page, skipping items that shifted into it after a removal. */
export const appendPage = <Item, Page extends PageDto<Item>>(
    page: Page,
    next: PageDto<Item>,
    keyOf: KeyOf<Item>
): Page => {
    const known = new Set(page.items.map(keyOf));

    return {
        ...page,
        items: [
            ...page.items,
            ...next.items.filter(item => !known.has(keyOf(item)))
        ],
        total: next.total,
        nextOffset: next.nextOffset
    };
};

/** Reloads from the first page until at least `minimum` items are back, so a revalidation keeps everything "Show more" had loaded, in the server's current order. */
export const loadPagesUntil = async <Item, Page extends PageDto<Item>>(
    fetchPage: (offset: number) => Promise<Page>,
    minimum: number,
    keyOf: KeyOf<Item>
): Promise<Page> => {
    let page = await fetchPage(0);

    while (page.items.length < minimum && page.nextOffset !== null) {
        page = appendPage(page, await fetchPage(page.nextOffset), keyOf);
    }

    return page;
};

export const emptyPage = <Page extends PageDto<unknown>>(page: Page): Page => {
    return { ...page, items: [], total: 0, nextOffset: null };
};

export interface OptimisticAction<Result> {
    apply(): void;
    commit(): Promise<Result>;
    rollback(): void;
    settle?(result: Result): void;
    fail?(error: unknown): void;
}

/** Applies the change at once, then keeps it with the server answer or rolls it back and reports the error. */
export const runOptimistic = async <Result>(
    action: OptimisticAction<Result>
): Promise<boolean> => {
    action.apply();

    let result: Result;

    try {
        result = await action.commit();
    } catch (error) {
        action.rollback();
        action.fail?.(error);

        return false;
    }

    action.settle?.(result);

    return true;
};

/** Hands out increasing tickets so only the latest of several overlapping requests applies its answer. */
export const createLatestGate = () => {
    let latest = 0;

    return {
        next() {
            latest += 1;

            return latest;
        },
        isLatest(ticket: number) {
            return ticket === latest;
        }
    };
};
