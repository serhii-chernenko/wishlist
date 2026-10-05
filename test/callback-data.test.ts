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
    [{ type: 'navigate', screen: 'settings' }, 'n:set'],
    [{ type: 'navigate', screen: 'currency' }, 'n:cur'],
    [{ type: 'navigate', screen: 'delivery' }, 'n:dlv'],
    [{ type: 'navigate', screen: 'disclosure' }, 'n:dsc'],
    [{ type: 'navigate', screen: 'listImport' }, 'n:imp'],
    [{ type: 'wishlistPage', offset: 0 }, 'wl:p:0'],
    [{ type: 'wishlistPage', offset: 20 }, 'wl:p:20'],
    [{ type: 'wishlistClean' }, 'wl:clean'],
    [{ type: 'wishlistCleanConfirm' }, 'wl:clean:y'],
    [{ type: 'wishlistShare' }, 'wl:share'],
    [{ type: 'wishlistSharePublish' }, 'wl:share:y'],
    [{ type: 'wishlistShareStop' }, 'wl:share:stop'],
    [{ type: 'wishlistShareStopConfirm' }, 'wl:share:stop:y'],
    [{ type: 'wishlistShareRotate' }, 'wl:share:new'],
    [{ type: 'wishlistShareRotateConfirm' }, 'wl:share:new:y'],
    [{ type: 'wishlistShareUsername' }, 'wl:share:u'],
    [{ type: 'wishlistShareIndexing' }, 'wl:share:idx'],
    [{ type: 'wishlistFilterMenu' }, 'wl:f'],
    [{ type: 'wishlistFilter', filter: 0 }, 'wl:f:0'],
    [{ type: 'wishlistFilter', filter: 4 }, 'wl:f:4'],
    [{ type: 'wishlistFilter', filter: null }, 'wl:f:x'],
    [{ type: 'giftedPage', offset: 0 }, 'wl:g:0'],
    [{ type: 'giftedPage', offset: 10 }, 'wl:g:10'],
    [{ type: 'giftedRestore', wishId: 12 }, 'w:gr:12'],
    [{ type: 'giftedHide', wishId: 12 }, 'w:gh:12'],
    [{ type: 'giftedHideConfirm', wishId: 12 }, 'w:gh:y:12'],
    [{ type: 'wishEdit', wishId: 12 }, 'w:e:12'],
    [{ type: 'wishRemove', wishId: 12 }, 'w:r:12'],
    [{ type: 'wishRemoveConfirm', wishId: 12, done: true }, 'w:r:y:12'],
    [{ type: 'wishRemoveConfirm', wishId: 12, done: false }, 'w:r:n:12'],
    [{ type: 'wishPriorityMenu', wishId: 7 }, 'w:pm:7'],
    [{ type: 'wishPrioritySet', wishId: 7, level: 0 }, 'w:pl:7:0'],
    [{ type: 'wishPrioritySet', wishId: 7, level: 3 }, 'w:pl:7:3'],
    [{ type: 'wishCurrencySet', wishId: 7, currency: 'USD' }, 'w:cu:7:USD'],
    [{ type: 'wishImagesOrder', wishId: 7 }, 'w:io:7'],
    [
        { type: 'wishImageFirst', wishId: 7, index: 8, hash8: 'a1b2c3d4' },
        'w:if:7:8:a1b2c3d4'
    ],
    [
        { type: 'wishImageRemove', wishId: 7, index: 0, hash8: 'a1b2c3d4' },
        'w:ir:7:0:a1b2c3d4'
    ],
    [{ type: 'wishImagesClearConfirm', wishId: 7 }, 'w:ic:7'],
    [{ type: 'wishToggleVisibility', wishId: 7 }, 'w:v:7'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'title' }, 'w:f:t:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'description' }, 'w:f:d:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'images' }, 'w:f:i:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'link' }, 'w:f:l:3'],
    [{ type: 'wishFieldPrompt', wishId: 3, field: 'price' }, 'w:f:p:3'],
    [{ type: 'wishBack', wishId: 3 }, 'w:back:3'],
    [{ type: 'wishAdd' }, 'w:add'],
    [{ type: 'wishAddNoLink' }, 'w:add:nl'],
    [
        { type: 'linkOfferAccept', createdAt: 1_790_000_000_000 },
        'w:add:lk:1790000000000'
    ],
    [{ type: 'thirdPage', ownerId: 5, offset: 10 }, 't:p:5:10'],
    [{ type: 'thirdGive', wishId: 9 }, 't:g:9'],
    [{ type: 'thirdTake', wishId: 9 }, 't:t:9'],
    [{ type: 'thirdFilterMenu', ownerId: 5 }, 't:f:5'],
    [{ type: 'thirdFilter', ownerId: 5, filter: 2 }, 't:f:5:2'],
    [{ type: 'thirdFilter', ownerId: 5, filter: null }, 't:f:5:x'],
    [{ type: 'thirdGifted', ownerId: 5, offset: 0 }, 't:gl:5:0'],
    [{ type: 'thirdGifted', ownerId: 5, offset: 20 }, 't:gl:5:20'],
    [{ type: 'giveListPage', offset: 30 }, 'g:p:30'],
    [{ type: 'giveRemove', wishId: 9 }, 'g:r:9'],
    [{ type: 'giveRemoveConfirm', wishId: 9 }, 'g:r:y:9'],
    [{ type: 'giveRemoveKeep', wishId: 9 }, 'g:r:n:9'],
    [{ type: 'giveListClean' }, 'g:clean'],
    [{ type: 'giveListCleanConfirm' }, 'g:clean:y'],
    [{ type: 'authType', authType: 'username' }, 'a:u'],
    [{ type: 'authType', authType: 'phone' }, 'a:p'],
    [{ type: 'authType', authType: 'both' }, 'a:b'],
    [{ type: 'paymentsRemove' }, 'p:rm'],
    [{ type: 'paymentsRemoveConfirm' }, 'p:rm:y'],
    [{ type: 'currencySet', currency: 'PLN' }, 'cur:PLN'],
    [{ type: 'disclosureToggle', field: 'payments' }, 'dsc:p'],
    [{ type: 'disclosureToggle', field: 'phone' }, 'dsc:h'],
    [{ type: 'disclosureToggle', field: 'address' }, 'dsc:a'],
    [{ type: 'disclosureConfirm', field: 'phone' }, 'dsc:h:y'],
    [{ type: 'disclosureConfirm', field: 'address' }, 'dsc:a:y'],
    [{ type: 'deliveryRemove' }, 'dlv:rm'],
    [{ type: 'deliveryRemoveConfirm' }, 'dlv:rm:y'],
    [{ type: 'releasesPage', offset: 3 }, 'rel:p:3'],
    [{ type: 'language', choice: 'uk' }, 'l:uk'],
    [{ type: 'language', choice: 'en' }, 'l:en'],
    [{ type: 'language', choice: 'pl' }, 'l:pl'],
    [{ type: 'language', choice: 'auto' }, 'l:auto'],
    [{ type: 'listImportSource', source: 'rewish' }, 'imp:s:rw'],
    [
        { type: 'listImportVisibility', jobId: 42, visibility: 'hidden' },
        'imp:v:h:42'
    ],
    [
        { type: 'listImportVisibility', jobId: 42, visibility: 'public' },
        'imp:v:p:42'
    ],
    [{ type: 'listImportCommit', jobId: 42 }, 'imp:go:42'],
    [{ type: 'listImportCancel', jobId: 42 }, 'imp:x:42'],
    [{ type: 'listImportRefresh', jobId: 42 }, 'imp:r:42'],
    [{ type: 'noop' }, 'x']
];

