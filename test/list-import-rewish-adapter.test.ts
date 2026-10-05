import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createSafeFetcher } from '../src/bot/services/link-import/safe-fetch';
import { rewishAdapter } from '../src/bot/services/list-import/rewish/adapter';
import type {
    SourceFetchContext,
    SourceFetchResult,
    SourceItem
} from '../src/bot/services/list-import/types';
import {
    LINK_IMPORT_USER_AGENT,
    LIST_IMPORT_MAX_LISTS
} from '../src/shared/app-api';
import {
    parseListImportUrl,
    type ParsedListUrl
} from '../src/shared/list-import-url';

const FIXTURES = path.resolve(
    process.cwd(),
    'test/fixtures/list-import/rewish'
);
const USER_ID = '00000000-0000-0000-0000-000000000002';
const LIST_ID = 318652;

type Json = Record<string, unknown>;

const readFixture = (name: string): Json => {
    return JSON.parse(
        fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')
    ) as Json;
};

const envelope = (value: unknown) => {
    return { value, is_success: true, errors: [] };
};

const fixtureWishes = () => {
    return readFixture('wishes_by_rewish_id_trimmed').value as Json[];
};

const wish = (overrides: Json): Json => {
    return { ...(fixtureWishes()[0] as Json), ...overrides };
};

interface RecordedRequest {
    url: URL;
    headers: Headers;
}

type Route = (url: URL) => unknown;

const jsonResponse = (body: unknown) => {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    });
};

const createRewishFetch = (routes: Record<string, Route>) => {
    const requests: RecordedRequest[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
        const url = new URL(String(input));

        requests.push({ url, headers: new Headers(init?.headers) });

        const routeKey = Object.keys(routes).find(prefix => {
            return url.pathname.startsWith(prefix);
        });

        if (routeKey === undefined) {
            return new Response('not found', { status: 404 });
        }

        const body = (routes[routeKey] as Route)(url);

        return body instanceof Response ? body : jsonResponse(body);
    };

    return { fakeFetch, requests };
};

const profileRoutes = (wishes: unknown[] = fixtureWishes()) => {
    return {
        '/public/api/user/by-code/': () => {
            return readFixture('user_by_code');
        },
        '/public/api/re-wish/': () => {
            return readFixture('re_wish_list');
        },
        '/public/api/wish/by-rewish-id': () => {
            return envelope(wishes);
        }
    };
};

const createContext = (
    fakeFetch: typeof fetch,
    overrides: Partial<SourceFetchContext> = {}
): SourceFetchContext => {
    let flow = 0;

    return {
        fetcher: createSafeFetcher(fakeFetch),
        async acquireHostToken() {
            return true;
        },
        createFlowId() {
            flow += 1;

            return `flow-${flow}`;
        },
        now: Date.now,
        deadlineAt: Date.now() + 8000,
        ...overrides
    };
};

const parse = (raw: string): ParsedListUrl => {
    const parsed = parseListImportUrl(raw);

    assert.ok(parsed);

    return parsed;
};

const fetchProfile = async (
    routes: Record<string, Route>,
    raw = 'https://rewish.io/tESt01'
) => {
    const { fakeFetch, requests } = createRewishFetch(routes);
    const result = await rewishAdapter.fetchItems(
        createContext(fakeFetch),
        parse(raw)
    );

    return { result, requests };
};

const itemsOf = (result: SourceFetchResult): SourceItem[] => {
    assert.equal(result.ok, true);

    return result.ok ? result.items : [];
};

