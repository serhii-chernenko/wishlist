import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canGoBack,
    createNavState,
    currentEntry,
    getDepth,
    isRootScreen,
    newWishRoute,
    popRoute,
    popToScreen,
    pushRoute,
    replaceRoute,
    requiresRegistration,
    resetRoutes,
    resolveStartRoutes,
    rootRoute,
    routesAfterRegistration,
    SCREEN_IDS,
    type Route
} from '../src/app/logic/nav';
import { CLIENT_SCREENS } from '../src/shared/app-api';
import { START_SCREENS } from '../src/shared/app-links';

const PUBLIC_ID = '01j9z8x7w6v5t4s3r2q1p0n9m8';

const screensOf = (routes: readonly Route[]) => {
    return routes.map(route => route.screen);
};

test('the root is home for users and onboarding for guests', () => {
    assert.deepEqual(rootRoute(true), { screen: 'home' });
    assert.deepEqual(rootRoute(false), { screen: 'onboarding' });
    assert.equal(isRootScreen('home'), true);
    assert.equal(isRootScreen('onboarding'), true);
    assert.equal(isRootScreen('wishes'), false);
});

test('no or invalid start params open only the root', () => {
    for (const start of [
        null,
        '',
        'unknown',
        'w_0',
        'w_abc',
        's_short',
        'a b'
    ]) {
        assert.deepEqual(resolveStartRoutes(start, true), [{ screen: 'home' }]);
    }

    assert.deepEqual(resolveStartRoutes('x'.repeat(65), false), [
        { screen: 'onboarding' }
    ]);
});

test('every startapp screen resolves to a stack above the root', () => {
    for (const start of START_SCREENS) {
        const routes = resolveStartRoutes(start, true);

        assert.equal(routes[0]?.screen, 'home', start);
        assert.ok(routes.length >= 2, start);
    }

    assert.deepEqual(screensOf(resolveStartRoutes('add', true)), [
        'home',
        'wishes',
        'wishEditor'
    ]);
    assert.deepEqual(resolveStartRoutes('add', true)[2], {
        screen: 'wishEditor',
        wishId: null
    });
    assert.deepEqual(screensOf(resolveStartRoutes('payments', true)), [
        'home',
        'payments'
    ]);
});

test('wish and share deep links carry their ids', () => {
    assert.deepEqual(resolveStartRoutes('w_42', true), [
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'wishEditor', wishId: 42 }
    ]);
    assert.deepEqual(resolveStartRoutes(`s_${PUBLIC_ID}`, true), [
        { screen: 'home' },
        {
            screen: 'thirdList',
            source: { kind: 'share', publicId: PUBLIC_ID }
        }
    ]);
});

test('guests are sent to visibility instead of registered-only screens', () => {
    for (const start of [
        'wishes',
        'add',
        'w_7',
        'gives',
        'find',
        'share',
        'payments',
        `s_${PUBLIC_ID}`
    ]) {
        assert.deepEqual(
            resolveStartRoutes(start, false),
            [{ screen: 'onboarding' }, { screen: 'visibility' }],
            start
        );
    }

    for (const start of [
        'language',
        'feedback',
        'stats',
        'donate',
        'releases',
        'about',
        'visibility',
        'settings'
    ]) {
        assert.notEqual(
            resolveStartRoutes(start, false)[1]?.screen,
            undefined,
            start
        );
        assert.equal(
            requiresRegistration(resolveStartRoutes(start, false)[1] as Route),
            false,
            start
        );
    }
});

