import assert from 'node:assert/strict';
import test from 'node:test';

import { createTelemetryGate } from '../src/app/logic/telemetry';

test('a repeated view of the same screen is sent once', () => {
    const gate = createTelemetryGate(2000);

    assert.equal(gate.allow({ kind: 'screenView', screen: 'home' }, 0), true);
    assert.equal(
        gate.allow({ kind: 'screenView', screen: 'home' }, 10_000),
        false
    );
    assert.equal(
        gate.allow({ kind: 'screenView', screen: 'wishes' }, 10_100),
        true
    );
    assert.equal(
        gate.allow({ kind: 'screenView', screen: 'home' }, 10_200),
        true
    );
});

test('bouncing back to a screen within the interval is not counted again', () => {
    const gate = createTelemetryGate(2000);

    gate.allow({ kind: 'screenView', screen: 'home' }, 0);
    gate.allow({ kind: 'screenView', screen: 'wishes' }, 100);

    assert.equal(
        gate.allow({ kind: 'screenView', screen: 'home' }, 500),
        false
    );
    assert.equal(
        gate.allow({ kind: 'screenView', screen: 'home' }, 2500),
        true
    );
});

test('validation failures are limited per screen, not across screens', () => {
    const gate = createTelemetryGate(2000);
    const editor = { kind: 'validationFailed', screen: 'wishEditor' } as const;

    assert.equal(gate.allow(editor, 0), true);
    assert.equal(gate.allow(editor, 1999), false);
    assert.equal(
        gate.allow({ kind: 'validationFailed', screen: 'find' }, 1999),
        true
    );
    assert.equal(gate.allow(editor, 2000), true);
});

test('different kinds on one screen do not block each other', () => {
    const gate = createTelemetryGate(2000);

    assert.equal(
        gate.allow({ kind: 'screenView', screen: 'wishEditor' }, 0),
        true
    );
    assert.equal(
        gate.allow({ kind: 'validationFailed', screen: 'wishEditor' }, 1),
        true
    );
    assert.equal(
        gate.allow({ kind: 'uploadFailed', screen: 'wishEditor' }, 2),
        true
    );
});