describe('rewish adapter: profile links', () => {
    it('walks user, lists and wishes with the required headers', async () => {
        const { result, requests } = await fetchProfile(profileRoutes());

        assert.equal(result.ok && result.kind, 'wishes');
        assert.deepEqual(
            requests.map(request => {
                return request.url.pathname;
            }),
            [
                '/public/api/user/by-code/tESt01',
                `/public/api/re-wish/${USER_ID}`,
                '/public/api/wish/by-rewish-id'
            ]
        );
        assert.equal(
            requests[2]?.url.searchParams.get('rewish_id'),
            String(LIST_ID)
        );

        for (const [index, request] of requests.entries()) {
            assert.equal(request.headers.get('x-systemcode'), 'ReWish-Web');
            assert.equal(request.headers.get('x-flow-id'), `flow-${index + 1}`);
            assert.equal(request.headers.get('accept'), 'application/json');
            assert.equal(
                request.headers.get('user-agent'),
                LINK_IMPORT_USER_AGENT
            );
        }
    });

    it('passes the access code on every call when the link has one', async () => {
        const { requests } = await fetchProfile(
            profileRoutes(),
            'https://rewish.io/tESt01/wishes?access_code=test~code'
        );

        assert.equal(requests.length, 3);

        for (const request of requests) {
            assert.equal(
                request.url.searchParams.get('access_code'),
                'test~code'
            );
        }
    });

    it('maps fixture wishes: active by position first, gifted after, refs and fields', async () => {
        const items = itemsOf((await fetchProfile(profileRoutes())).result);

        assert.deepEqual(
            items.map(item => {
                return [item.sourceRef, item.gifted, item.order];
            }),
            [
                ['rewish:wish:6565464', false, 0],
                ['rewish:wish:2990647', false, 1],
                ['rewish:wish:6461158', false, 2],
                ['rewish:wish:6523062', true, 3],
                ['rewish:wish:6116225', true, 4],
                ['rewish:wish:6374722', true, 5]
            ]
        );

        const [first] = items;

        assert.equal(
            first?.title,
            'Перець Red Kampot з Камбоджі 50г, Terre Exotique - Купити за ціною 549 грн | Goodwine.com.ua'
        );
        assert.equal(first?.description, null);
        assert.equal(first?.price, 550);
        assert.equal(first?.currency, 'UAH');
        assert.equal(first?.foreignPrice, false);
        assert.equal(
            first?.imageUrl,
            'https://storage.rewish.io/00000000-0000-0000-0000-00000000000c_compressed'
        );
        assert.equal(items[2]?.imageUrl, null);
        assert.equal(items[2]?.description, '38 розмір');
    });

    it('drops a zero price without flagging a foreign currency', async () => {
        const items = itemsOf((await fetchProfile(profileRoutes())).result);
        const certificate = items.find(item => {
            return item.sourceRef === 'rewish:wish:6374722';
        });

        assert.equal(certificate?.price, null);
        assert.equal(certificate?.currency, null);
        assert.equal(certificate?.foreignPrice, false);
    });

    it('maps statuses: only 3 is gifted, 0, 1, 2, 4 and unknown stay active', async () => {
        const statuses = [0, 1, 2, 3, 4, 9, null];
        const items = itemsOf(
            (
                await fetchProfile(
                    profileRoutes(
                        statuses.map((status, index) => {
                            return wish({
                                id: 100 + index,
                                title: `Wish ${index}`,
                                purchase_link: null,
                                status,
                                position: index
                            });
                        })
                    )
                )
            ).result
        );
        const giftedRefs = items
            .filter(item => {
                return item.gifted;
            })
            .map(item => {
                return item.sourceRef;
            });

        assert.deepEqual(giftedRefs, ['rewish:wish:103']);
        assert.equal(items.length, statuses.length);
    });

    it('maps currencies 1, 2, 3 and 5 and drops every other one as a foreign price', async () => {
        const currencies = [1, 2, 3, 5, 4, 14];
        const items = itemsOf(
            (
                await fetchProfile(
                    profileRoutes(
                        currencies.map((currency, index) => {
                            return wish({
                                id: 200 + index,
                                title: `Priced ${index}`,
                                purchase_link: null,
                                price: 100,
                                currency,
                                position: index
                            });
                        })
                    )
                )
            ).result
        );

        assert.deepEqual(
            items.map(item => {
                return [item.price, item.currency, item.foreignPrice];
            }),
            [
                [100, 'UAH', false],
                [100, 'USD', false],
                [100, 'EUR', false],
                [100, 'PLN', false],
                [null, null, true],
                [null, null, true]
            ]
        );
    });

    it('turns a null or empty avatar and a foreign image host into no photo', async () => {
        const items = itemsOf(
            (
                await fetchProfile(
                    profileRoutes([
                        wish({ id: 301, title: 'A', avatar_path: null }),
                        wish({ id: 302, title: 'B', avatar_path: '' }),
                        wish({
                            id: 303,
                            title: 'C',
                            avatar_path: 'https://evil.example/x.jpg'
                        })
                    ])
                )
            ).result
        );

        assert.deepEqual(
            items.map(item => {
                return item.imageUrl;
            }),
            [null, null, null]
        );
    });

    it('drops untitled wishes and keeps only renderable links', async () => {
        const items = itemsOf(
            (
                await fetchProfile(
                    profileRoutes([
                        wish({ id: 401, title: '   ' }),
                        wish({
                            id: 402,
                            title: 'Link',
                            purchase_link: 'ftp://x'
                        }),
                        wish({
                            id: 403,
                            title: 'Long',
                            purchase_link: `https://shop.test/${'a'.repeat(2100)}`
                        })
                    ])
                )
            ).result
        );

        assert.deepEqual(
            items.map(item => {
                return [item.sourceRef, item.link];
            }),
            [
                ['rewish:wish:402', null],
                ['rewish:wish:403', null]
            ]
        );
    });

    it('fetches at most ten lists', async () => {
        const lists = Array.from(
            { length: LIST_IMPORT_MAX_LISTS + 2 },
            (_, index) => {
                return { id: 500 + index, wishes_count: 1 };
            }
        );
        const { requests } = await fetchProfile({
            ...profileRoutes(),
            '/public/api/re-wish/': () => {
                return envelope(lists);
            },
            '/public/api/wish/by-rewish-id': url => {
                const listId = Number(url.searchParams.get('rewish_id'));

                return envelope([
                    wish({ id: listId, title: `List ${listId}` })
                ]);
            }
        });
        const wishCalls = requests.filter(request => {
            return request.url.pathname === '/public/api/wish/by-rewish-id';
        });

        assert.equal(wishCalls.length, LIST_IMPORT_MAX_LISTS);
    });

    it('maps envelope 214 to userNotFound', async () => {
        const { result } = await fetchProfile({
            '/public/api/user/by-code/': () => {
                return readFixture('error_user_not_found_214');
            }
        });

        assert.deepEqual(result, { ok: false, outcome: 'userNotFound' });
    });

    it('maps code 0 to invalidUrl and an unknown code to upstream', async () => {
        const failing = (code: unknown) => {
            return {
                '/public/api/user/by-code/': () => {
                    return {
                        value: null,
                        is_success: false,
                        errors: [{ code, message: 'x' }]
                    };
                }
            };
        };

        assert.deepEqual((await fetchProfile(failing('0'))).result, {
            ok: false,
            outcome: 'invalidUrl'
        });
        assert.deepEqual((await fetchProfile(failing(777))).result, {
            ok: false,
            outcome: 'upstream'
        });
    });

    it('reports schemaChanged for a broken shape', async () => {
        const broken = [
            { id: 'not-a-number', title: 'x' },
            wish({ title: 42 }),
            wish({ price: 'free' })
        ];

        for (const entry of broken) {
            const { result } = await fetchProfile(profileRoutes([entry]));

            assert.deepEqual(result, { ok: false, outcome: 'schemaChanged' });
        }

        const { result } = await fetchProfile({
            ...profileRoutes(),
            '/public/api/user/by-code/': () => {
                return { unexpected: true };
            }
        });

        assert.deepEqual(result, { ok: false, outcome: 'schemaChanged' });
    });

    it('ignores unknown fields', async () => {
        const items = itemsOf(
            (
                await fetchProfile(
                    profileRoutes([
                        wish({ id: 601, title: 'Extra', brand_new_field: [1] })
                    ])
                )
            ).result
        );

        assert.equal(items.length, 1);
    });

    it('reports empty when no wish survives mapping', async () => {
        const { result } = await fetchProfile(profileRoutes([]));

        assert.deepEqual(result, { ok: false, outcome: 'empty' });
    });

    it('maps HTTP failures to upstream and a dead network to timeout', async () => {
        const { result: upstream } = await fetchProfile({
            '/public/api/user/by-code/': () => {
                return new Response('boom', { status: 500 });
            }
        });
        const offline: typeof fetch = async () => {
            throw new TypeError('network down');
        };
        const timeout = await rewishAdapter.fetchItems(
            createContext(offline),
            parse('https://rewish.io/tESt01')
        );

        assert.deepEqual(upstream, { ok: false, outcome: 'upstream' });
        assert.deepEqual(timeout, { ok: false, outcome: 'timeout' });
    });

    it('stops with timeout once the fetch budget is spent', async () => {
        const { fakeFetch, requests } = createRewishFetch(profileRoutes());
        const result = await rewishAdapter.fetchItems(
            createContext(fakeFetch, { deadlineAt: Date.now() - 1 }),
            parse('https://rewish.io/tESt01')
        );

        assert.deepEqual(result, { ok: false, outcome: 'timeout' });
        assert.equal(requests.length, 0);
    });

    it('takes one host limiter token and reports rateLimited when refused', async () => {
        const { fakeFetch, requests } = createRewishFetch(profileRoutes());
        const hosts: string[] = [];
        const allowed = await rewishAdapter.fetchItems(
            createContext(fakeFetch, {
                async acquireHostToken(host) {
                    hosts.push(host);

                    return true;
                }
            }),
            parse('https://rewish.io/tESt01')
        );
        const refused = await rewishAdapter.fetchItems(
            createContext(fakeFetch, {
                async acquireHostToken() {
                    return false;
                }
            }),
            parse('https://rewish.io/tESt01')
        );

        assert.equal(allowed.ok, true);
        assert.deepEqual(hosts, ['rewish.io']);
        assert.deepEqual(refused, { ok: false, outcome: 'rateLimited' });
        assert.equal(requests.length, 3);
    });
});

