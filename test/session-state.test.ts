import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createDefaultSessionState,
    decodeSessionLanguage,
    decodeSessionState,
    encodeSessionState,
    isSameSessionState,
    saveSessionIfChanged
} from '../src/bot/runtime/session-store';
import type { SessionState } from '../src/bot/runtime/types';

const DEFAULT_STATE: SessionState = { v: 1, pendingInput: null, find: null };

test('empty and legacy default rows decode to the default state', () => {
    assert.deepEqual(decodeSessionState(null), DEFAULT_STATE);
    assert.deepEqual(decodeSessionState(undefined), DEFAULT_STATE);
    assert.deepEqual(decodeSessionState(''), DEFAULT_STATE);
    assert.deepEqual(decodeSessionState('{"v":1}'), DEFAULT_STATE);
});

test('every pending input variant round-trips', () => {
    const states: SessionState[] = [
        { v: 1, pendingInput: { kind: 'wishTitleNew' }, find: null },
        {
            v: 1,
            pendingInput: { kind: 'wishField', wishId: 42, field: 'images' },
            find: null
        },
        { v: 1, pendingInput: { kind: 'findQuery' }, find: null },
        { v: 1, pendingInput: { kind: 'feedback' }, find: null },
        { v: 1, pendingInput: { kind: 'payments' }, find: null },
        {
            v: 1,
            pendingInput: { kind: 'contact', authType: 'both' },
            find: { targetUserId: 7, query: '@friend', filter: 2 }
        },
        {
            v: 1,
            pendingInput: null,
            find: { targetUserId: 7, query: '380501234567', filter: null }
        }
    ];

    for (const state of states) {
        assert.deepEqual(decodeSessionState(encodeSessionState(state)), state);
    }
});

test('invalid values reset to the default state', () => {
    const invalid = [
        'not json',
        '[]',
        'null',
        '{"v":2,"pendingInput":null,"find":null}',
        '{"v":"1"}',
        '{"v":1,"pendingInput":{"kind":"unknown"}}',
        '{"v":1,"pendingInput":{"kind":"wishField","wishId":0,"field":"title"}}',
        '{"v":1,"pendingInput":{"kind":"wishField","wishId":5,"field":"color"}}',
        '{"v":1,"pendingInput":{"kind":"contact","authType":"username"}}',
        '{"v":1,"pendingInput":"feedback"}',
        '{"v":1,"find":{"targetUserId":"7","query":"x","filter":null}}',
        '{"v":1,"find":{"targetUserId":7,"query":"x","filter":5}}',
        '{"v":1,"find":{"targetUserId":7}}'
    ];

    for (const raw of invalid) {
        assert.deepEqual(decodeSessionState(raw), DEFAULT_STATE, raw);
    }
});

test('database objects never survive decoding, only ids', () => {
    const state = decodeSessionState(
        JSON.stringify({
            v: 1,
            pendingInput: {
                kind: 'wishField',
                wishId: 3,
                field: 'title',
                wish: { title: 'leaked' }
            },
            find: null,
            user: { id: 1 }
        })
    );

    assert.equal(
        encodeSessionState(state),
        '{"v":1,"pendingInput":{"kind":"wishField","wishId":3,"field":"title"},"find":null}'
    );
});

test('session language accepts only supported locales', () => {
    assert.equal(decodeSessionLanguage('uk'), 'uk');
    assert.equal(decodeSessionLanguage('pl'), 'pl');
    assert.equal(decodeSessionLanguage('ru'), null);
    assert.equal(decodeSessionLanguage(null), null);
});

test('state is saved only when it changed', async () => {
    const saved: string[] = [];
    const { Effect } = await import('effect');
    const repos = {
        sessions: {
            saveState(_telegramUserId: number, state: string | object) {
                saved.push(String(state));
                return Effect.succeed(undefined);
            }
        }
    } as unknown as Parameters<typeof saveSessionIfChanged>[0];
    const initial = createDefaultSessionState();

    assert.equal(
        await saveSessionIfChanged(
            repos,
            1,
            initial,
            createDefaultSessionState(),
            new Date()
        ),
        false
    );
    assert.equal(
        await saveSessionIfChanged(
            repos,
            1,
            initial,
            { ...initial, pendingInput: { kind: 'feedback' } },
            new Date()
        ),
        true
    );
    assert.deepEqual(saved, [
        '{"v":1,"pendingInput":{"kind":"feedback"},"find":null}'
    ]);
    assert.ok(
        isSameSessionState(initial, { v: 1, pendingInput: null, find: null })
    );
});
