import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getContactFlowEffect,
    INITIAL_CONTACT_FLOW,
    isContactCompleted,
    isContactFlowBusy,
    isPollExpired,
    reduceContactFlow,
    runContactFlow,
    type ContactFlowDeps,
    type ContactFlowState,
    type ContactRequestOutcome
} from '../src/app/logic/contact-flow';
import type { AppFailure } from '../src/app/logic/errors';
import {
    APP_CONTACT_POLL_INTERVAL_MS,
    APP_CONTACT_POLL_TIMEOUT_MS,
    type MeDto
} from '../src/shared/app-api';

const createMe = (visibility: MeDto['visibility']): MeDto => {
    return {
        registered: visibility !== null,
        visibility,
        telegramUsername: 'tester',
        phoneMasked: null,
        payments: null,
        currency: 'UAH',
        languageChoice: 'auto',
        locale: 'en',
        wishlistFilter: null,
        canShowPublicUsername: true
    };
};

const FAILURE: AppFailure = { kind: 'api', status: 422, code: 'validation' };

interface FakeOptions {
    outcome?: ContactRequestOutcome;
    visibilityAfterPolls?: number;
    intentError?: unknown;
    pollError?: boolean;
}

const createFake = (options: FakeOptions = {}) => {
    const calls: string[] = [];
    let clock = 1000;
    let polls = 0;
    const deps: ContactFlowDeps = {
        saveIntent: type => {
            calls.push(`saveIntent:${type}`);

            return options.intentError === undefined
                ? Promise.resolve()
                : Promise.reject(options.intentError);
        },
        cancelIntent: () => {
            calls.push('cancelIntent');

            return Promise.resolve();
        },
        requestContact: () => {
            calls.push('requestContact');

            return Promise.resolve(options.outcome ?? 'sent');
        },
        fetchMe: () => {
            polls += 1;
            calls.push('fetchMe');

            if (options.pollError) {
                return Promise.reject(new Error('offline'));
            }

            return Promise.resolve(
                createMe(
                    options.visibilityAfterPolls !== undefined &&
                        polls >= options.visibilityAfterPolls
                        ? 'phone'
                        : 'username'
                )
            );
        },
        wait: milliseconds => {
            clock += milliseconds;

            return Promise.resolve();
        },
        now: () => clock,
        toFailure: () => FAILURE
    };

    return { deps, calls };
};

const collectPhases = (states: ContactFlowState[]) => {
    return states.map(state => {
        return state.phase;
    });
};

test('the reducer walks the happy path one event at a time', () => {
    let state = reduceContactFlow(INITIAL_CONTACT_FLOW, {
        kind: 'start',
        type: 'phone'
    });

    assert.equal(getContactFlowEffect(state), 'saveIntent');
    state = reduceContactFlow(state, { kind: 'intentSaved' });
    assert.equal(getContactFlowEffect(state), 'requestContact');
    state = reduceContactFlow(state, {
        kind: 'contactResult',
        outcome: 'sent',
        now: 5000
    });
    assert.deepEqual(state, {
        phase: 'polling',
        type: 'phone',
        startedAt: 5000,
        attempts: 0
    });
    assert.equal(getContactFlowEffect(state), 'pollMe');
    state = reduceContactFlow(state, {
        kind: 'polled',
        me: createMe('username'),
        now: 6000
    });
    assert.equal(state.phase, 'polling');
    assert.equal(state.phase === 'polling' && state.attempts, 1);

    const me = createMe('phone');

    state = reduceContactFlow(state, { kind: 'polled', me, now: 7000 });
    assert.deepEqual(state, { phase: 'success', type: 'phone', me });
    assert.equal(getContactFlowEffect(state), null);
    assert.equal(isContactFlowBusy(state), false);
});

test('success needs the requested visibility, not just any registration', () => {
    assert.equal(isContactCompleted(createMe('phone'), 'phone'), true);
    assert.equal(isContactCompleted(createMe('both'), 'phone'), false);
    assert.equal(isContactCompleted(createMe('both'), 'both'), true);
    assert.equal(isContactCompleted(createMe('username'), 'both'), false);
    assert.equal(isContactCompleted(null, 'phone'), false);
});

test('polling expires after the timeout and not before', () => {
    assert.equal(isPollExpired(0, APP_CONTACT_POLL_TIMEOUT_MS - 1), false);
    assert.equal(isPollExpired(0, APP_CONTACT_POLL_TIMEOUT_MS), true);

    const polling: ContactFlowState = {
        phase: 'polling',
        type: 'both',
        startedAt: 0,
        attempts: 3
    };

    assert.deepEqual(
        reduceContactFlow(polling, {
            kind: 'polled',
            me: null,
            now: APP_CONTACT_POLL_TIMEOUT_MS
        }),
        { phase: 'timeout', type: 'both' }
    );
});

