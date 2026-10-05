import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient } from '../src/app/api/client';
import { readJsonBody } from '../src/app/logic/response-body';
import { createResourceCache } from '../src/app/state/store';

const deferred = <Value>() => {
    let resolve: (value: Value) => void = () => undefined;
    const promise = new Promise<Value>(done => {
        resolve = done;
    });

    return { promise, resolve };
};

test('a load cancelled by a mutation never overwrites the mutated data', async () => {
    const cache = createResourceCache();
    const pending = deferred<string>();
    const load = cache.load('wishes:list', () => pending.promise);

    cache.mutate<string>('wishes:list', () => 'optimistic');
    pending.resolve('stale server copy');

    assert.equal(await load, undefined);
    assert.equal(cache.read<string>('wishes:list').data, 'optimistic');
    assert.equal(cache.read<string>('wishes:list').loading, false);
});

test('a load cancelled by removal leaves no entry behind', async () => {
    const cache = createResourceCache();
    const pending = deferred<string>();
    const load = cache.load('gives:list', () => pending.promise);

    cache.remove('gives:list');
    pending.resolve('late');
    await load;

    assert.equal(cache.read<string>('gives:list').data, undefined);
});

test('an aborted body read rejects instead of resolving with null', async () => {
    await assert.rejects(
        readJsonBody({
            json: () => {
                return Promise.reject(
                    new DOMException('aborted', 'AbortError')
                );
            }
        }),
        { name: 'AbortError' }
    );
});

test('a broken body that is not an abort still reads as null', async () => {
    assert.equal(
        await readJsonBody({
            json: () => Promise.reject(new SyntaxError('bad'))
        }),
        null
    );
    assert.deepEqual(
        await readJsonBody({ json: () => Promise.resolve({ ok: 1 }) }),
        { ok: 1 }
    );
});

test('client events are sent with keepalive, other calls without', async () => {
    const seen: unknown[] = [];
    const client = createApiClient({
        initData: 'x',
        fetchImpl: (_input, init) => {
            seen.push((init as { keepalive?: boolean } | undefined)?.keepalive);

            return Promise.resolve(new Response(null, { status: 204 }));
        }
    });

    await client.request('reportClientEvent', {
        body: { kind: 'screenView', screen: 'home' },
        keepalive: true
    });
    await client.request('cancelContactIntent');

    assert.deepEqual(seen, [true, undefined]);
});

test('a disabled answer reaches the system screen unless the caller handles it', async () => {
    const failures: string[] = [];
    const client = createApiClient({
        initData: 'x',
        onSystemFailure: screen => {
            failures.push(screen);
        },
        fetchImpl: () => {
            return Promise.resolve(
                Response.json({ error: { code: 'disabled' } }, { status: 503 })
            );
        }
    });

    await assert.rejects(client.request('importLink', { body: { url: 'x' } }));
    await assert.rejects(
        client.request('importLink', {
            body: { url: 'x' },
            handleDisabledLocally: true
        })
    );

    assert.deepEqual(failures, ['unavailable']);
});
