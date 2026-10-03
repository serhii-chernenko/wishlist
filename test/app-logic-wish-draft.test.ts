import assert from 'node:assert/strict';
import test from 'node:test';

import {
    countFreePhotoSlots,
    createPhotoQueue,
    draftFromWish,
    EMPTY_DRAFT,
    enqueuePhotos,
    failQueuedPhotos,
    isDraftDirty,
    isDraftValid,
    nextQueuedPhoto,
    removePendingPhoto,
    setPhotoStatus,
    summarizePhotoQueue,
    toCreateInput,
    toDraftErrors,
    toPatchInput,
    toPhotoFailureKind,
    validateDraft,
    visibleDraftErrors,
    withFlags,
    type DraftTextField,
    type WishDraft
} from '../src/app/logic/wish-draft';
import type { OwnWishDto } from '../src/shared/app-api';

const wish: OwnWishDto = {
    id: 7,
    title: 'Coffee grinder',
    description: 'Burr, not blade',
    link: 'https://example.com/grinder',
    linkHost: 'example.com',
    price: 3200,
    priority: true,
    hidden: false,
    images: [],
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z'
};

const draft = (patch: Partial<WishDraft> = {}): WishDraft => {
    return { ...EMPTY_DRAFT, title: 'Board game', ...patch };
};

test('a wish becomes a draft with empty strings for missing values', () => {
    assert.deepEqual(draftFromWish(wish), {
        title: 'Coffee grinder',
        description: 'Burr, not blade',
        price: '3200',
        link: 'https://example.com/grinder',
        priority: true,
        hidden: false
    });
    assert.deepEqual(
        draftFromWish({ ...wish, description: null, link: null, price: 0 }),
        {
            title: 'Coffee grinder',
            description: '',
            price: '',
            link: '',
            priority: true,
            hidden: false
        }
    );
});

test('validation mirrors the server parsers', () => {
    assert.deepEqual(validateDraft(EMPTY_DRAFT), { title: 'empty' });
    assert.deepEqual(validateDraft(draft({ title: '   ' })), {
        title: 'empty'
    });
    assert.deepEqual(validateDraft(draft({ title: 'x'.repeat(201) })), {
        title: 'tooLong'
    });
    assert.deepEqual(validateDraft(draft({ title: '😀'.repeat(200) })), {});
    assert.deepEqual(
        validateDraft(draft({ title: 'see https://shop.example' })),
        { title: 'containsLink' }
    );
    assert.deepEqual(validateDraft(draft({ description: 'y'.repeat(501) })), {
        description: 'tooLong'
    });
    assert.deepEqual(validateDraft(draft({ price: 'about a lot' })), {
        price: 'invalid'
    });
    assert.deepEqual(validateDraft(draft({ price: '1 500 грн' })), {});
    assert.deepEqual(validateDraft(draft({ price: '2000000000' })), {
        price: 'invalid'
    });
    assert.deepEqual(validateDraft(draft({ link: 'shop.example' })), {
        link: 'invalid'
    });
    assert.deepEqual(validateDraft(draft({ link: 'ftp://shop.example' })), {
        link: 'invalid'
    });
    assert.equal(isDraftValid(draft({ link: 'https://shop.example/a' })), true);
    assert.equal(isDraftValid(draft({ description: '   ', price: ' ' })), true);
});

test('dirty compares trimmed text and the flags', () => {
    const baseline = draftFromWish(wish);

    assert.equal(isDraftDirty(baseline, { ...baseline }), false);
    assert.equal(
        isDraftDirty(baseline, { ...baseline, title: ' Coffee grinder ' }),
        false
    );
    assert.equal(
        isDraftDirty(baseline, { ...baseline, description: '' }),
        true
    );
    assert.equal(isDraftDirty(baseline, { ...baseline, hidden: true }), true);
    assert.equal(isDraftDirty(EMPTY_DRAFT, EMPTY_DRAFT), false);
    assert.equal(
        isDraftDirty(EMPTY_DRAFT, { ...EMPTY_DRAFT, priority: true }),
        true
    );
});

test('withFlags keeps the text and takes the flags', () => {
    assert.deepEqual(
        withFlags(draft({ description: 'kept' }), {
            priority: true,
            hidden: true
        }),
        draft({ description: 'kept', priority: true, hidden: true })
    );
});

