import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createTelegraphClient,
    TelegraphError
} from '../src/bot/telegraph/client';

interface RecordedCall {
    url: string;
    body: Record<string, unknown>;
    hasTimeoutSignal: boolean;
}

const createFetchStub = (
    responses: Array<{ status: number; body: unknown }>
) => {
    const calls: RecordedCall[] = [];
    const stub = async (input: string | URL | Request, init?: RequestInit) => {
        const response = responses.shift();

        if (!response) {
            throw new Error('unexpected request');
        }

        calls.push({
            url: String(input),
            body: JSON.parse(String(init?.body ?? '{}')) as Record<
                string,
                unknown
            >,
            hasTimeoutSignal: init?.signal instanceof AbortSignal
        });

        return new Response(JSON.stringify(response.body), {
            status: response.status
        });
    };

    return { calls, fetch: stub as typeof fetch };
};

test('createAccount posts json and returns the access token', async () => {
    const { calls, fetch } = createFetchStub([
        {
            status: 200,
            body: { ok: true, result: { access_token: 'token-1' } }
        }
    ]);
    const client = createTelegraphClient({ fetch });

    const token = await client.createAccount({
        shortName: 'wishlist',
        authorName: 'Serhii',
        authorUrl: 'https://t.me/serhii'
    });

    assert.equal(token, 'token-1');
    assert.equal(calls[0]?.url, 'https://api.telegra.ph/createAccount');
    assert.deepEqual(calls[0]?.body, {
        short_name: 'wishlist',
        author_name: 'Serhii',
        author_url: 'https://t.me/serhii'
    });
    assert.equal(calls[0]?.hasTimeoutSignal, true);
});

test('createAccount omits the author url when absent', async () => {
    const { calls, fetch } = createFetchStub([
        {
            status: 200,
            body: { ok: true, result: { access_token: 'token-2' } }
        }
    ]);

    await createTelegraphClient({ fetch }).createAccount({
        shortName: 'x'.repeat(40),
        authorName: 'Name'
    });

    assert.deepEqual(calls[0]?.body, {
        short_name: 'x'.repeat(32),
        author_name: 'Name'
    });
});

test('createPage sends serialized content and returns the url', async () => {
    const { calls, fetch } = createFetchStub([
        {
            status: 200,
            body: { ok: true, result: { url: 'https://telegra.ph/page' } }
        }
    ]);

    const page = await createTelegraphClient({ fetch }).createPage({
        accessToken: 'token',
        title: 'Title',
        authorName: 'Name',
        content: ['hello', { tag: 'hr' }]
    });

    assert.deepEqual(page, { url: 'https://telegra.ph/page' });
    assert.equal(calls[0]?.url, 'https://api.telegra.ph/createPage');
    assert.equal(
        calls[0]?.body['content'],
        JSON.stringify(['hello', { tag: 'hr' }])
    );
});

test('a 200 response with ok false surfaces the telegraph error code', async () => {
    const { fetch } = createFetchStub([
        { status: 200, body: { ok: false, error: 'ACCESS_TOKEN_INVALID' } }
    ]);

    await assert.rejects(
        createTelegraphClient({ fetch }).createPage({
            accessToken: 'bad',
            title: 'Title',
            authorName: 'Name',
            content: []
        }),
        (error: unknown) => {
            return (
                error instanceof TelegraphError &&
                error.code === 'ACCESS_TOKEN_INVALID'
            );
        }
    );
});

test('a non-ok http status is an error even with an ok body', async () => {
    const { fetch } = createFetchStub([
        { status: 500, body: { ok: true, result: { access_token: 'x' } } }
    ]);

    await assert.rejects(
        createTelegraphClient({ fetch }).createAccount({
            shortName: 'a',
            authorName: 'b'
        }),
        (error: unknown) => {
            return error instanceof TelegraphError && error.status === 500;
        }
    );
});

test('a missing token or url in the result is an error', async () => {
    const accountStub = createFetchStub([
        { status: 200, body: { ok: true, result: {} } }
    ]);
    const pageStub = createFetchStub([
        { status: 200, body: { ok: true, result: {} } }
    ]);

    await assert.rejects(
        createTelegraphClient({ fetch: accountStub.fetch }).createAccount({
            shortName: 'a',
            authorName: 'b'
        }),
        TelegraphError
    );
    await assert.rejects(
        createTelegraphClient({ fetch: pageStub.fetch }).createPage({
            accessToken: 't',
            title: 't',
            authorName: 'a',
            content: []
        }),
        TelegraphError
    );
});