const WORST_CASE_VARIANTS: readonly EncodableCallbackAction[] = [
    { type: 'thirdPage', ownerId: MAX_ID, offset: MAX_OFFSET },
    { type: 'thirdFilter', ownerId: MAX_ID, filter: null },
    { type: 'wishFieldPrompt', wishId: MAX_ID, field: 'description' },
    { type: 'wishRemoveConfirm', wishId: MAX_ID, done: true },
    { type: 'wishBack', wishId: MAX_ID },
    { type: 'linkOfferAccept', createdAt: MAX_ID },
    { type: 'wishlistPage', offset: MAX_OFFSET },
    { type: 'giveListPage', offset: MAX_OFFSET },
    { type: 'giftedPage', offset: MAX_OFFSET },
    { type: 'giftedHideConfirm', wishId: MAX_ID },
    { type: 'thirdGifted', ownerId: MAX_ID, offset: MAX_OFFSET },
    { type: 'giveRemoveConfirm', wishId: MAX_ID },
    { type: 'giveRemoveKeep', wishId: MAX_ID },
    { type: 'releasesPage', offset: MAX_OFFSET },
    {
        type: 'wishImageRemove',
        wishId: MAX_ID,
        index: 8,
        hash8: 'ffffffff'
    },
    { type: 'listImportVisibility', jobId: MAX_ID, visibility: 'public' },
    { type: 'listImportCommit', jobId: MAX_ID },
    { type: 'listImportCancel', jobId: MAX_ID },
    { type: 'listImportRefresh', jobId: MAX_ID }
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

test('the legacy priority toggle decodes to the priority menu', () => {
    assert.deepEqual(decodeCallbackData('w:t:7'), {
        type: 'wishPriorityMenu',
        wishId: 7
    });
    assert.equal(getCallbackCategory('w:t:7'), 'wish:priorityMenu');
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
        'w:add:nl:1',
        'w:add:lk',
        'w:add:lk:0',
        'w:add:lk:abc',
        'w:add:lk:5:6',
        'wl:f:7',
        'wl:p:-1',
        'wl:p:01',
        'wl:clean:n',
        'wl:share:',
        'wl:share:n',
        'wl:share:stop:n',
        'wl:share:new:y:1',
        'wl:share:u:1',
        'wl:share:u:y',
        'wl:share:constructor',
        'wl:share::y',
        't:p:5',
        't:f:0',
        't:f:5:9',
        'g:clean:n',
        'a:x',
        'l:ru',
        'p:add',
        'w:pl:7:4',
        'w:pl:7',
        'w:cu:7:GBP',
        'w:if:7:9:a1b2c3d4',
        'w:if:7:0:xyz',
        'cur:GBP',
        'dsc:p:y',
        'dsc:x',
        'dlv:x',
        'imp',
        'imp:s',
        'imp:s:xx',
        'imp:s:rw:1',
        'imp:v:h',
        'imp:v:x:5',
        'imp:v:h:0',
        'imp:v:h:abc',
        'imp:v:h:5:6',
        'imp:go',
        'imp:go:0',
        'imp:go:5:6',
        'imp:x:abc',
        'imp:r:-1',
        'imp:q:5',
        'wl:g',
        'wl:g:-1',
        'wl:g:1:2',
        'w:gr',
        'w:gr:0',
        'w:gh:n:5',
        'w:gh:y',
        'w:gh:y:5:6',
        'w:ir:7:9:a1b2c3d4',
        'w:ir:7:0:xyz',
        'w:ic:0',
        't:gl:5',
        't:gl:0:0',
        'g:r:x:5',
        'g:r:y',
        'g:p:1:2',
        'p:rm:n',
        'p:rm:y:1',
        'dlv:rm:n',
        'rel',
        'rel:p',
        'rel:p:-1',
        'rel:x:1',
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
    assert.equal(getCallbackCategory('w:pm:12345'), 'wish:priorityMenu');
    assert.equal(getCallbackCategory('w:pl:12345:2'), 'wish:prioritySet');
    assert.equal(getCallbackCategory('cur:EUR'), 'currency');
    assert.equal(getCallbackCategory('dsc:h:y'), 'disclosure:confirm');
    assert.equal(getCallbackCategory('x'), 'noop');
    assert.equal(getCallbackCategory('n:imp'), 'nav:listImport');
    assert.equal(getCallbackCategory('imp:s:rw'), 'import:source');
    assert.equal(getCallbackCategory('imp:v:h:12345'), 'import:visibility');
    assert.equal(getCallbackCategory('imp:go:12345'), 'import:commit');
    assert.equal(getCallbackCategory('imp:x:12345'), 'import:cancel');
    assert.equal(getCallbackCategory('imp:r:12345'), 'import:refresh');
    assert.equal(getCallbackCategory('w:add:nl'), 'wish:addNoLink');
    assert.equal(
        getCallbackCategory('w:add:lk:1790000000000'),
        'wish:linkOffer'
    );
    assert.equal(getCallbackCategory('wl:share:y'), 'wishlist:sharePublish');
    assert.equal(getCallbackCategory('wl:g:10'), 'gifted:page');
    assert.equal(getCallbackCategory('w:gh:y:12345'), 'gifted:hideConfirm');
    assert.equal(getCallbackCategory('t:gl:12345:0'), 'third:gifted');
    assert.equal(getCallbackCategory('g:r:y:12345'), 'giveList:removeConfirm');
    assert.equal(getCallbackCategory('w:ir:7:0:a1b2c3d4'), 'wish:imageRemove');
    assert.equal(getCallbackCategory('rel:p:3'), 'releases:page');
    assert.equal(
        getCallbackCategory('wl:share:stop:y'),
        'wishlist:shareStopConfirm'
    );
    assert.equal(
        getCallbackCategory('wl:share:new:y'),
        'wishlist:shareRotateConfirm'
    );

    for (const [action] of ALL_VARIANTS) {
        const category = getCallbackCategory(encodeCallbackData(action));

        assert.doesNotMatch(category, /\d/);
    }
});
