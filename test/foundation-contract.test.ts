import assert from 'node:assert/strict';
import test from 'node:test';

import { drizzle } from 'drizzle-orm/d1';

import {
    CALLBACK_DATA_MAX_BYTES,
    decodeCallbackData,
    encodeCallbackData,
    getCallbackCategory,
    type EncodableCallbackAction
} from '../src/bot/callback-data';
import { D1_BOUND_PARAMETER_CEILING } from '../src/db/repositories/chunk';
import {
    buildPriceFilterCondition,
    WISH_LIST_ORDER
} from '../src/db/repositories/wish-repository';
import { wishes } from '../src/db/schema';
import {
    CURRENCIES,
    FALLBACK_RATES,
    toPriceBoundsByCurrency,
    WISH_FILTER_VALUES
} from '../src/shared/money';

const MAX_ID = 9_007_199_254_740_991;
const MAX_PRICE_FILTER_PARAMETERS = CURRENCIES.length * 3;
const offlineDb = drizzle({} as D1Database);

const toFilterQuery = (filter: (typeof WISH_FILTER_VALUES)[number]) => {
    return offlineDb
        .select({ id: wishes.id })
        .from(wishes)
        .where(
            buildPriceFilterCondition(
                toPriceBoundsByCurrency(filter, 'UAH', FALLBACK_RATES)
            )
        )
        .toSQL();
};

test('the price filter is one OR over per-currency bounds within the D1 parameter ceiling', () => {
    for (const filter of WISH_FILTER_VALUES) {
        const query = toFilterQuery(filter);

        assert.ok(query.params.length <= MAX_PRICE_FILTER_PARAMETERS);
        assert.ok(query.params.length < D1_BOUND_PARAMETER_CEILING);

        for (const currency of CURRENCIES) {
            assert.ok(query.params.includes(currency), currency);
        }
    }

    assert.equal(toFilterQuery(1).params.length, MAX_PRICE_FILTER_PARAMETERS);
    assert.match(toFilterQuery(1).sql, / or /);
});

test('no price filter adds no condition', () => {
    assert.equal(buildPriceFilterCondition(null), undefined);
});

test('wish lists order by priority level, then most recently updated, then id', () => {
    const { sql } = offlineDb
        .select({ id: wishes.id })
        .from(wishes)
        .orderBy(...WISH_LIST_ORDER)
        .toSQL();

    assert.match(
        sql,
        /order by "wishes"\."priority_level" desc, "wishes"\."updated_at" desc, "wishes"\."id" desc$/
    );
});

const LONGEST_NEW_ACTIONS: readonly EncodableCallbackAction[] = [
    { type: 'wishPriorityMenu', wishId: MAX_ID },
    { type: 'wishPrioritySet', wishId: MAX_ID, level: 3 },
    { type: 'wishCurrencySet', wishId: MAX_ID, currency: 'UAH' },
    { type: 'wishImagesOrder', wishId: MAX_ID },
    {
        type: 'wishImageFirst',
        wishId: MAX_ID,
        index: 8,
        hash8: 'ffffffff'
    },
    { type: 'currencySet', currency: 'PLN' },
    { type: 'disclosureToggle', field: 'payments' },
    { type: 'disclosureToggle', field: 'phone' },
    { type: 'disclosureToggle', field: 'address' },
    { type: 'disclosureConfirm', field: 'phone' },
    { type: 'disclosureConfirm', field: 'address' },
    { type: 'deliveryRemove' },
    { type: 'wishlistShareIndexing' },
    { type: 'navigate', screen: 'settings' },
    { type: 'navigate', screen: 'currency' },
    { type: 'navigate', screen: 'delivery' },
    { type: 'navigate', screen: 'disclosure' }
];

test('every new callback code fits in 64 bytes and round-trips', () => {
    for (const action of LONGEST_NEW_ACTIONS) {
        const data = encodeCallbackData(action);

        assert.ok(
            new TextEncoder().encode(data).length <= CALLBACK_DATA_MAX_BYTES,
            data
        );
        assert.deepEqual(decodeCallbackData(data), action, data);
    }
});

test('the legacy priority toggle button opens the priority menu', () => {
    assert.deepEqual(decodeCallbackData('w:t:42'), {
        type: 'wishPriorityMenu',
        wishId: 42
    });
    assert.equal(
        encodeCallbackData({ type: 'wishPriorityMenu', wishId: 42 }),
        'w:pm:42'
    );
    assert.equal(getCallbackCategory('w:t:42'), 'wish:priorityMenu');
    assert.equal(getCallbackCategory('w:pl:42:2'), 'wish:prioritySet');
});

test('malformed new callback codes decode as outdated', () => {
    for (const data of [
        'w:pl:42:4',
        'w:pl:42',
        'w:cu:42:GBP',
        'w:if:42:9:ffffffff',
        'w:if:42:1:FFFFFFFF',
        'w:if:42:1:fff',
        'cur:usd',
        'cur:UAH:x',
        'dsc:p:y',
        'dsc:x',
        'dlv:add',
        'wl:share:idx:y'
    ]) {
        assert.deepEqual(decodeCallbackData(data), { type: 'outdated' }, data);
    }
});
