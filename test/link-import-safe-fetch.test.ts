import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    LINK_IMPORT_MAX_REDIRECTS,
    createSafeFetcher
} from '../src/bot/services/link-import/safe-fetch';
import { LINK_IMPORT_USER_AGENT } from '../src/shared/app-api';

interface RecordedRequest {
    url: string;
    init: RequestInit;
}

type Responder = (
    url: string,
    init: RequestInit
) => Response | Promise<Response>;

const createFakeFetch = (responder: Responder) => {
    const requests: RecordedRequest[] = [];
    const fakeFetch: typeof fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.toString();

        requests.push({ url, init });

        return responder(url, init);
    };

    return { fakeFetch, requests };
};

const html = (body = '<html></html>', headers: Record<string, string> = {}) => {
    return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', ...headers }
    });
};

const redirect = (location: string, status = 302) => {
    return new Response(null, { status, headers: { location } });
};

const image = (bytes: Uint8Array, contentType = 'image/webp') => {
    return new Response(bytes, {
        status: 200,
        headers: { 'content-type': contentType }
    });
};

const chunkedStream = (chunkSize: number, chunks: number) => {
    let sent = 0;

    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (sent >= chunks) {
                controller.close();

                return;
            }

            sent += 1;
            controller.enqueue(new Uint8Array(chunkSize));
        }
    });
};

const PAGE_URL = 'https://shop.example.com/p/1';