test('quiet errors wait for blur, link and length errors show at once', () => {
    const errors = validateDraft(
        draft({
            title: 'https://shop.example',
            price: 'abc',
            description: 'z'.repeat(501)
        })
    );
    const none = new Set<DraftTextField>();

    assert.deepEqual(visibleDraftErrors(errors, none), {
        title: 'containsLink',
        description: 'tooLong'
    });
    assert.deepEqual(visibleDraftErrors(errors, new Set(['price'])), {
        title: 'containsLink',
        description: 'tooLong',
        price: 'invalid'
    });
    assert.deepEqual(visibleDraftErrors({ title: 'empty' }, none), {});
});

test('the create input trims and sends cleared fields as null', () => {
    assert.deepEqual(
        toCreateInput(
            draft({
                title: '  Board game ',
                description: '  ',
                price: ' 1500 ',
                link: '',
                hidden: true
            })
        ),
        {
            title: 'Board game',
            description: null,
            link: null,
            price: '1500',
            priority: false,
            hidden: true
        }
    );
});

test('the patch carries only changed fields', () => {
    const baseline = draftFromWish(wish);

    assert.deepEqual(toPatchInput(baseline, baseline), {});
    assert.deepEqual(
        toPatchInput(baseline, {
            ...baseline,
            title: 'Coffee grinder ',
            description: '',
            price: '3500',
            link: ' '
        }),
        { description: null, price: '3500', link: null }
    );
    assert.deepEqual(
        toPatchInput(baseline, { ...baseline, title: 'Grinder', hidden: true }),
        { title: 'Grinder', hidden: true }
    );
});

test('server field errors keep only the draft fields', () => {
    assert.deepEqual(
        toDraftErrors({
            title: 'containsLink',
            body: 'invalid',
            price: 'invalid'
        }),
        { title: 'containsLink', price: 'invalid' }
    );
});

test('the photo queue accepts only the free slots', () => {
    const empty = createPhotoQueue<string>();

    assert.equal(countFreePhotoSlots(7, empty, 9), 2);

    const { queue, rejected } = enqueuePhotos(empty, ['a', 'b', 'c'], 2);

    assert.equal(rejected, 1);
    assert.deepEqual(
        queue.items.map(item => [item.key, item.source, item.status]),
        [
            [1, 'a', 'queued'],
            [2, 'b', 'queued']
        ]
    );
    assert.equal(countFreePhotoSlots(7, queue, 9), 0);
    assert.equal(enqueuePhotos(queue, ['d'], 0).rejected, 1);
    assert.equal(enqueuePhotos(queue, ['d'], 5).queue.items[2]?.key, 3);
});

test('the photo queue moves through upload states in order', () => {
    let { queue } = enqueuePhotos(createPhotoQueue<string>(), ['a', 'b'], 9);

    assert.equal(nextQueuedPhoto(queue)?.source, 'a');

    queue = setPhotoStatus(queue, 1, 'uploading');
    assert.equal(nextQueuedPhoto(queue)?.source, 'b');
    assert.deepEqual(summarizePhotoQueue(queue), {
        active: 2,
        failed: 0,
        uploading: true
    });

    queue = setPhotoStatus(queue, 2, 'failed', 'tooLarge');
    assert.equal(nextQueuedPhoto(queue), null);
    assert.equal(queue.items[1]?.failure, 'tooLarge');

    queue = removePendingPhoto(queue, 1);
    assert.deepEqual(summarizePhotoQueue(queue), {
        active: 0,
        failed: 1,
        uploading: false
    });

    queue = setPhotoStatus(queue, 2, 'queued');
    assert.equal(queue.items[0]?.failure, null);
});

test('a full wish fails every photo still waiting', () => {
    let { queue } = enqueuePhotos(
        createPhotoQueue<string>(),
        ['a', 'b', 'c'],
        9
    );

    queue = setPhotoStatus(queue, 1, 'uploading');
    queue = failQueuedPhotos(queue, 'full');

    assert.deepEqual(
        queue.items.map(item => [item.status, item.failure]),
        [
            ['uploading', null],
            ['failed', 'full'],
            ['failed', 'full']
        ]
    );
});

test('upload errors map to photo failure kinds', () => {
    assert.equal(toPhotoFailureKind('imagesFull'), 'full');
    assert.equal(toPhotoFailureKind('payloadTooLarge'), 'tooLarge');
    assert.equal(toPhotoFailureKind('unsupportedMedia'), 'unsupported');
    assert.equal(toPhotoFailureKind('writeAccessRequired'), 'writeAccess');
    assert.equal(toPhotoFailureKind('upstream'), 'failed');
    assert.equal(toPhotoFailureKind(null), 'failed');
});
