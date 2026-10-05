import assert from 'node:assert/strict';
import test from 'node:test';

import { settleNativeCall } from '../src/app/logic/native-call';

test('a native call settles with the callback value', async () => {
    const value = await settleNativeCall<string | null>(settle => {
        setTimeout(() => {
            settle('confirm');
        }, 0);

        return true;
    }, null);

    assert.equal(value, 'confirm');
});

test('a throwing native call settles with the fallback instead of hanging', async () => {
    const value = await settleNativeCall<boolean>(() => {
        throw new Error('WebAppMethodUnsupported');
    }, false);

    assert.equal(value, false);
});

test('an unavailable native call settles with the fallback', async () => {
    assert.equal(
        await settleNativeCall(() => false, 'unsupported'),
        'unsupported'
    );
});

test('a call that settles and then throws keeps the first value', async () => {
    const value = await settleNativeCall<string>(settle => {
        settle('sent');
        throw new Error('late');
    }, 'unsupported');

    assert.equal(value, 'sent');
});

test('later callbacks are ignored once settled', async () => {
    const value = await settleNativeCall<number>(settle => {
        settle(1);
        settle(2);

        return true;
    }, 0);

    assert.equal(value, 1);
});
