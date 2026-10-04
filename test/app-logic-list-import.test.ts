import assert from 'node:assert/strict';
import test from 'node:test';

import {
    canStartImport,
    classifyPreviewFailure,
    commitRefusal,
    createListImportFlow,
    decidePoll,
    hasPhotosToLoad,
    isImportFinishedForGood,
    parseListImportTarget,
    previewCountLines,
    reduceListImportFlow,
    shouldGiveUpPolling,
    statusStep,
    toReadyPreview,
    type ListImportFlow
} from '../src/app/logic/list-import';
import {
    LIST_IMPORT_POLL_COMMITTING_MS,
    LIST_IMPORT_POLL_PHOTOS_MS,
    LIST_IMPORT_POLL_TIMEOUT_MS,
    type ListImportCountsDto,
    type ListImportPreviewDto,
    type ListImportStatusDto
} from '../src/shared/app-api';

const counts = (patch: Partial<ListImportCountsDto> = {}) => {
    const value: ListImportCountsDto = {
        found: 10,
        active: 7,
        gifted: 1,
        duplicates: 2,
        overLimit: 0,
        withoutPrice: 0,
        withoutPhoto: 0,
        ...patch
    };

    return value;
};

const preview = (patch: Partial<ListImportPreviewDto> = {}) => {
    const value: ListImportPreviewDto = {
        outcome: 'ok',
        jobId: 41,
        kind: 'wishes',
        counts: counts(),
        suggestedVisibility: 'public',
        savedWishesNote: false,
        ...patch
    };

    return value;
};

const status = (patch: Partial<ListImportStatusDto> = {}) => {
    const value: ListImportStatusDto = {
        jobId: 41,
        state: 'committing',
        planned: 8,
        created: 0,
        createdGifted: 0,
        photosPending: 0,
        failure: null,
        ...patch
    };

    return value;
};

const apply = (
    flow: ListImportFlow,
    ...events: Parameters<typeof reduceListImportFlow>[1][]
) => {
    return events.reduce(reduceListImportFlow, flow);
};

const urlStep = () => {
    return apply(createListImportFlow(), { type: 'sourceConfirmed' });
};

const previewStep = (patch: Partial<ListImportPreviewDto> = {}) => {
    return apply(urlStep(), {
        type: 'previewLoaded',
        preview: preview(patch)
    });
};

test('a profile link is recognized with its canonical form and a public default', () => {
    assert.deepEqual(parseListImportTarget('rewish.io/tESt01'), {
        url: 'https://rewish.io/tESt01/wishes',
        kind: 'wishes',
        suggestedVisibility: 'public',
        savedWishesNote: false
    });
});

test('an access code preselects hidden and flags the saved wishes note', () => {
    assert.deepEqual(
        parseListImportTarget(
            'https://www.rewish.io/tESt01/wishes?access_code=test-access-code&utm_source=tg'
        ),
        {
            url: 'https://rewish.io/tESt01/wishes?access_code=test-access-code',
            kind: 'wishes',
            suggestedVisibility: 'hidden',
            savedWishesNote: true
        }
    );
});

test('a collection link keeps its kind and has no saved wishes note', () => {
    const target = parseListImportTarget(
        'https://rewish.io/tESt01/collection/123456?access_code=test~code'
    );

    assert.equal(target?.kind, 'collection');
    assert.equal(target?.suggestedVisibility, 'hidden');
    assert.equal(target?.savedWishesNote, false);
});

test('a link inside surrounding text is found', () => {
    assert.equal(
        parseListImportTarget('my list: https://rewish.io/tESt01 enjoy')?.url,
        'https://rewish.io/tESt01/wishes'
    );
});

test('other hosts and empty input are not list links', () => {
    assert.equal(parseListImportTarget(''), null);
    assert.equal(parseListImportTarget('https://example.com/tESt01'), null);
    assert.equal(parseListImportTarget('not a link'), null);
});

test('the flow starts on the source step and moves to the url step', () => {
    const start = createListImportFlow();

    assert.deepEqual(start, { step: 'source', source: 'rewish' });
    assert.deepEqual(apply(start, { type: 'sourceConfirmed' }), {
        step: 'url',
        source: 'rewish'
    });
});

test('events that do not fit the current step change nothing', () => {
    const start = createListImportFlow();

    assert.equal(
        apply(start, { type: 'previewLoaded', preview: preview() }),
        start
    );
    assert.equal(
        apply(start, { type: 'visibilityChanged', visibility: 'hidden' }),
        start
    );
    assert.equal(
        apply(start, { type: 'commitStarted', status: status() }),
        start
    );
});

test('a loaded preview preselects the suggested visibility', () => {
    const hidden = previewStep({ suggestedVisibility: 'hidden' });
    const open = previewStep({ suggestedVisibility: 'public' });

    assert.equal(hidden.step === 'preview' && hidden.visibility, 'hidden');
    assert.equal(open.step === 'preview' && open.visibility, 'public');
});

test('a preview without a job or counts does not open the card', () => {
    assert.equal(previewStep({ jobId: null }).step, 'url');
    assert.equal(previewStep({ counts: null }).step, 'url');
    assert.equal(previewStep({ kind: null }).step, 'url');
    assert.equal(previewStep({ outcome: 'empty' }).step, 'url');
    assert.equal(toReadyPreview(preview({ outcome: 'busy' })), null);
});

test('the visibility choice changes only on the preview step', () => {
    const changed = apply(previewStep({ suggestedVisibility: 'public' }), {
        type: 'visibilityChanged',
        visibility: 'hidden'
    });

    assert.equal(changed.step === 'preview' && changed.visibility, 'hidden');
});

