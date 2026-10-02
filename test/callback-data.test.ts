import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CALLBACK_DATA_MAX_BYTES,
    decodeCallbackData,
    encodeCallbackData,
    getCallbackCategory,
    type EncodableCallbackAction
} from '../src/bot/callback-data';

const MAX_ID = 9_007_199_254_740_991;
const MAX_OFFSET = 999_999_999;

const ALL_VARIANTS: readonly [EncodableCallbackAction, string][] = [
    [{ type: 'navigate', screen: 'home' }, 'n:home'],
    [{ type: 'navigate', screen: 'privacy' }, 'n:priv'],
    [{ type: 'navigate', screen: 'auth' }, 'n:auth'],
    [{ type: 'navigate', screen: 'wishlist' }, 'n:wl'],
    [{ type: 'navigate', screen: 'wishAdd' }, 'n:add'],
    [{ type: 'navigate', screen: 'giveList' }, 'n:gl'],
    [{ type: 'navigate', screen: 'findList' }, 'n:find'],
    [{ type: 'navigate', screen: 'feedback' }, 'n:fb'],
    [{ type: 'navigate', screen: 'stats' }, 'n:stats'],
    [{ type: 'navigate', screen: 'donate' }, 'n:don'],
    [{ type: 'navigate', screen: 'payments' }, 'n:pay'],
    [{ type: 'navigate', screen: 'language' }, 'n:lang'],
    [{ type: 'navigate', screen: 'releases' }, 'n:rel'],
    [{ type: 'wishlistPage', offset: 0 }, 'wl:p:0'],
    [{ type: 'wishlistPage', offset: 20 }, 'wl:p:20'],
    [{ type: 'wishlistClean' }, 'wl:clean'],
    [{ type: 'wishlistCleanConfirm' }, 'wl:clean:y'],
    [{ type: 'wishlistShare' }, 'wl:share'],
    [{ type: 'wishlistFilterMenu' }, 'wl:f'],
    [{ type: 'wishlistFilter', filter: 0 }, 'wl:f:0'],
    [{ type: 'wishlistFilter', filter: 4 }, 'wl:f:4'],
    [{ type: 'wishlistFilter', filter: null }, 'wl:f:x'],
    [{ type: 'wishEdit', wishId: 12 }, 'w:e:12'],
    [{ type: 'wishRemove', wishId: 12 }, 'w:r:12'],
    [{ type: 'wishRemoveConfirm', wishId: 12, done: true }, 'w:r:y:12'],
    [{ type: 'wishRemoveConfirm', wishId: 12, done: false }, 'w:r:n:12'],
    [{ type: 'wishTogglePriority', wishId: 7 }, 'w:t:7'],
    [{ type: 'wishToggleVisibility', wishId: 7 }, 'w:v:7'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'title' }, 'w:f:t:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'description' }, 'w:f:d:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'images' }, 'w:f:i:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'link' }, 'w:f:l:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'price' }, 'w:f:p:3'],
    [{ type: 'wishBack', wishId: 3 }, 'w:back:3'],
    [{ type: 'wishAdd' }, 'w:add'],
    [{ type: 'thirdPage', ownerId: 5, offset: 10 }, 't:p:5:10'],
    [{ type: 'thirdGive', wishId: 9 }, 't:g:9'],
    [{ type: 'thirdTake', wishId: 9 }, 't:t:9'],
    [{ type: 'thirdFilterMenu', ownerId: 5 }, 't:f:5'],
    [{ type: 'thirdFilter', ownerId: 5, filter: 2 }, 't:f:5:2'],
    [{ type: 'thirdFilter', ownerId: 5, filter: null }, 't:f:5:x'],
    [{ type: 'giveListPage', offset: 30 }, 'g:p:30'],
    [{ type: 'giveRemove', wishId: 9 }, 'g:r:9'],
    [{ type: 'giveListClean' }, 'g:clean'],
    [{ type: 'giveListCleanConfirm' }, 'g:clean:y'],
    [{ type: 'authType', authType: 'username' }, 'a:u'],
    [{ type: 'authType', authType: 'phone' }, 'a:p'],
    [{ type: 'authType', authType: 'both' }, 'a:b'],
    [{ type: 'paymentsRemove' }, 'p:rm'],
    [{ type: 'language', choice: 'uk' }, 'l:uk'],
    [{ type: 'language', choice: 'en' }, 'l:en'],
    [{ type: 'language', choice: 'pl' }, 'l:pl'],
    [{ type: 'language', choice: 'auto' }, 'l:auto'],
    [{ type: 'noop' }, 'x']
];