describe('safe fetch: request shape', () => {
    it('sends only the honest User-Agent, Accept and Accept-Language, manual redirects and no cookies', async () => {
        const { fakeFetch, requests } = createFakeFetch(() => {
            return html();
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.equal(result.ok, true);
        assert.equal(requests.length, 1);

        const headers = new Headers(requests[0]?.init.headers);

        assert.equal(requests[0]?.init.redirect, 'manual');
        assert.equal(requests[0]?.init.method, 'GET');
        assert.ok(requests[0]?.init.signal instanceof AbortSignal);
        assert.equal(headers.get('user-agent'), LINK_IMPORT_USER_AGENT);
        assert.equal(headers.get('accept'), 'text/html,application/xhtml+xml');
        assert.equal(headers.get('cookie'), null);
        assert.deepEqual([...headers.keys()].sort(), [
            'accept',
            'accept-language',
            'user-agent'
        ]);
    });

    it('asks images without AVIF in the Accept header', async () => {
        const { fakeFetch, requests } = createFakeFetch(() => {
            return image(new Uint8Array([1, 2, 3]));
        });
        const result = await createSafeFetcher(fakeFetch).fetchImage(
            'https://cdn.example.com/a.jpg'
        );

        assert.equal(result.ok, true);

        const accept =
            new Headers(requests[0]?.init.headers).get('accept') ?? '';

        assert.equal(accept.includes('avif'), false);
        assert.match(accept, /image\/webp/);
    });
});

describe('safe fetch: URL rules', () => {
    const rejected: readonly [string, string][] = [
        ['http://shop.example.com/', 'blockedHost'],
        ['https://shop.example.com:8443/', 'blockedHost'],
        ['https://user:pass@shop.example.com/', 'blockedHost'],
        ['https://127.0.0.1/', 'blockedHost'],
        ['https://0x7f.1/', 'blockedHost'],
        ['https://[::1]/', 'blockedHost'],
        ['https://localhost/', 'blockedHost'],
        ['https://printer.local/', 'blockedHost'],
        ['https://metadata.google.internal/', 'blockedHost'],
        ['https://intranet/', 'blockedHost'],
        ['https://wishlist.chernenko.dev/app', 'blockedHost'],
        ['https://wishlist.inevix.workers.dev/', 'blockedHost'],
        ['ftp://shop.example.com/', 'blockedHost'],
        ['not a url', 'invalidUrl']
    ];

    for (const [url, failure] of rejected) {
        it(`rejects ${url} without fetching`, async () => {
            const { fakeFetch, requests } = createFakeFetch(() => {
                return html();
            });
            const result = await createSafeFetcher(fakeFetch).fetchPage(url);

            assert.deepEqual(result, { ok: false, failure, status: null });
            assert.equal(requests.length, 0);
        });
    }

    it('accepts an explicit default https port', async () => {
        const { fakeFetch, requests } = createFakeFetch(() => {
            return image(new Uint8Array([1]));
        });
        const result = await createSafeFetcher(fakeFetch).fetchImage(
            'https://ireland.apollo.olxcdn.com:443/v1/files/a/image'
        );

        assert.equal(result.ok, true);
        assert.equal(
            requests[0]?.url,
            'https://ireland.apollo.olxcdn.com/v1/files/a/image'
        );
    });
});

describe('safe fetch: redirects', () => {
    it('follows relative redirects and reports the final url', async () => {
        const { fakeFetch, requests } = createFakeFetch(url => {
            return url === PAGE_URL ? redirect('/p/1-new', 307) : html();
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.ok(result.ok);
        assert.equal(result.value.finalUrl, 'https://shop.example.com/p/1-new');
        assert.equal(requests.length, 2);
    });

    it(`follows at most ${LINK_IMPORT_MAX_REDIRECTS} redirects`, async () => {
        const { fakeFetch, requests } = createFakeFetch(url => {
            const hop = Number(new URL(url).searchParams.get('hop') ?? '0');

            return redirect(`https://shop.example.com/r?hop=${hop + 1}`);
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.deepEqual(result, {
            ok: false,
            failure: 'tooManyRedirects',
            status: 302
        });
        assert.equal(requests.length, LINK_IMPORT_MAX_REDIRECTS + 1);
    });

    it('accepts exactly the maximum number of redirects', async () => {
        const { fakeFetch } = createFakeFetch(url => {
            const hop = Number(new URL(url).searchParams.get('hop') ?? '0');

            return hop < LINK_IMPORT_MAX_REDIRECTS
                ? redirect(`https://shop.example.com/r?hop=${hop + 1}`)
                : html();
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.equal(result.ok, true);
    });

    it('re-validates every hop and refuses a redirect to a private host', async () => {
        const { fakeFetch, requests } = createFakeFetch(() => {
            return redirect('https://10.0.0.1/admin');
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.deepEqual(result, {
            ok: false,
            failure: 'blockedHost',
            status: 302
        });
        assert.equal(requests.length, 1);
    });

    it('refuses a redirect that downgrades to http', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return redirect('http://shop.example.com/p/1', 301);
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.equal(result.ok, false);
        assert.equal(!result.ok && result.failure, 'blockedHost');
    });

    it('treats a redirect without Location as a bad status', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return new Response(null, { status: 302 });
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.deepEqual(result, {
            ok: false,
            failure: 'badStatus',
            status: 302
        });
    });
});

describe('safe fetch: status, content type and size', () => {
    const statuses: readonly [number, string][] = [
        [401, 'blockedStatus'],
        [403, 'blockedStatus'],
        [429, 'blockedStatus'],
        [451, 'blockedStatus'],
        [404, 'badStatus'],
        [410, 'badStatus'],
        [500, 'badStatus']
    ];

    for (const [status, failure] of statuses) {
        it(`maps HTTP ${status} to ${failure}`, async () => {
            const { fakeFetch } = createFakeFetch(() => {
                return new Response('no', {
                    status,
                    headers: { 'content-type': 'text/html' }
                });
            });
            const result =
                await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

            assert.deepEqual(result, { ok: false, failure, status });
        });
    }

    it('treats a cf-mitigated header as a bot wall', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return html('<html></html>', { 'cf-mitigated': 'challenge' });
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.deepEqual(result, {
            ok: false,
            failure: 'blockedStatus',
            status: 200
        });
    });

    it('requires an HTML content type for pages', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return new Response('{}', {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.deepEqual(result, {
            ok: false,
            failure: 'badContentType',
            status: 200
        });
    });

    it('accepts application/xhtml+xml pages', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return new Response('<html/>', {
                status: 200,
                headers: { 'content-type': 'application/xhtml+xml' }
            });
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.equal(result.ok, true);
    });

    it('requires an image content type for images', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return html();
        });
        const result = await createSafeFetcher(fakeFetch).fetchImage(
            'https://cdn.example.com/a.jpg'
        );

        assert.deepEqual(result, {
            ok: false,
            failure: 'badContentType',
            status: 200
        });
    });

    it('rejects a page whose declared length is over the cap', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return html('<html></html>', { 'content-length': '5000' });
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL, {
            maxBytes: 1000
        });

        assert.deepEqual(result, {
            ok: false,
            failure: 'tooLarge',
            status: 200
        });
    });

    it('returns image bytes and the bare media type', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return image(
                new Uint8Array([1, 2, 3, 4]),
                'image/jpeg; charset=binary'
            );
        });
        const result = await createSafeFetcher(fakeFetch).fetchImage(
            'https://cdn.example.com/a.jpg'
        );

        assert.ok(result.ok);
        assert.equal(result.value.contentType, 'image/jpeg');
        assert.deepEqual([...new Uint8Array(result.value.bytes)], [1, 2, 3, 4]);
    });

    it('stops reading an image stream once it passes the byte cap', async () => {
        let cancelled = false;
        const body = chunkedStream(400, 100);
        const reader = body.getReader();
        const tracked = new ReadableStream<Uint8Array>({
            async pull(controller) {
                const { done, value } = await reader.read();

                if (done) {
                    controller.close();

                    return;
                }

                controller.enqueue(value);
            },
            cancel() {
                cancelled = true;
            }
        });
        const { fakeFetch } = createFakeFetch(() => {
            return new Response(tracked, {
                status: 200,
                headers: { 'content-type': 'image/png' }
            });
        });
        const result = await createSafeFetcher(fakeFetch).fetchImage(
            'https://cdn.example.com/big.png',
            { maxBytes: 1000 }
        );

        assert.deepEqual(result, {
            ok: false,
            failure: 'tooLarge',
            status: 200
        });
        assert.equal(cancelled, true);
    });
});

