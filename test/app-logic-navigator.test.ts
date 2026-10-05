import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createNavState,
    currentEntry,
    entriesAboveScreen,
    hasScreen,
    navigateToScreen,
    pushRoute,
    retargetCurrent,
    type NavState,
    type Route
} from '../src/app/logic/nav';
import {
    createNavigatorCore,
    type NavStateSlot
} from '../src/app/logic/navigator';

const screensOf = (state: NavState) => {
    return state.entries.map(entry => entry.route.screen);
};

const createSlot = (routes: readonly Route[]): NavStateSlot => {
    let value = createNavState(routes);

    return {
        get: () => value,
        set(next) {
            value = typeof next === 'function' ? next(value) : next;
        }
    };
};

interface Harness {
    slot: NavStateSlot;
    navigator: ReturnType<typeof createNavigatorCore>;
    popups: Array<(answer: boolean) => void>;
    scrolls: number[];
}

const createHarness = (
    routes: readonly Route[],
    registered = true
): Harness => {
    const slot = createSlot(routes);
    const popups: Array<(answer: boolean) => void> = [];
    const scrolls: number[] = [];
    const navigator = createNavigatorCore({
        state: slot,
        confirmDiscard: () => {
            return new Promise<boolean>(resolve => {
                popups.push(resolve);
            });
        },
        rootRoutes: () => {
            return [registered ? { screen: 'home' } : { screen: 'onboarding' }];
        },
        rememberScroll: entryKey => {
            scrolls.push(entryKey);
        }
    });

    return { slot, navigator, popups, scrolls };
};

const answerPopup = (harness: Harness, answer: boolean) => {
    const resolve = harness.popups.shift();

    assert.ok(resolve, 'a discard popup is open');
    resolve(answer);
};

test('navigateToScreen pops back to a screen already in the stack and pushes otherwise', () => {
    const state = createNavState([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'share' },
        { screen: 'delivery' }
    ]);

    assert.deepEqual(screensOf(navigateToScreen(state, 'share')), [
        'home',
        'wishes',
        'share'
    ]);
    assert.deepEqual(screensOf(navigateToScreen(state, 'find')), [
        'home',
        'wishes',
        'share',
        'delivery',
        'find'
    ]);
    assert.deepEqual(screensOf(navigateToScreen(state, 'find', 'replace')), [
        'home',
        'wishes',
        'share',
        'find'
    ]);
    assert.equal(navigateToScreen(state, 'delivery'), state);
    assert.equal(hasScreen(state, 'wishes'), true);
    assert.deepEqual(
        entriesAboveScreen(state, 'wishes').map(entry => entry.route.screen),
        ['share', 'delivery']
    );
    assert.deepEqual(entriesAboveScreen(state, 'about'), []);
});

test('retargetCurrent keeps the entry key and drops the link step right below', () => {
    const state = createNavState([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'linkImport' },
        { screen: 'wishEditor', wishId: null, importLink: 'https://a.example' }
    ]);
    const retargeted = retargetCurrent(
        state,
        { screen: 'wishEditor', wishId: 9 },
        'linkImport'
    );

    assert.deepEqual(screensOf(retargeted), ['home', 'wishes', 'wishEditor']);
    assert.equal(currentEntry(retargeted).key, currentEntry(state).key);
    assert.deepEqual(currentEntry(retargeted).route, {
        screen: 'wishEditor',
        wishId: 9
    });

    const fromWishes = createNavState([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'wishEditor', wishId: null }
    ]);

    assert.deepEqual(
        screensOf(
            retargetCurrent(
                fromWishes,
                { screen: 'wishEditor', wishId: 9 },
                'linkImport'
            )
        ),
        ['home', 'wishes', 'wishEditor']
    );
});

test('A: Back from the imported editor returns to the link step, and saving drops it', async () => {
    const harness = createHarness([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'linkImport' }
    ]);

    harness.navigator.push({
        screen: 'wishEditor',
        wishId: null,
        importLink: 'https://example.com/grinder'
    });
    assert.deepEqual(harness.scrolls, [3]);
    assert.equal(await harness.navigator.back(), true);
    assert.deepEqual(screensOf(harness.slot.get()), [
        'home',
        'wishes',
        'linkImport'
    ]);

    harness.navigator.push({
        screen: 'wishEditor',
        wishId: null,
        importLink: 'https://example.com/grinder'
    });
    harness.navigator.retarget(
        { screen: 'wishEditor', wishId: 12 },
        'linkImport'
    );
    assert.equal(await harness.navigator.back(), true);
    assert.deepEqual(screensOf(harness.slot.get()), ['home', 'wishes']);
});

