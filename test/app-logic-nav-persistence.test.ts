import assert from 'node:assert/strict';
import test from 'node:test';

import type { Route } from '../src/app/logic/nav';
import {
    getLaunchIdentity,
    NAV_SNAPSHOT_MAX_ROUTES,
    parseStoredRoute,
    resolveInitialRoutes,
    restoreRoutes,
    serializeNavSnapshot
} from '../src/app/logic/nav-persistence';

const PUBLIC_ID = '01j9z8x7w6v5t4s3r2q1p0n9m8';
const INIT_DATA = 'auth_date=1791000000&query_id=AA&user=%7B%7D&hash=abc123';
const NEXT_LAUNCH = 'auth_date=1791000600&query_id=AB&user=%7B%7D&hash=def456';
const LAUNCH = '1791000000:abc123';

const OWNER_ROUTE: Route = {
    screen: 'thirdList',
    source: {
        kind: 'owner',
        owner: {
            token: 'tok.en.sig',
            label: '@olena',
            payments: 'Card 4444 0000 1111 2222',
            currency: 'UAH',
            source: 'search',
            canGive: true
        }
    }
};

const STACK: Route[] = [
    { screen: 'home' },
    { screen: 'wishes' },
    { screen: 'wishEditor', wishId: 42 }
];

const screensOf = (routes: readonly Route[]) => {
    return routes.map(route => route.screen);
};

test('the launch identity comes from auth_date and hash', () => {
    assert.equal(getLaunchIdentity(INIT_DATA), LAUNCH);
    assert.equal(getLaunchIdentity('auth_date=1&user=%7B%7D'), null);
    assert.equal(getLaunchIdentity(''), null);
});

test('a reload of the same launch restores the saved stack', () => {
    assert.deepEqual(
        resolveInitialRoutes({
            stored: serializeNavSnapshot(STACK, LAUNCH),
            initData: INIT_DATA,
            startParam: 'gives',
            registered: true
        }),
        STACK
    );
});

test('a new launch ignores the snapshot and follows its start param', () => {
    const stored = serializeNavSnapshot(STACK, LAUNCH);

    assert.deepEqual(
        screensOf(
            resolveInitialRoutes({
                stored,
                initData: NEXT_LAUNCH,
                startParam: 'gives',
                registered: true
            })
        ),
        ['home', 'gives']
    );
    assert.deepEqual(
        resolveInitialRoutes({
            stored,
            initData: NEXT_LAUNCH,
            startParam: null,
            registered: true
        }),
        [{ screen: 'home' }]
    );
});

test('a missing, broken or foreign-version snapshot falls back to start routing', () => {
    for (const stored of [
        null,
        '{',
        '[]',
        JSON.stringify({ v: 2, launch: LAUNCH, routes: [] }),
        JSON.stringify({ v: 1, launch: LAUNCH, routes: 'home' })
    ]) {
        assert.deepEqual(
            screensOf(
                resolveInitialRoutes({
                    stored,
                    initData: INIT_DATA,
                    startParam: 'find',
                    registered: true
                })
            ),
            ['home', 'find'],
            String(stored)
        );
    }
});

test('owner routes are stored without payment details and restored with a fresh null', () => {
    const stored = serializeNavSnapshot(
        [{ screen: 'home' }, OWNER_ROUTE],
        LAUNCH
    );

    assert.doesNotMatch(stored, /4444/);

    const restored = resolveInitialRoutes({
        stored,
        initData: INIT_DATA,
        startParam: null,
        registered: true
    });

    assert.deepEqual(restored[1], {
        screen: 'thirdList',
        source: {
            kind: 'owner',
            owner: {
                token: 'tok.en.sig',
                label: '@olena',
                payments: null,
                currency: 'UAH',
                source: 'search',
                canGive: true
            }
        }
    });
});

test('route params are validated by shape', () => {
    assert.deepEqual(parseStoredRoute({ screen: 'wishEditor', wishId: null }), {
        screen: 'wishEditor',
        wishId: null
    });
    assert.equal(parseStoredRoute({ screen: 'wishEditor', wishId: 0 }), null);
    assert.equal(parseStoredRoute({ screen: 'wishEditor', wishId: '7' }), null);
    assert.equal(parseStoredRoute({ screen: 'wishEditor' }), null);
    assert.equal(parseStoredRoute({ screen: 'admin' }), null);
    assert.equal(parseStoredRoute('home'), null);
    assert.deepEqual(
        parseStoredRoute({
            screen: 'thirdList',
            source: { kind: 'share', publicId: PUBLIC_ID }
        }),
        { screen: 'thirdList', source: { kind: 'share', publicId: PUBLIC_ID } }
    );
    assert.equal(
        parseStoredRoute({
            screen: 'thirdList',
            source: { kind: 'share', publicId: '../x' }
        }),
        null
    );
    assert.equal(
        parseStoredRoute({
            screen: 'thirdList',
            source: { kind: 'owner', owner: { token: 1, label: 'x' } }
        }),
        null
    );
});

test('an invalid entry drops it and everything above it', () => {
    assert.deepEqual(
        screensOf(
            restoreRoutes(
                [
                    { screen: 'home' },
                    { screen: 'wishes' },
                    { screen: 'wishEditor', wishId: -1 },
                    { screen: 'stats' }
                ],
                true
            )
        ),
        ['home', 'wishes']
    );
    assert.deepEqual(restoreRoutes([], true), [{ screen: 'home' }]);
});

test('a guest never restores registered-only screens and gets the guest root', () => {
    assert.deepEqual(
        screensOf(
            restoreRoutes(
                [
                    { screen: 'home' },
                    { screen: 'stats' },
                    { screen: 'wishes' },
                    { screen: 'about' }
                ],
                false
            )
        ),
        ['onboarding', 'stats']
    );
});

test('a guest who registered before reloading keeps the user root', () => {
    assert.deepEqual(
        screensOf(
            restoreRoutes(
                [{ screen: 'onboarding' }, { screen: 'visibility' }],
                true
            )
        ),
        ['home', 'visibility']
    );
});

test('very deep stacks are capped', () => {
    const deep: Route[] = [
        { screen: 'home' },
        ...Array.from({ length: 40 }, () => ({ screen: 'stats' }) as Route)
    ];
    const restored = resolveInitialRoutes({
        stored: serializeNavSnapshot(deep, LAUNCH),
        initData: INIT_DATA,
        startParam: null,
        registered: true
    });

    assert.ok(restored.length <= NAV_SNAPSHOT_MAX_ROUTES + 1);
    assert.equal(restored[0]?.screen, 'home');
});