describe('safe fetch: declared image lengths', () => {
    const declaredImage = (
        chunkSize: number,
        chunks: number,
        declared: number
    ) => {
        return createFakeFetch(() => {
            return new Response(chunkedStream(chunkSize, chunks), {
                status: 200,
                headers: {
                    'content-type': 'image/png',
                    'content-length': String(declared)
                }
            });
        }).fakeFetch;
    };

    it('reads an image of the declared length into one buffer', async () => {
        const result = await createSafeFetcher(
            declaredImage(100, 4, 400)
        ).fetchImage('https://cdn.example.com/a.png', { maxBytes: 1000 });

        assert.ok(result.ok);
        assert.equal(result.value.bytes.byteLength, 400);
    });

    it('keeps a body shorter than declared and refuses a longer one', async () => {
        const shorter = await createSafeFetcher(
            declaredImage(100, 3, 400)
        ).fetchImage('https://cdn.example.com/a.png', { maxBytes: 1000 });
        const longer = await createSafeFetcher(
            declaredImage(100, 5, 400)
        ).fetchImage('https://cdn.example.com/a.png', { maxBytes: 1000 });

        assert.ok(shorter.ok);
        assert.equal(shorter.value.bytes.byteLength, 300);
        assert.deepEqual(longer, {
            ok: false,
            failure: 'tooLarge',
            status: 200
        });
    });
});

describe('safe fetch: failures', () => {
    it('maps a stalled request to timeout', async () => {
        const { fakeFetch } = createFakeFetch((_, init) => {
            return new Promise<Response>((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => {
                    reject(init.signal?.reason);
                });
            });
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL, {
            timeoutMs: 20
        });

        assert.deepEqual(result, {
            ok: false,
            failure: 'timeout',
            status: null
        });
    });

    it('maps a thrown network error to network', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            throw new TypeError('connection reset');
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(PAGE_URL);

        assert.deepEqual(result, {
            ok: false,
            failure: 'network',
            status: null
        });
    });

    it('never puts the URL into a failure result', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            throw new TypeError(`failed ${PAGE_URL}`);
        });
        const result = await createSafeFetcher(fakeFetch).fetchPage(
            `${PAGE_URL}?secret=1`
        );

        assert.equal(
            JSON.stringify(result).includes('shop.example.com'),
            false
        );
    });
});

