import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createBottomButtonRegistry,
    type BottomButtonState
} from '../src/app/logic/bottom-button';

const createFixture = () => {
    let state: BottomButtonState | null = null;
    const slot = {
        get: () => state,
        set(
            next:
                | BottomButtonState
                | null
                | ((
                      current: BottomButtonState | null
                  ) => BottomButtonState | null)
        ) {
            state = typeof next === 'function' ? next(state) : next;
        }
    };

    return { registry: createBottomButtonRegistry(slot), read: () => state };
};

const noop = () => undefined;

test('a registered owner publishes its button and clears it on unmount', () => {
    const { registry, read } = createFixture();
    const owner = registry.allocateOwner();
    const unregister = registry.register(owner, noop);

    registry.publish(owner, { text: 'Save', onClick: noop });
    assert.equal(read()?.owner, owner);
    assert.equal(read()?.text, 'Save');

    unregister();
    assert.equal(read(), null);
});

test('a late effect flush after unmount does not re-register the button', () => {
    const { registry, read } = createFixture();
    const owner = registry.allocateOwner();
    const unregister = registry.register(owner, noop);

    unregister();
    registry.publish(owner, { text: 'Save', onClick: noop });

    assert.equal(read(), null);
});

test('an unmounted owner cannot hide the button of the screen that replaced it', () => {
    const { registry, read } = createFixture();
    const previous = registry.allocateOwner();
    const next = registry.allocateOwner();
    const unregisterPrevious = registry.register(previous, noop);

    registry.register(next, noop);
    registry.publish(next, { text: 'Next', onClick: noop });
    unregisterPrevious();
    registry.publish(previous, null);

    assert.equal(read()?.owner, next);
});

test('triggering runs the current owner handler unless the button is disabled or busy', () => {
    const { registry } = createFixture();
    const calls: string[] = [];
    const owner = registry.allocateOwner();
    const unregister = registry.register(owner, () => {
        calls.push('owner');
    });

    registry.publish(owner, { text: 'Go', onClick: noop });
    registry.trigger();
    registry.publish(owner, { text: 'Go', disabled: true, onClick: noop });
    registry.trigger();
    registry.publish(owner, { text: 'Go', progress: true, onClick: noop });
    registry.trigger();
    unregister();
    registry.trigger();

    assert.deepEqual(calls, ['owner']);
});