test('a started commit moves to progress and updates follow the job state', () => {
    const progress = apply(previewStep(), {
        type: 'commitStarted',
        status: status({ created: 3 })
    });

    assert.deepEqual(progress, {
        step: 'progress',
        status: status({ created: 3 })
    });
    assert.equal(
        apply(progress, {
            type: 'statusUpdated',
            status: status({ state: 'done', created: 8 })
        }).step,
        'done'
    );
    assert.equal(
        apply(progress, {
            type: 'statusUpdated',
            status: status({ state: 'failed', failure: 'upstream' })
        }).step,
        'failed'
    );
});

test('an expired refusal returns to the url step and a busy one stays', () => {
    const onPreview = previewStep();

    assert.equal(
        apply(onPreview, { type: 'commitRefused', failure: 'expired' }).step,
        'url'
    );
    assert.equal(
        apply(onPreview, { type: 'commitRefused', failure: 'busy' }),
        onPreview
    );
});

test('a failed import can start over from the url step', () => {
    const failed = apply(
        previewStep(),
        { type: 'commitStarted', status: status() },
        {
            type: 'statusUpdated',
            status: status({ state: 'failed', failure: 'timeout' })
        }
    );

    assert.deepEqual(apply(failed, { type: 'restarted' }), {
        step: 'url',
        source: 'rewish'
    });
});

test('statuses map to the progress, done and failed steps', () => {
    assert.equal(statusStep(status({ state: 'previewed' })), 'progress');
    assert.equal(statusStep(status({ state: 'committing' })), 'progress');
    assert.equal(statusStep(status({ state: 'done' })), 'done');
    assert.equal(statusStep(status({ state: 'failed' })), 'failed');
    assert.equal(statusStep(status({ state: 'expired' })), 'failed');
    assert.equal(statusStep(status({ state: 'cancelled' })), 'failed');
});

test('a commit answer for a job that did not start is a refusal', () => {
    assert.equal(commitRefusal(status({ state: 'committing' })), null);
    assert.equal(commitRefusal(status({ state: 'done' })), null);
    assert.equal(
        commitRefusal(status({ state: 'previewed', failure: 'busy' })),
        'busy'
    );
    assert.equal(
        commitRefusal(status({ state: 'expired', failure: null })),
        'expired'
    );
});

test('only the non-zero count lines are shown, in a fixed order', () => {
    assert.deepEqual(previewCountLines(counts()), [
        { key: 'active', count: 7 },
        { key: 'gifted', count: 1 },
        { key: 'duplicates', count: 2 }
    ]);
    assert.deepEqual(
        previewCountLines(
            counts({
                active: 0,
                gifted: 0,
                duplicates: 0,
                withoutPrice: 4,
                overLimit: 3
            })
        ),
        [
            { key: 'withoutPrice', count: 4 },
            { key: 'overLimit', count: 3 }
        ]
    );
    assert.deepEqual(
        previewCountLines(
            counts({ active: 0, gifted: 0, duplicates: 0, found: 0 })
        ),
        []
    );
});

test('the import can start only when something would be created', () => {
    assert.equal(canStartImport(counts()), true);
    assert.equal(canStartImport(counts({ active: 0, gifted: 1 })), true);
    assert.equal(canStartImport(counts({ active: 0, gifted: 0 })), false);
});

test('the photos note shows only when a planned wish has a photo', () => {
    assert.equal(hasPhotosToLoad(counts()), true);
    assert.equal(hasPhotosToLoad(counts({ withoutPhoto: 7 })), true);
    assert.equal(hasPhotosToLoad(counts({ withoutPhoto: 8 })), false);
});

test('polling is quick while committing and slower while photos load', () => {
    assert.deepEqual(decidePoll(status(), 0), {
        action: 'wait',
        delayMs: LIST_IMPORT_POLL_COMMITTING_MS
    });
    assert.deepEqual(
        decidePoll(status({ state: 'done', photosPending: 3 }), 0),
        { action: 'wait', delayMs: LIST_IMPORT_POLL_PHOTOS_MS }
    );
});

test('polling stops once settled and when the time is up', () => {
    assert.deepEqual(decidePoll(status({ state: 'done' }), 0), {
        action: 'stop',
        reason: 'settled'
    });
    assert.deepEqual(decidePoll(status({ state: 'failed' }), 0), {
        action: 'stop',
        reason: 'settled'
    });
    assert.deepEqual(decidePoll(status(), LIST_IMPORT_POLL_TIMEOUT_MS), {
        action: 'stop',
        reason: 'timeout'
    });
    assert.deepEqual(
        decidePoll(
            status({ state: 'done', photosPending: 2 }),
            LIST_IMPORT_POLL_TIMEOUT_MS + 1
        ),
        { action: 'stop', reason: 'timeout' }
    );
});

test('the screen hands over to the list at once only when no photo is pending', () => {
    assert.equal(
        isImportFinishedForGood(status({ state: 'done', photosPending: 0 })),
        true
    );
    assert.equal(
        isImportFinishedForGood(status({ state: 'done', photosPending: 2 })),
        false
    );
    assert.equal(isImportFinishedForGood(status()), false);
});

test('polling gives up after repeated failures', () => {
    assert.equal(shouldGiveUpPolling(1), false);
    assert.equal(shouldGiveUpPolling(2), false);
    assert.equal(shouldGiveUpPolling(3), true);
});

test('a url field error from the server is an invalid link', () => {
    assert.equal(
        classifyPreviewFailure({
            kind: 'api',
            status: 422,
            code: 'validation',
            fields: { url: 'invalid' }
        }),
        'invalidUrl'
    );
    assert.equal(classifyPreviewFailure({ kind: 'network' }), 'other');
    assert.equal(
        classifyPreviewFailure({
            kind: 'api',
            status: 429,
            code: 'rateLimited'
        }),
        'other'
    );
});