const API_URL = 'https://rewish.io/public/api/user/by-code/tESt01';
const ALLOWED_HOSTS = ['rewish.io'];
const JSON_HEADERS = { 'X-Systemcode': 'ReWish-Web', 'X-Flow-Id': 'flow-1' };

const json = (value: unknown, headers: Record<string, string> = {}) => {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            ...headers
        }
    });
};

describe('safe fetch: JSON with a host allowlist', () => {
    it('sends the caller headers with the honest User-Agent and parses the body', async () => {
        const { fakeFetch, requests } = createFakeFetch(() => {
            return json({ is_success: true, value: { id: 'u1' } });
        });
        const result = await createSafeFetcher(fakeFetch).fetchJson(API_URL, {
            allowedHosts: ALLOWED_HOSTS,
            headers: JSON_HEADERS
        });
        const headers = new Headers(requests[0]?.init.headers);

        assert.deepEqual(result, {
            ok: true,
            value: { is_success: true, value: { id: 'u1' } }
        });
        assert.equal(requests[0]?.init.redirect, 'manual');
        assert.equal(headers.get('x-systemcode'), 'ReWish-Web');
        assert.equal(headers.get('x-flow-id'), 'flow-1');
        assert.equal(headers.get('accept'), 'application/json');
        assert.equal(headers.get('user-agent'), LINK_IMPORT_USER_AGENT);
        assert.equal(headers.has('cookie'), false);
    });

    it('never lets the caller override the User-Agent or add credentials', async () => {
        const { fakeFetch, requests } = createFakeFetch(() => {
            return json({});
        });

        await createSafeFetcher(fakeFetch).fetchJson(API_URL, {
            allowedHosts: ALLOWED_HOSTS,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Cookie: 'session=1',
                Authorization: 'Bearer token',
                Host: 'evil.example'
            }
        });

        const headers = new Headers(requests[0]?.init.headers);

        assert.equal(headers.get('user-agent'), LINK_IMPORT_USER_AGENT);
        assert.equal(headers.has('cookie'), false);
        assert.equal(headers.has('authorization'), false);
        assert.equal(headers.has('host'), false);
    });

    it('refuses a start host off the allowlist without sending a request or the headers', async () => {
        const { fakeFetch, requests } = createFakeFetch(() => {
            return json({});
        });
        const result = await createSafeFetcher(fakeFetch).fetchJson(
            'https://evil.example/public/api',
            { allowedHosts: ALLOWED_HOSTS, headers: JSON_HEADERS }
        );

        assert.deepEqual(result, {
            ok: false,
            failure: 'blockedHost',
            status: null
        });
        assert.equal(requests.length, 0);
    });

    it('follows a redirect inside the allowlist and refuses one that leaves it', async () => {
        const inside = createFakeFetch(url => {
            return url === API_URL
                ? redirect('https://rewish.io/public/api/v2/user')
                : json({ moved: true });
        });
        const outside = createFakeFetch(() => {
            return redirect('https://storage.rewish.io/leak');
        });
        const followed = await createSafeFetcher(inside.fakeFetch).fetchJson(
            API_URL,
            { allowedHosts: ALLOWED_HOSTS, headers: JSON_HEADERS }
        );
        const refused = await createSafeFetcher(outside.fakeFetch).fetchJson(
            API_URL,
            { allowedHosts: ALLOWED_HOSTS, headers: JSON_HEADERS }
        );

        assert.deepEqual(followed, { ok: true, value: { moved: true } });
        assert.deepEqual(refused, {
            ok: false,
            failure: 'blockedHost',
            status: 302
        });
        assert.equal(outside.requests.length, 1);
    });

    it('rejects a redirect to a private host even when it is allowlisted', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return redirect('https://127.0.0.1/admin');
        });
        const result = await createSafeFetcher(fakeFetch).fetchJson(API_URL, {
            allowedHosts: ['rewish.io', '127.0.0.1']
        });

        assert.equal(result.ok, false);
        assert.equal(!result.ok && result.failure, 'blockedHost');
    });

    it('accepts +json media types and rejects other content types', async () => {
        const problem = createFakeFetch(() => {
            return new Response('{"a":1}', {
                status: 200,
                headers: { 'content-type': 'application/problem+json' }
            });
        });
        const page = createFakeFetch(() => {
            return html('{"a":1}');
        });

        assert.deepEqual(
            await createSafeFetcher(problem.fakeFetch).fetchJson(API_URL, {
                allowedHosts: ALLOWED_HOSTS
            }),
            { ok: true, value: { a: 1 } }
        );
        assert.deepEqual(
            await createSafeFetcher(page.fakeFetch).fetchJson(API_URL, {
                allowedHosts: ALLOWED_HOSTS
            }),
            { ok: false, failure: 'badContentType', status: 200 }
        );
    });

    it('fails with badContentType when the body is not JSON', async () => {
        const { fakeFetch } = createFakeFetch(() => {
            return new Response('<html>', {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        });
        const result = await createSafeFetcher(fakeFetch).fetchJson(API_URL, {
            allowedHosts: ALLOWED_HOSTS
        });

        assert.deepEqual(result, {
            ok: false,
            failure: 'badContentType',
            status: 200
        });
    });

    it('enforces the size cap on a declared length and on a stream', async () => {
        const declared = createFakeFetch(() => {
            return json({}, { 'content-length': '2000' });
        });
        const streamed = createFakeFetch(() => {
            return new Response(chunkedStream(512, 8), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        });
        const options = { allowedHosts: ALLOWED_HOSTS, maxBytes: 1024 };

        assert.deepEqual(
            await createSafeFetcher(declared.fakeFetch).fetchJson(
                API_URL,
                options
            ),
            { ok: false, failure: 'tooLarge', status: 200 }
        );
        assert.deepEqual(
            await createSafeFetcher(streamed.fakeFetch).fetchJson(
                API_URL,
                options
            ),
            { ok: false, failure: 'tooLarge', status: 200 }
        );
    });

    it('maps blocked and failing statuses and network errors to closed labels', async () => {
        const blocked = createFakeFetch(() => {
            return new Response('', { status: 429 });
        });
        const broken = createFakeFetch(() => {
            return new Response('', { status: 502 });
        });
        const offline = createFakeFetch(() => {
            throw new TypeError('connection reset');
        });
        const options = { allowedHosts: ALLOWED_HOSTS };

        assert.deepEqual(
            await createSafeFetcher(blocked.fakeFetch).fetchJson(
                API_URL,
                options
            ),
            { ok: false, failure: 'blockedStatus', status: 429 }
        );
        assert.deepEqual(
            await createSafeFetcher(broken.fakeFetch).fetchJson(
                API_URL,
                options
            ),
            { ok: false, failure: 'badStatus', status: 502 }
        );
        assert.deepEqual(
            await createSafeFetcher(offline.fakeFetch).fetchJson(
                API_URL,
                options
            ),
            { ok: false, failure: 'network', status: null }
        );
    });

    it('times out through the call budget', async () => {
        const { fakeFetch } = createFakeFetch((_url, init) => {
            return new Promise<Response>((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => {
                    reject(new DOMException('aborted', 'AbortError'));
                });
            });
        });
        const result = await createSafeFetcher(fakeFetch).fetchJson(API_URL, {
            allowedHosts: ALLOWED_HOSTS,
            timeoutMs: 10
        });

        assert.deepEqual(result, {
            ok: false,
            failure: 'timeout',
            status: null
        });
    });
});