describe('rewish adapter: collection links', () => {
    const collectionUrl =
        'https://rewish.io/tESt01/collection/123456?access_code=test-access-code';

    it('calls get-by-id with the id, the owner code and the access code', async () => {
        const { result, requests } = await fetchProfile(
            {
                '/public/api/collection/get-by-id': () => {
                    return readFixture('collection_get_by_id');
                }
            },
            collectionUrl
        );
        const [request] = requests;

        assert.equal(requests.length, 1);
        assert.equal(request?.url.searchParams.get('id'), '123456');
        assert.equal(request?.url.searchParams.get('user_code'), 'tESt01');
        assert.equal(
            request?.url.searchParams.get('access_code'),
            'test-access-code'
        );
        assert.equal(result.ok && result.kind, 'collection');

        const items = itemsOf(result);

        assert.deepEqual(
            items.map(item => {
                return item.sourceRef;
            }),
            [
                'rewish:item:4270152',
                'rewish:item:4270111',
                'rewish:item:4269983',
                'rewish:item:4269980',
                'rewish:item:4269975'
            ]
        );
        assert.equal(
            items[0]?.imageUrl,
            'https://storage.rewish.io/00000000-0000-0000-0000-000000000001'
        );
        assert.equal(
            items[2]?.imageUrl,
            'https://storage.rewish.io/00000000-0000-0000-0000-000000000004'
        );
        assert.equal(items[0]?.currency, 'PLN');
        assert.equal(items[4]?.currency, 'UAH');
        assert.equal(items[3]?.description, 'Test description 4');
    });

    it('maps envelope 615 to privateCollection', async () => {
        const { result } = await fetchProfile(
            {
                '/public/api/collection/get-by-id': () => {
                    return readFixture('error_collection_privacy_615');
                }
            },
            collectionUrl
        );

        assert.deepEqual(result, { ok: false, outcome: 'privateCollection' });
    });

    it('treats a collection without items as empty', async () => {
        const collection = readFixture('collection_get_by_id');
        const value = collection.value as Json;
        const { result } = await fetchProfile(
            {
                '/public/api/collection/get-by-id': () => {
                    return envelope({ ...value, collection_items: [] });
                }
            },
            collectionUrl
        );

        assert.deepEqual(result, { ok: false, outcome: 'empty' });
    });
});

describe('rewish adapter: photo candidates', () => {
    it('tries the original before the _compressed variant', () => {
        assert.deepEqual(
            rewishAdapter.photoCandidates(
                'https://storage.rewish.io/00000000-0000-0000-0000-00000000000c_compressed'
            ),
            [
                'https://storage.rewish.io/00000000-0000-0000-0000-00000000000c',
                'https://storage.rewish.io/00000000-0000-0000-0000-00000000000c_compressed'
            ]
        );
    });

    it('keeps an uncompressed URL as the only candidate', () => {
        assert.deepEqual(
            rewishAdapter.photoCandidates(
                'https://storage.rewish.io/00000000-0000-0000-0000-000000000001'
            ),
            ['https://storage.rewish.io/00000000-0000-0000-0000-000000000001']
        );
    });

    it('declares the API and image hosts', () => {
        assert.deepEqual(rewishAdapter.apiHosts, ['rewish.io']);
        assert.deepEqual(rewishAdapter.imageHosts, ['storage.rewish.io']);
    });
});
