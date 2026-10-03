import assert from 'node:assert/strict';
import test from 'node:test';

import {
    applyGive,
    applyGiveAction,
    applyTake,
    describeGivers,
    isGivenByViewer,
    nextGiveAction,
    NO_GIVERS,
    removeWish,
    replaceWish,
    withGiveAction
} from '../src/app/logic/givers';
import { getLanguageChoices } from '../src/app/logic/language-choices';
import { getLanguageChoices as getBotLanguageChoices } from '../src/bot/screens/language';
import type { GiverSummaryDto, ThirdWishDto } from '../src/shared/app-api';

const YOU: GiverSummaryDto = { kind: 'you', count: 1 };
const YOU_AND_TWO: GiverSummaryDto = { kind: 'somebodyAndYou', count: 2 };
const THREE_OTHERS: GiverSummaryDto = { kind: 'somebody', count: 3 };

const createWish = (id: number, givers: GiverSummaryDto): ThirdWishDto => {
    return {
        id,
        title: `Wish ${id}`,
        description: null,
        link: null,
        linkHost: null,
        price: 100,
        priority: false,
        images: [],
        createdAt: '2026-09-28T10:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
        givers
    };
};

test('giving moves the viewer into the givers without changing the others', () => {
    assert.deepEqual(applyGive(NO_GIVERS), YOU);
    assert.deepEqual(applyGive(THREE_OTHERS), {
        kind: 'somebodyAndYou',
        count: 3
    });
    assert.equal(applyGive(YOU), YOU);
    assert.equal(applyGive(YOU_AND_TWO), YOU_AND_TWO);
});

test('taking removes only the viewer from the givers', () => {
    assert.deepEqual(applyTake(YOU), NO_GIVERS);
    assert.deepEqual(applyTake(YOU_AND_TWO), { kind: 'somebody', count: 2 });
    assert.equal(applyTake(NO_GIVERS), NO_GIVERS);
    assert.equal(applyTake(THREE_OTHERS), THREE_OTHERS);
});

test('give and take undo each other', () => {
    for (const start of [NO_GIVERS, THREE_OTHERS]) {
        assert.deepEqual(applyTake(applyGive(start)), start);
    }

    for (const start of [YOU, YOU_AND_TWO]) {
        assert.deepEqual(applyGive(applyTake(start)), start);
    }
});

test('the next action follows whether the viewer already gives', () => {
    assert.equal(isGivenByViewer(YOU), true);
    assert.equal(isGivenByViewer(YOU_AND_TWO), true);
    assert.equal(isGivenByViewer(THREE_OTHERS), false);
    assert.equal(isGivenByViewer(NO_GIVERS), false);
    assert.equal(nextGiveAction(NO_GIVERS), 'give');
    assert.equal(nextGiveAction(YOU_AND_TWO), 'take');
    assert.deepEqual(applyGiveAction(NO_GIVERS, 'give'), YOU);
    assert.deepEqual(applyGiveAction(YOU, 'take'), NO_GIVERS);
});

test('the givers line carries the count each message expects', () => {
    assert.equal(describeGivers(NO_GIVERS), null);
    assert.deepEqual(describeGivers(YOU), { key: 'you' });
    assert.deepEqual(describeGivers(YOU_AND_TWO), {
        key: 'somebodyAndYou',
        count: 2
    });
    assert.deepEqual(describeGivers(THREE_OTHERS), {
        key: 'somebody',
        count: 3
    });
});

test('list helpers touch only the matching wish', () => {
    const items = [createWish(1, NO_GIVERS), createWish(2, THREE_OTHERS)];
    const toggled = withGiveAction(items, 2, 'give');

    assert.equal(toggled[0], items[0]);
    assert.deepEqual(toggled[1]?.givers, {
        kind: 'somebodyAndYou',
        count: 3
    });
    assert.equal(items[1]?.givers, THREE_OTHERS);

    const settled = replaceWish(toggled, createWish(2, YOU));

    assert.deepEqual(settled[1]?.givers, YOU);
    assert.deepEqual(
        removeWish(settled, 1).map(wish => {
            return wish.id;
        }),
        [2]
    );
    assert.equal(withGiveAction(items, 99, 'give')[0], items[0]);
});

test('the language order matches the bot', () => {
    for (const locale of ['uk', 'en', 'pl'] as const) {
        assert.deepEqual(
            getLanguageChoices(locale),
            getBotLanguageChoices(locale)
        );
    }

    assert.deepEqual(getLanguageChoices('pl'), ['pl', 'en', 'uk', 'auto']);
});
