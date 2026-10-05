import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    toImportedRows,
    LIST_IMPORT_ROWS_PER_STEP
} from '../src/bot/services/list-import/commit';
import {
    buildPlan,
    normalizeTitle,
    type DedupeKey
} from '../src/bot/services/list-import/plan';
import type { SourceItem } from '../src/bot/services/list-import/types';

let nextOrder = 0;

const item = (overrides: Partial<SourceItem> = {}): SourceItem => {
    const order = nextOrder;

    nextOrder += 1;

    return {
        sourceRef: `rewish:wish:${order + 1}`,
        title: `Wish ${order + 1}`,
        description: null,
        link: null,
        price: null,
        currency: null,
        foreignPrice: false,
        gifted: false,
        imageUrl: null,
        order,
        ...overrides
    };
};

const existing = (overrides: Partial<DedupeKey>): DedupeKey => {
    return { title: 'Existing', link: null, sourceRef: null, ...overrides };
};

const refsOf = (items: readonly SourceItem[]) => {
    return items.map(planned => {
        return planned.sourceRef;
    });
};

describe('list import plan: dedupe', () => {
    it('normalizes titles with NFKC, collapsed whitespace and case folding', () => {
        assert.equal(
            normalizeTitle('  Ｆｕｌｌ   Width\tTitle '),
            'full width title'
        );
        assert.equal(normalizeTitle('ПЕРЕЦЬ  Red'), 'перець red');
    });

    it('skips items whose title matches any existing wish, removed and gifted included', () => {
        const plan = buildPlan(
            [
                item({ sourceRef: 'a', title: 'Coffee  GRINDER' }),
                item({ sourceRef: 'b', title: 'Kettle' }),
                item({ sourceRef: 'c', title: 'Book' })
            ],
            [
                existing({ title: 'coffee grinder' }),
                existing({ title: 'KETTLE' })
            ],
            0
        );

        assert.deepEqual(refsOf(plan.items), ['c']);
        assert.equal(plan.counts.duplicates, 2);
        assert.equal(plan.counts.found, 3);
    });

    it('skips items whose normalized link matches, but an empty link never matches', () => {
        const plan = buildPlan(
            [
                item({
                    sourceRef: 'a',
                    link: 'http://Shop.test/item?utm_source=app#top'
                }),
                item({ sourceRef: 'b', link: null }),
                item({ sourceRef: 'c', link: '' })
            ],
            [
                existing({ title: 'Other', link: 'https://shop.test/item' }),
                existing({ title: 'Linkless', link: null }),
                existing({ title: 'Blank', link: '' })
            ],
            0
        );

        assert.deepEqual(refsOf(plan.items), ['b', 'c']);
        assert.equal(plan.counts.duplicates, 1);
    });

    it('skips items whose source ref was imported before', () => {
        const plan = buildPlan(
            [
                item({ sourceRef: 'rewish:wish:9', title: 'Renamed later' }),
                item({ sourceRef: 'rewish:wish:10' })
            ],
            [existing({ title: 'Original', sourceRef: 'rewish:wish:9' })],
            0
        );

        assert.deepEqual(refsOf(plan.items), ['rewish:wish:10']);
    });

    it('dedupes within the batch by title, link and ref', () => {
        const plan = buildPlan(
            [
                item({
                    sourceRef: 'a',
                    title: 'Mug',
                    link: 'https://shop.test/1'
                }),
                item({ sourceRef: 'b', title: 'mug' }),
                item({
                    sourceRef: 'c',
                    title: 'Cup',
                    link: 'https://shop.test/1'
                }),
                item({ sourceRef: 'a', title: 'Different' }),
                item({ sourceRef: 'd', title: 'Plate' })
            ],
            [],
            0
        );

        assert.deepEqual(refsOf(plan.items), ['a', 'd']);
        assert.equal(plan.counts.duplicates, 3);
    });
});

