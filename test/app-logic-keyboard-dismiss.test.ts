import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isEnterToDismiss,
    shouldDismissKeyboard
} from '../src/app/logic/keyboard-dismiss';

const OUTSIDE_TAP = {
    activeFieldIsEditable: true,
    targetIsInsideEditable: false,
    targetIsInsideInteractive: false
};

test('a tap on plain content dismisses the keyboard of a focused field', () => {
    assert.equal(shouldDismissKeyboard(OUTSIDE_TAP), true);
});

test('a tap without a focused field has nothing to dismiss', () => {
    assert.equal(
        shouldDismissKeyboard({ ...OUTSIDE_TAP, activeFieldIsEditable: false }),
        false
    );
});

test('taps inside a field keep the keyboard', () => {
    assert.equal(
        shouldDismissKeyboard({ ...OUTSIDE_TAP, targetIsInsideEditable: true }),
        false
    );
});

test('taps on buttons, chips and other controls keep the keyboard so the click lands', () => {
    assert.equal(
        shouldDismissKeyboard({
            ...OUTSIDE_TAP,
            targetIsInsideInteractive: true
        }),
        false
    );
});

test('Enter dismisses the keyboard except while an IME composition is open', () => {
    assert.equal(isEnterToDismiss({ key: 'Enter', isComposing: false }), true);
    assert.equal(isEnterToDismiss({ key: 'Enter', isComposing: true }), false);
    assert.equal(isEnterToDismiss({ key: 'a', isComposing: false }), false);
});