test('push, pop and replace keep unique keys and never pop the root', () => {
    const initial = createNavState([{ screen: 'home' }]);

    assert.equal(canGoBack(initial), false);
    assert.equal(popRoute(initial), initial);

    const pushed = pushRoute(initial, { screen: 'wishes' });
    const editor = pushRoute(pushed, { screen: 'wishEditor', wishId: 3 });

    assert.equal(getDepth(editor), 3);
    assert.equal(canGoBack(editor), true);
    assert.deepEqual(
        editor.entries.map(entry => entry.key),
        [1, 2, 3]
    );

    const replaced = replaceRoute(editor, { screen: 'wishEditor', wishId: 4 });

    assert.equal(getDepth(replaced), 3);
    assert.notEqual(currentEntry(replaced).key, currentEntry(editor).key);
    assert.deepEqual(currentEntry(popRoute(replaced)).route, {
        screen: 'wishes'
    });
    assert.equal(currentEntry(popRoute(replaced)).key, 2);
});

test('reset and popToScreen rebuild the stack predictably', () => {
    const state = [
        { screen: 'wishes' },
        { screen: 'wishEditor', wishId: null },
        { screen: 'share' }
    ].reduce<ReturnType<typeof createNavState>>(
        (current, route) => pushRoute(current, route as Route),
        createNavState([{ screen: 'home' }])
    );

    assert.deepEqual(
        screensOf(
            popToScreen(state, 'wishes').entries.map(entry => entry.route)
        ),
        ['home', 'wishes']
    );
    assert.equal(popToScreen(state, 'about'), state);

    const reset = resetRoutes(state, [{ screen: 'home' }, { screen: 'stats' }]);

    assert.deepEqual(screensOf(reset.entries.map(entry => entry.route)), [
        'home',
        'stats'
    ]);
    assert.ok(reset.entries.every(entry => entry.key >= state.nextKey));
    assert.equal(resetRoutes(state, []), state);
});

test('screen ids are a subset of the telemetry screen set', () => {
    for (const screen of SCREEN_IDS) {
        assert.ok(CLIENT_SCREENS.includes(screen), screen);
    }
});

test('an empty stack is a programming error', () => {
    assert.throws(() => currentEntry({ entries: [], nextKey: 1 }));
});

test('a guest with a share link lands on that list after registering', () => {
    const start = `s_${PUBLIC_ID}`;

    assert.deepEqual(screensOf(resolveStartRoutes(start, false)), [
        'onboarding',
        'visibility'
    ]);
    assert.deepEqual(routesAfterRegistration(start), [
        { screen: 'home' },
        {
            screen: 'thirdList',
            source: { kind: 'share', publicId: PUBLIC_ID }
        }
    ]);
});

test('after registering, other deep links resume and Visibility is dropped', () => {
    assert.deepEqual(screensOf(routesAfterRegistration('w_42')), [
        'home',
        'wishes',
        'wishEditor'
    ]);
    assert.deepEqual(screensOf(routesAfterRegistration('gives')), [
        'home',
        'gives'
    ]);
    assert.deepEqual(screensOf(routesAfterRegistration('visibility')), [
        'home'
    ]);
    assert.deepEqual(screensOf(routesAfterRegistration(null)), ['home']);
});

test('the link import screen is a registered-only screen without parameters', () => {
    assert.ok(SCREEN_IDS.includes('linkImport'));
    assert.equal(requiresRegistration({ screen: 'linkImport' }), true);
});

test('the add deep link opens the link step while link import is on', () => {
    const enabled = { linkImportEnabled: true };

    assert.deepEqual(screensOf(resolveStartRoutes('add', true, enabled)), [
        'home',
        'wishes',
        'linkImport'
    ]);
    assert.deepEqual(screensOf(routesAfterRegistration('add', enabled)), [
        'home',
        'wishes',
        'linkImport'
    ]);
    assert.deepEqual(screensOf(resolveStartRoutes('add', false, enabled)), [
        'onboarding',
        'visibility'
    ]);
});

test('adding a wish skips the link step while link import is off', () => {
    assert.deepEqual(newWishRoute(true), { screen: 'linkImport' });
    assert.deepEqual(newWishRoute(false), {
        screen: 'wishEditor',
        wishId: null
    });
});

test('the list import screen is a registered-only screen without parameters', () => {
    assert.ok(SCREEN_IDS.includes('listImport'));
    assert.equal(requiresRegistration({ screen: 'listImport' }), true);
});