const WORST_CASE_VARIANTS: readonly EncodableCallbackAction[] = [
    { type: 'thirdPage', ownerId: MAX_ID, offset: MAX_OFFSET },
    { type: 'thirdFilter', ownerId: MAX_ID, filter: null },
    { type: 'wishFieldPrompt', wishId: MAX_ID, field: 'description' },
    { type: 'wishRemoveConfirm', wishId: MAX_ID, done: true },
    { type: 'wishBack', wishId: MAX_ID },
    { type: 'wishlistPage', offset: MAX_OFFSET },
    { type: 'giveListPage', offset: MAX_OFFSET }
];

const byteLength = (value: string): number => {
    return new TextEncoder().encode(value).length;
};

test('every C2 variant encodes to the documented data and round-trips', () => {
    for (const [action, data] of ALL_VARIANTS) {
        assert.equal(encodeCallbackData(action), data);
        assert.deepEqual(decodeCallbackData(data), action);
    }
});

test('worst-case ids and offsets stay within the 64-byte limit', () => {
    for (const action of WORST_CASE_VARIANTS) {
        const data = encodeCallbackData(action);

        assert.ok(byteLength(data) <= CALLBACK_DATA_MAX_BYTES, data);
        assert.deepEqual(decodeCallbackData(data), action);
    }
});

test('legacy screen ids map to navigation', () => {
    const legacy: readonly [string, string][] = [
        ['greeting', 'home'],
        ['privacy', 'privacy'],
        ['auth', 'auth'],
        ['wishlist', 'wishlist'],
        ['wishlist_add', 'wishAdd'],
        ['find_list', 'findList'],
        ['give_list', 'giveList'],
        ['feedback', 'feedback'],
        ['stats', 'stats'],
        ['donate', 'donate'],
        ['payments', 'payments']
    ];

    for (const [data, screen] of legacy) {
        assert.deepEqual(decodeCallbackData(data), {
            type: 'navigate',
            screen
        });
        assert.equal(getCallbackCategory(data), 'legacy');
    }
});

test('other legacy data decodes as outdated', () => {
    const legacy = [
        'edit_64b7f0c2a1e4d3b2c1a09876',
        'remove_64b7f0c2a1e4d3b2c1a09876',
        'give_64b7f0c2a1e4d3b2c1a09876',
        'take_64b7f0c2a1e4d3b2c1a09876',
        'filter_3',
        'filter_reset',
        'username',
        'yes',
        'clean',
        'share',
        'title',
        'wishlist_edit'
    ];

    for (const data of legacy) {
        assert.deepEqual(decodeCallbackData(data), { type: 'outdated' });
        assert.equal(getCallbackCategory(data), 'legacy');
    }
});

test('malformed new-style data decodes as outdated', () => {
    const malformed = [
        undefined,
        '',
        'n:unknown',
        'n:home:extra',
        'w:e:abc',
        'w:e:0',
        'w:e:-1',
        'w:e:12:3',
        'w:e:99999999999999999',
        'w:r:y',
        'w:r:z:5',
        'w:f:q:5',
        'w:f:t',
        'w:add:1',
        'wl:f:7',
        'wl:p:-1',
        'wl:p:01',
        'wl:clean:n',
        't:p:5',
        't:f:0',
        't:f:5:9',
        'g:clean:n',
        'a:x',
        'l:ru',
        'p:add',
        'zz:1'
    ];

    for (const data of malformed) {
        assert.deepEqual(decodeCallbackData(data), { type: 'outdated' }, data);
    }

    assert.equal(getCallbackCategory('w:e:abc'), 'invalid');
    assert.equal(getCallbackCategory(undefined), 'invalid');
});

test('callback categories are closed and never contain ids', () => {
    assert.equal(getCallbackCategory('n:wl'), 'nav:wishlist');
    assert.equal(getCallbackCategory('w:e:12345'), 'wish:edit');
    assert.equal(getCallbackCategory('t:g:12345'), 'third:give');
    assert.equal(getCallbackCategory('x'), 'noop');

    for (const [action] of ALL_VARIANTS) {
        const category = getCallbackCategory(encodeCallbackData(action));

        assert.doesNotMatch(category, /\d/);
    }
});
