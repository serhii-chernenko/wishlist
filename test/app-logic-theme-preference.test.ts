import assert from 'node:assert/strict';
import test from 'node:test';

import {
    nextThemePreference,
    parseThemePreference,
    resolveColorScheme
} from '../src/app/logic/theme-preference';

test('stored values parse to a known preference or system', () => {
    assert.equal(parseThemePreference('dark'), 'dark');
    assert.equal(parseThemePreference('light'), 'light');
    assert.equal(parseThemePreference('system'), 'system');
    assert.equal(parseThemePreference('sepia'), 'system');
    assert.equal(parseThemePreference(null), 'system');
    assert.equal(parseThemePreference(undefined), 'system');
});

test('system follows the client scheme and explicit choices ignore it', () => {
    assert.equal(resolveColorScheme('system', 'dark'), 'dark');
    assert.equal(resolveColorScheme('system', 'light'), 'light');
    assert.equal(resolveColorScheme('light', 'dark'), 'light');
    assert.equal(resolveColorScheme('dark', 'light'), 'dark');
});

test('the quick toggle cycles system, light, dark', () => {
    assert.equal(nextThemePreference('system'), 'light');
    assert.equal(nextThemePreference('light'), 'dark');
    assert.equal(nextThemePreference('dark'), 'system');
});