test('a cancel or unsupported result clears the intent before settling', () => {
    const requesting: ContactFlowState = { phase: 'requesting', type: 'both' };
    const cancelling = reduceContactFlow(requesting, {
        kind: 'contactResult',
        outcome: 'cancelled',
        now: 0
    });

    assert.deepEqual(cancelling, {
        phase: 'cancelling',
        type: 'both',
        reason: 'cancelled'
    });
    assert.equal(getContactFlowEffect(cancelling), 'cancelIntent');
    assert.deepEqual(
        reduceContactFlow(cancelling, { kind: 'intentCancelled' }),
        {
            phase: 'cancelled',
            type: 'both'
        }
    );
    assert.deepEqual(
        reduceContactFlow(
            reduceContactFlow(requesting, {
                kind: 'contactResult',
                outcome: 'unsupported',
                now: 0
            }),
            { kind: 'intentCancelled' }
        ),
        { phase: 'unsupported', type: 'both' }
    );
});

test('events that do not fit the current phase are ignored', () => {
    const idle = INITIAL_CONTACT_FLOW;

    assert.equal(reduceContactFlow(idle, { kind: 'intentSaved' }), idle);
    assert.equal(
        reduceContactFlow(idle, { kind: 'polled', me: null, now: 0 }),
        idle
    );

    const busy: ContactFlowState = { phase: 'requesting', type: 'phone' };

    assert.equal(
        reduceContactFlow(busy, { kind: 'start', type: 'both' }),
        busy
    );
    assert.equal(reduceContactFlow(busy, { kind: 'intentSaved' }), busy);
    assert.deepEqual(reduceContactFlow(busy, { kind: 'reset' }), idle);
});

test('a finished flow can be started again', () => {
    const timedOut: ContactFlowState = { phase: 'timeout', type: 'phone' };

    assert.deepEqual(
        reduceContactFlow(timedOut, { kind: 'start', type: 'both' }),
        { phase: 'intent', type: 'both' }
    );
});

test('the runner completes when the chat finishes the registration', async () => {
    const { deps, calls } = createFake({ visibilityAfterPolls: 3 });
    const states: ContactFlowState[] = [];
    const final = await runContactFlow({
        deps,
        type: 'phone',
        onState: state => {
            states.push(state);
        }
    });

    assert.equal(final.phase, 'success');
    assert.deepEqual(calls, [
        'saveIntent:phone',
        'requestContact',
        'fetchMe',
        'fetchMe',
        'fetchMe'
    ]);
    assert.deepEqual(collectPhases(states), [
        'intent',
        'requesting',
        'polling',
        'polling',
        'polling',
        'success'
    ]);
});

test('the runner gives up after fifteen seconds of polling', async () => {
    const { deps, calls } = createFake();
    const final = await runContactFlow({ deps, type: 'both' });
    const expectedPolls =
        APP_CONTACT_POLL_TIMEOUT_MS / APP_CONTACT_POLL_INTERVAL_MS;

    assert.equal(final.phase, 'timeout');
    assert.equal(
        calls.filter(call => {
            return call === 'fetchMe';
        }).length,
        expectedPolls
    );
    assert.equal(calls.includes('cancelIntent'), false);
});

test('failed polls count against the timeout instead of ending the flow', async () => {
    const { deps } = createFake({ pollError: true });
    const final = await runContactFlow({ deps, type: 'phone' });

    assert.equal(final.phase, 'timeout');
});

test('cancelling in Telegram deletes the intent and never polls', async () => {
    const { deps, calls } = createFake({ outcome: 'cancelled' });
    const final = await runContactFlow({ deps, type: 'phone' });

    assert.equal(final.phase, 'cancelled');
    assert.deepEqual(calls, [
        'saveIntent:phone',
        'requestContact',
        'cancelIntent'
    ]);
});

test('an unsupported client also deletes the intent', async () => {
    const { deps, calls } = createFake({ outcome: 'unsupported' });
    const final = await runContactFlow({ deps, type: 'both' });

    assert.equal(final.phase, 'unsupported');
    assert.equal(calls.at(-1), 'cancelIntent');
    assert.equal(calls.includes('fetchMe'), false);
});

test('a rejected intent fails without asking for the contact', async () => {
    const { deps, calls } = createFake({ intentError: new Error('422') });
    const final = await runContactFlow({ deps, type: 'both' });

    assert.deepEqual(final, {
        phase: 'failed',
        type: 'both',
        failure: FAILURE
    });
    assert.deepEqual(calls, ['saveIntent:both']);
});

test('an aborted run stops polling and keeps the intent for the chat', async () => {
    const { deps, calls } = createFake({ visibilityAfterPolls: 99 });
    const controller = new AbortController();
    const wait = deps.wait;

    deps.wait = milliseconds => {
        controller.abort();

        return wait(milliseconds);
    };

    const final = await runContactFlow({
        deps,
        type: 'phone',
        signal: controller.signal
    });

    assert.equal(final.phase, 'polling');
    assert.equal(calls.includes('fetchMe'), false);
    assert.equal(calls.includes('cancelIntent'), false);
});
