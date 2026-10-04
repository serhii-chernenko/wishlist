import assert from 'node:assert/strict';
import test from 'node:test';

import {
    decodeCallbackData,
    encodeCallbackData,
    getCallbackCategory
} from '../src/bot/callback-data';
import { WISH_PRIORITY_LEVELS } from '../src/shared/app-api';

const WISH_ID = 4821;

test('every priority level round-trips through w:pl', () => {
    for (const level of Object.values(WISH_PRIORITY_LEVELS)) {
        const action = {
            type: 'wishPrioritySet',
            wishId: WISH_ID,
            level
        } as const;
        const data = encodeCallbackData(action);

        assert.equal(data, `w:pl:${WISH_ID}:${level}`);
        assert.deepEqual(decodeCallbackData(data), action);
        assert.equal(getCallbackCategory(data), 'wish:prioritySet');
    }
});

test('levels outside none to high are rejected', () => {
    for (const level of ['4', '-1', 'x', '', '1.5']) {
        assert.deepEqual(
            decodeCallbackData(`w:pl:${WISH_ID}:${level}`),
            { type: 'outdated' },
            level
        );
    }
});

test('the legacy w:t button and the new menu button both open the menu', () => {
    const menu = { type: 'wishPriorityMenu', wishId: WISH_ID } as const;

    assert.deepEqual(decodeCallbackData(`w:t:${WISH_ID}`), menu);
    assert.deepEqual(decodeCallbackData(encodeCallbackData(menu)), menu);
});