test('B: "search again" on a broken list goes back to Find instead of stacking a second one', async () => {
    const harness = createHarness([{ screen: 'home' }, { screen: 'find' }]);

    harness.navigator.push({
        screen: 'thirdList',
        source: { kind: 'share', publicId: '01j9z8x7w6v5t4s3r2q1p0n9m8' }
    });
    assert.equal(await harness.navigator.navigateTo('find', 'replace'), true);
    assert.deepEqual(screensOf(harness.slot.get()), ['home', 'find']);
    assert.equal(await harness.navigator.back(), true);
    assert.deepEqual(screensOf(harness.slot.get()), ['home']);

    const deepLink = createHarness([
        { screen: 'home' },
        {
            screen: 'thirdList',
            source: { kind: 'share', publicId: '01j9z8x7w6v5t4s3r2q1p0n9m8' }
        }
    ]);

    await deepLink.navigator.navigateTo('find', 'replace');
    assert.deepEqual(screensOf(deepLink.slot.get()), ['home', 'find']);
});

test('C: share and delivery link to each other without growing the stack', async () => {
    const harness = createHarness([{ screen: 'home' }, { screen: 'wishes' }]);

    await harness.navigator.navigateTo('share');
    await harness.navigator.navigateTo('delivery');
    await harness.navigator.navigateTo('share');
    await harness.navigator.navigateTo('delivery');
    assert.deepEqual(screensOf(harness.slot.get()), [
        'home',
        'wishes',
        'share',
        'delivery'
    ]);

    await harness.navigator.back();
    await harness.navigator.back();
    assert.deepEqual(screensOf(harness.slot.get()), ['home', 'wishes']);
});

test('C: going back to a screen below a dirty entry asks before discarding it', async () => {
    const harness = createHarness([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'share' },
        { screen: 'delivery' }
    ]);

    harness.navigator.setDirty(currentEntry(harness.slot.get()).key, true);

    const kept = harness.navigator.navigateTo('share');

    answerPopup(harness, false);
    assert.equal(await kept, false);
    assert.equal(currentEntry(harness.slot.get()).route.screen, 'delivery');

    const discarded = harness.navigator.navigateTo('share');

    answerPopup(harness, true);
    assert.equal(await discarded, true);
    assert.equal(currentEntry(harness.slot.get()).route.screen, 'share');
});

test('D: a pop confirmed after the stack changed under the popup is dropped', async () => {
    const harness = createHarness([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'wishEditor', wishId: 4 }
    ]);

    harness.navigator.setDirty(currentEntry(harness.slot.get()).key, true);

    const back = harness.navigator.back();

    harness.navigator.reset([{ screen: 'home' }, { screen: 'stats' }]);
    answerPopup(harness, true);

    assert.equal(await back, false);
    assert.deepEqual(screensOf(harness.slot.get()), ['home', 'stats']);
});

test('D: a pop confirmed on an unchanged stack still goes back', async () => {
    const harness = createHarness([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'wishEditor', wishId: 4 }
    ]);

    harness.navigator.setDirty(currentEntry(harness.slot.get()).key, true);

    const back = harness.navigator.back();

    answerPopup(harness, true);
    assert.equal(await back, true);
    assert.deepEqual(screensOf(harness.slot.get()), ['home', 'wishes']);
    assert.equal(await harness.navigator.back(), true);
});

test('Home resets to the root and asks first when an editor is dirty', async () => {
    const harness = createHarness([
        { screen: 'home' },
        { screen: 'wishes' },
        { screen: 'wishEditor', wishId: null }
    ]);

    harness.navigator.setDirty(currentEntry(harness.slot.get()).key, true);

    const declined = harness.navigator.home();

    answerPopup(harness, false);
    assert.equal(await declined, false);
    assert.equal(harness.slot.get().entries.length, 3);

    const accepted = harness.navigator.home();

    answerPopup(harness, true);
    assert.equal(await accepted, true);
    assert.deepEqual(screensOf(harness.slot.get()), ['home']);
    assert.equal(await harness.navigator.home(), false);
});

test('Home for a guest returns to onboarding without a popup on clean screens', async () => {
    const harness = createHarness(
        [{ screen: 'onboarding' }, { screen: 'visibility' }],
        false
    );

    assert.equal(await harness.navigator.home(), true);
    assert.deepEqual(screensOf(harness.slot.get()), ['onboarding']);
    assert.equal(harness.popups.length, 0);
});

test('clean moves apply synchronously without awaiting a popup', () => {
    const harness = createHarness([{ screen: 'home' }, { screen: 'gives' }]);

    void harness.navigator.navigateTo('find');
    assert.deepEqual(screensOf(harness.slot.get()), ['home', 'gives', 'find']);
    void harness.navigator.back();
    assert.deepEqual(screensOf(harness.slot.get()), ['home', 'gives']);
    assert.equal(harness.popups.length, 0);
});

test('push helpers stay pure', () => {
    const state = createNavState([{ screen: 'home' }]);
    const pushed = pushRoute(state, { screen: 'wishes' });

    assert.notEqual(pushed, state);
    assert.deepEqual(screensOf(state), ['home']);
});