describe('list import plan: caps and counts', () => {
    it('limits active items to the free space under 500 while gifted ones are free', () => {
        const plan = buildPlan(
            [
                item({ sourceRef: 'a1' }),
                item({ sourceRef: 'a2' }),
                item({ sourceRef: 'a3' }),
                item({ sourceRef: 'g1', gifted: true }),
                item({ sourceRef: 'g2', gifted: true })
            ],
            [],
            498
        );

        assert.deepEqual(refsOf(plan.items), ['a1', 'a2', 'g1', 'g2']);
        assert.equal(plan.counts.active, 2);
        assert.equal(plan.counts.gifted, 2);
        assert.equal(plan.counts.overLimit, 1);
    });

    it('caps one import at 500 items, active and gifted together', () => {
        const items = Array.from({ length: 520 }, (_, index) => {
            return item({
                sourceRef: `x${index}`,
                title: `Bulk ${index}`,
                gifted: index % 2 === 1
            });
        });
        const plan = buildPlan(items, [], 0);

        assert.equal(plan.items.length, 500);
        assert.equal(plan.counts.overLimit, 20);
        assert.equal(plan.counts.active + plan.counts.gifted, 500);
        assert.equal(plan.items.at(-1)?.sourceRef, 'x499');
    });

    it('plans nothing active when the list is full', () => {
        const plan = buildPlan(
            [item({ sourceRef: 'a' }), item({ sourceRef: 'g', gifted: true })],
            [],
            500
        );

        assert.deepEqual(refsOf(plan.items), ['g']);
        assert.equal(plan.counts.overLimit, 1);
    });

    it('counts planned items without a price in our currencies and without a photo', () => {
        const plan = buildPlan(
            [
                item({ foreignPrice: true }),
                item({
                    price: 100,
                    currency: 'UAH',
                    imageUrl: 'https://storage.rewish.io/1'
                }),
                item({
                    foreignPrice: true,
                    imageUrl: 'https://storage.rewish.io/2'
                })
            ],
            [],
            0
        );

        assert.equal(plan.counts.withoutPrice, 2);
        assert.equal(plan.counts.withoutPhoto, 1);
    });

    it('keeps the source order of planned items', () => {
        const items = [
            item({ sourceRef: 'first' }),
            item({ sourceRef: 'second' }),
            item({ sourceRef: 'third', gifted: true })
        ];
        const plan = buildPlan(items, [], 0);

        assert.deepEqual(refsOf(plan.items), ['first', 'second', 'third']);
    });
});

describe('list import rows', () => {
    const base = Date.UTC(2026, 9, 4, 12);
    const stepAt = new Date(base + 5000);

    it('maps gifted items to gifted wishes and applies the hidden choice to all', () => {
        const rows = toImportedRows(
            [
                item({ sourceRef: 'a', order: 0 }),
                item({ sourceRef: 'g', gifted: true, order: 1 })
            ],
            {
                userId: 7,
                visibility: 'hidden',
                fallbackCurrency: 'PLN',
                orderBase: base
            },
            stepAt
        );

        assert.deepEqual(
            rows.map(row => {
                return [row.sourceRef, row.hidden, row.removed, row.done];
            }),
            [
                ['a', true, false, false],
                ['g', true, true, true]
            ]
        );
    });

    it('falls back to the owner currency without a price and orders by source position', () => {
        const rows = toImportedRows(
            [
                item({ order: 0, price: 250, currency: 'EUR' }),
                item({ order: 3 })
            ],
            {
                userId: 7,
                visibility: 'public',
                fallbackCurrency: 'PLN',
                orderBase: base
            },
            stepAt
        );

        assert.deepEqual(
            rows.map(row => {
                return [row.price, row.currency, row.hidden];
            }),
            [
                [250, 'EUR', false],
                [0, 'PLN', false]
            ]
        );
        assert.equal(rows[0]?.updatedAt.getTime(), base);
        assert.equal(rows[1]?.updatedAt.getTime(), base - 3);
        assert.equal(rows[1]?.createdAt.getTime(), stepAt.getTime());
    });

    it('inserts at most 49 rows per step', () => {
        assert.equal(LIST_IMPORT_ROWS_PER_STEP, 49);
    });
});
