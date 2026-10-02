import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { CacheLike } from '../../src/web/routes';
import { createD1Harness, seedGeneratedWishes } from './d1-harness';
import type { D1Harness } from './d1-harness';

const baseTime = Date.parse('2026-10-01T12:00:00.000Z');
const ownerTelegramId = 9_001;
const CANONICAL_ORIGIN = 'https://wishlist.chernenko.dev';
const WORKERS_DEV_ORIGIN = 'https://preview-wishlist.chernenko.workers.dev';
const EXPECTED_CSP =
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

interface StoredEntry {
    body: string;
    headers: Headers;
}

class FakeCache implements CacheLike {
    readonly entries = new Map<string, StoredEntry>();
    readonly putKeys: string[] = [];

    async match(key: string) {
        const entry = this.entries.get(key);

        return entry
            ? new Response(entry.body, { headers: entry.headers })
            : undefined;
    }

    async put(key: string, response: Response) {
        assert.equal(response.headers.get('Set-Cookie'), null);
        assert.equal(
            response.headers.get('Cache-Control'),
            'public, max-age=86400'
        );
        this.putKeys.push(key);
        this.entries.set(key, {
            body: await response.text(),
            headers: new Headers(response.headers)
        });
    }
}

describe('share page routes', () => {
    let harness: D1Harness;
    let repositories: D1Harness['repositories'];
    let cache: FakeCache;
    let tick = 0;

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };
    const nextNow = () => {
        tick += 1;

        return new Date(baseTime + tick * 1_000);
    };
    const buildEnv = (
        overrides: Partial<Record<string, string>> = {}
    ): WorkerBindings => {
        return {
            ...harness.env,
            BOT_ENVIRONMENT: 'production',
            ...overrides
        } as unknown as WorkerBindings;
    };
    const request = (
        path: string,
        init: RequestInit = {},
        env: WorkerBindings = buildEnv()
    ) => {
        const app = createApp({}, {}, { cache, now: () => new Date() });

        return app.request(path, init, env);
    };
    const createOwner = async (
        input: {
            language?: 'uk' | 'en' | 'pl' | null;
            telegramId?: number;
        } = {}
    ) => {
        const created = await run(
            repositories.users.create({
                telegramId: input.telegramId ?? ownerTelegramId,
                username: 'owner_user',
                telegramLanguageCode: 'de',
                payments: 'Mono *jar*: https://send.monobank.ua/jar/abc.',
                currency: 'UAH',
                createdAt: nextNow()
            })
        );

        assert.ok(created);

        if (input.language) {
            await run(
                repositories.users.setLanguage(
                    created.id,
                    input.language,
                    nextNow()
                )
            );
        }

        return created;
    };
    const createWish = async (
        userId: number,
        title: string,
        patch: Parameters<typeof repositories.wishes.updateFields>[2] = {}
    ) => {
        const wish = await run(
            repositories.wishes.create(userId, title, nextNow())
        );

        assert.ok(wish);

        if (Object.keys(patch).length > 0) {
            await run(
                repositories.wishes.updateFields(
                    wish.id,
                    userId,
                    patch,
                    nextNow()
                )
            );
        }

        return wish;
    };
    const publish = async (userId: number, name = 'Alice') => {
        const share = await run(
            repositories.shares.publish(userId, name, nextNow())
        );

        return share.publicId;
    };
    const seedShare = async (language: 'uk' | 'en' | 'pl' | null = 'uk') => {
        const owner = await createOwner({ language });
        const wish = await createWish(owner.id, 'Coffee <script>x</script>', {
            description: 'Dark roast\nwith *care*',
            link: 'https://www.shop.test/coffee?x=1',
            price: 2500
        });
        const publicId = await publish(owner.id);

        return { owner, wish, publicId };
    };
    const etagOf = (response: Response) => {
        const etag = response.headers.get('ETag');

        assert.ok(etag);

        return etag;
    };

    before(async () => {
        harness = await createD1Harness();
        repositories = harness.repositories;
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        await harness.clearApplicationTables();
        cache = new FakeCache();
    });

    it('renders a miss, then serves the same page as a hit, and stores one cache entry', async () => {
        const { publicId } = await seedShare();

        const miss = await request(`/uk/w/${publicId}`);
        const missBody = await miss.text();

        assert.equal(miss.status, 200);
        assert.equal(
            miss.headers.get('Server-Timing'),
            'share-cache;desc=miss'
        );
        assert.equal(miss.headers.get('Cache-Control'), 'no-cache');
        assert.equal(miss.headers.get('Content-Language'), 'uk');
        assert.match(
            miss.headers.get('Content-Type') ?? '',
            /^text\/html; charset=utf-8$/
        );
        assert.equal(miss.headers.get('Set-Cookie'), null);
        assert.ok(missBody.startsWith('<!DOCTYPE html>'));
        assert.equal(cache.putKeys.length, 1);
        assert.equal(
            cache.putKeys[0],
            `http://localhost/__share-cache/uk/${publicId}/${etagOf(miss).replaceAll('"', '')}`
        );

        const hit = await request(`/uk/w/${publicId}`);

        assert.equal(hit.status, 200);
        assert.equal(hit.headers.get('Server-Timing'), 'share-cache;desc=hit');
        assert.equal(hit.headers.get('Cache-Control'), 'no-cache');
        assert.equal(etagOf(hit), etagOf(miss));
        assert.equal(await hit.text(), missBody);
        assert.equal(cache.putKeys.length, 1);
    });

    it('serves each language from its own cache entry', async () => {
        const { publicId } = await seedShare();
        const ukrainian = await request(`/uk/w/${publicId}`);
        const polish = await request(`/pl/w/${publicId}`);

        assert.notEqual(etagOf(ukrainian), etagOf(polish));
        assert.equal(polish.headers.get('Content-Language'), 'pl');
        assert.match(await polish.text(), /<html lang="pl">/);
        assert.equal(cache.putKeys.length, 2);
    });

    it('answers 304 for a matching If-None-Match without rendering or caching', async () => {
        const { publicId } = await seedShare();
        const first = await request(`/en/w/${publicId}`);
        const etag = etagOf(first);
        const putsBefore = cache.putKeys.length;

        for (const candidate of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
            const response = await request(`/en/w/${publicId}`, {
                headers: { 'If-None-Match': candidate }
            });

            assert.equal(response.status, 304);
            assert.equal(await response.text(), '');
            assert.equal(response.headers.get('ETag'), etag);
            assert.equal(response.headers.get('Cache-Control'), 'no-cache');
            assert.equal(
                response.headers.get('Content-Security-Policy'),
                EXPECTED_CSP
            );
        }

        const stale = await request(`/en/w/${publicId}`, {
            headers: { 'If-None-Match': '"0000"' }
        });

        assert.equal(stale.status, 200);
        assert.equal(cache.putKeys.length, putsBefore);
    });

    it('changes the ETag and misses the cache after every content mutation', async () => {
        const { owner, wish, publicId } = await seedShare();
        const second = await createWish(owner.id, 'Second');
        const mutations: [string, () => Promise<unknown>][] = [
            [
                'create',
                () => {
                    return run(
                        repositories.wishes.create(owner.id, 'Third', nextNow())
                    );
                }
            ],
            [
                'updateFields',
                () => {
                    return run(
                        repositories.wishes.updateFields(
                            wish.id,
                            owner.id,
                            { title: 'Renamed' },
                            nextNow()
                        )
                    );
                }
            ],
            [
                'togglePriority',
                () => {
                    return run(
                        repositories.wishes.togglePriority(
                            wish.id,
                            owner.id,
                            nextNow()
                        )
                    );
                }
            ],
            [
                'appendImage',
                () => {
                    return run(
                        repositories.wishes.appendImage(
                            wish.id,
                            owner.id,
                            'file-id',
                            nextNow()
                        )
                    );
                }
            ],
            [
                'clearImages',
                () => {
                    return run(
                        repositories.wishes.clearImages(
                            wish.id,
                            owner.id,
                            nextNow()
                        )
                    );
                }
            ],
            [
                'toggleHidden',
                () => {
                    return run(
                        repositories.wishes.toggleHidden(
                            second.id,
                            owner.id,
                            nextNow()
                        )
                    );
                }
            ],
            [
                'softRemove',
                () => {
                    return run(
                        repositories.wishes.softRemove(
                            wish.id,
                            owner.id,
                            false,
                            nextNow()
                        )
                    );
                }
            ],
            [
                'setPayments',
                () => {
                    return run(
                        repositories.users.setPayments(
                            owner.id,
                            'New payments',
                            nextNow()
                        )
                    );
                }
            ],
            [
                'setVisibility',
                () => {
                    return run(
                        repositories.users.setVisibility(
                            owner.id,
                            {
                                usernameSearchable: true,
                                phone: null,
                                phoneDigits: null,
                                username: 'owner_user'
                            },
                            nextNow()
                        )
                    );
                }
            ],
            [
                'publish rename',
                () => {
                    return run(
                        repositories.shares.publish(
                            owner.id,
                            'Alice Renamed',
                            nextNow()
                        )
                    );
                }
            ],
            [
                'softRemoveAll',
                () => {
                    return run(
                        repositories.wishes.softRemoveAll(owner.id, nextNow())
                    );
                }
            ]
        ];

        let previous = await request(`/uk/w/${publicId}`);

        for (const [name, mutate] of mutations) {
            await mutate();

            const next = await request(`/uk/w/${publicId}`);

            assert.equal(next.status, 200, name);
            assert.equal(
                next.headers.get('Server-Timing'),
                'share-cache;desc=miss',
                name
            );
            assert.notEqual(etagOf(next), etagOf(previous), name);

            previous = next;
        }
    });

    it('does not change the ETag after a profile sync that only updates last seen', async () => {
        const { owner, publicId } = await seedShare();
        const before = await request(`/uk/w/${publicId}`);

        await run(
            repositories.users.syncProfile(owner.id, {
                username: 'owner_user',
                telegramLanguageCode: 'de',
                now: nextNow()
            })
        );

        const after = await request(`/uk/w/${publicId}`);

        assert.equal(etagOf(after), etagOf(before));
        assert.equal(
            after.headers.get('Server-Timing'),
            'share-cache;desc=hit'
        );
    });

    it('redirects /w/:id by Accept-Language, then by the owner language', async () => {
        const { publicId } = await seedShare('en');

        const negotiated = await request(`/w/${publicId}`, {
            headers: { 'Accept-Language': 'de;q=0.9, pl-PL;q=0.8, en;q=0.1' }
        });

        assert.equal(negotiated.status, 302);
        assert.equal(negotiated.headers.get('Location'), `/pl/w/${publicId}`);
        assert.equal(negotiated.headers.get('Vary'), 'Accept-Language');
        assert.equal(
            negotiated.headers.get('Cache-Control'),
            'private, no-store'
        );

        const fallback = await request(`/w/${publicId}`, {
            headers: { 'Accept-Language': 'de-DE,fr;q=0.8' }
        });

        assert.equal(fallback.status, 302);
        assert.equal(fallback.headers.get('Location'), `/en/w/${publicId}`);

        const withoutHeader = await request(`/w/${publicId}`);

        assert.equal(
            withoutHeader.headers.get('Location'),
            `/en/w/${publicId}`
        );
        assert.equal(cache.putKeys.length, 0);
    });

    it('falls back to the Telegram language code when the owner has no language', async () => {
        const owner = await createOwner();

        await run(
            repositories.users.syncProfile(owner.id, {
                username: 'owner_user',
                telegramLanguageCode: 'pl-PL',
                now: nextNow()
            })
        );

        await createWish(owner.id, 'Book');

        const publicId = await publish(owner.id);
        const response = await request(`/w/${publicId}`);

        assert.equal(response.headers.get('Location'), `/pl/w/${publicId}`);
    });

    it('redirects uppercase ids to the lowercase url with a 301', async () => {
        const { publicId } = await seedShare();

        const localized = await request(`/uk/w/${publicId.toUpperCase()}`);

        assert.equal(localized.status, 301);
        assert.equal(localized.headers.get('Location'), `/uk/w/${publicId}`);

        const negotiated = await request(`/w/${publicId.toUpperCase()}`);

        assert.equal(negotiated.status, 301);
        assert.equal(negotiated.headers.get('Location'), `/w/${publicId}`);
    });

    it('returns a localized noindex 404 for invalid, unknown and blocked ids', async () => {
        const { owner, publicId } = await seedShare();
        const unknownId = '0'.repeat(26);

        for (const path of [
            '/uk/w/not-an-id',
            `/uk/w/${unknownId}`,
            `/w/${unknownId}`,
            '/uk/w/ilou0000000000000000000000'
        ]) {
            const response = await request(path);
            const body = await response.text();

            assert.equal(response.status, 404, path);
            assert.equal(
                response.headers.get('Cache-Control'),
                'private, no-store'
            );
            assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
            assert.match(body, /<meta name="robots" content="noindex"\/>/);
            assert.match(body, /Сторінку не знайдено/);
        }

        const polish = await request(`/pl/w/${unknownId}`);

        assert.equal(polish.status, 404);
        assert.match(await polish.text(), /<html lang="pl">/);

        const negotiated = await request(`/w/${unknownId}`, {
            headers: { 'Accept-Language': 'en-GB' }
        });

        assert.match(await negotiated.text(), /<html lang="en">/);

        await run(
            repositories.users.markBlockedByTelegramId(
                owner.telegramId,
                nextNow()
            )
        );

        const blocked = await request(`/uk/w/${publicId}`);

        assert.equal(blocked.status, 404);
        assert.equal(blocked.headers.get('X-Robots-Tag'), 'noindex');
        assert.equal(cache.putKeys.length, 0);
    });

    it('returns 410 after stopping to share and restores the same link when sharing again', async () => {
        const { owner, publicId } = await seedShare();

        assert.equal((await request(`/uk/w/${publicId}`)).status, 200);

        await run(repositories.shares.revoke(owner.id, nextNow()));

        for (const path of [`/uk/w/${publicId}`, `/w/${publicId}`]) {
            const gone = await request(path);
            const body = await gone.text();

            assert.equal(gone.status, 410, path);
            assert.equal(
                gone.headers.get('Cache-Control'),
                'private, no-store'
            );
            assert.equal(gone.headers.get('X-Robots-Tag'), 'noindex');
            assert.match(body, /<meta name="robots" content="noindex"\/>/);
            assert.match(body, /більше не діляться/);
            assert.doesNotMatch(body, /Coffee/);
        }

        await run(repositories.shares.publish(owner.id, 'Alice', nextNow()));

        const restored = await request(`/uk/w/${publicId}`);

        assert.equal(restored.status, 200);
        assert.match(await restored.text(), /Coffee/);
    });

    it('rotating the link makes the old id unknown and the new one work', async () => {
        const { owner, publicId } = await seedShare();
        const rotated = await run(
            repositories.shares.rotate(owner.id, nextNow())
        );

        assert.ok(rotated);
        assert.equal((await request(`/uk/w/${publicId}`)).status, 404);
        assert.equal((await request(`/uk/w/${rotated.publicId}`)).status, 200);
    });

    it('never shows hidden or removed wishes, the phone number or gives', async () => {
        const { owner, wish } = await seedShare();
        const hidden = await createWish(owner.id, 'Hidden secret');
        const removed = await createWish(owner.id, 'Removed secret');

        await run(
            repositories.users.setVisibility(
                owner.id,
                {
                    usernameSearchable: false,
                    phone: '+380501234567',
                    phoneDigits: '380501234567',
                    username: 'owner_user'
                },
                nextNow()
            )
        );
        await run(
            repositories.wishes.toggleHidden(hidden.id, owner.id, nextNow())
        );
        await run(
            repositories.wishes.softRemove(
                removed.id,
                owner.id,
                false,
                nextNow()
            )
        );

        const share = await run(
            repositories.shares.findActiveByUserId(owner.id)
        );

        assert.ok(share);

        const response = await request(`/uk/w/${share.publicId}`);
        const body = await response.text();

        assert.equal(response.status, 200);
        assert.match(body, /Coffee/);
        assert.doesNotMatch(body, /Hidden secret|Removed secret/);
        assert.doesNotMatch(body, /380501234567|\+38050|phone/i);
        assert.doesNotMatch(body, /@owner_user/);
        assert.equal(wish.title.length > 0, true);
    });

    it('shows the username only when it is searchable', async () => {
        const { owner, publicId } = await seedShare();

        await run(
            repositories.users.setVisibility(
                owner.id,
                {
                    usernameSearchable: true,
                    phone: null,
                    phoneDigits: null,
                    username: 'owner_user'
                },
                nextNow()
            )
        );

        const body = await (await request(`/uk/w/${publicId}`)).text();

        assert.match(body, /@owner_user/);
        assert.match(body, /href="https:\/\/t\.me\/owner_user"/);
    });

    it('serves robots.txt per environment', async () => {
        const production = await request(`${CANONICAL_ORIGIN}/robots.txt`);

        assert.equal(production.status, 200);
        assert.match(
            production.headers.get('Content-Type') ?? '',
            /^text\/plain/
        );
        assert.equal(
            await production.text(),
            'User-agent: *\nAllow: /\nDisallow: /__share-cache/\n'
        );

        for (const environment of ['preview', 'local']) {
            const response = await request(
                `${CANONICAL_ORIGIN}/robots.txt`,
                {},
                buildEnv({ BOT_ENVIRONMENT: environment })
            );

            assert.equal(
                await response.text(),
                'User-agent: *\nDisallow: /\n',
                environment
            );
        }
    });

    it('allows indexing only in production for non-empty lists', async () => {
        const { owner, publicId } = await seedShare();

        const production = await (
            await request(`${CANONICAL_ORIGIN}/uk/w/${publicId}`)
        ).text();

        assert.match(
            production,
            /<meta name="robots" content="index, follow"\/>/
        );

        cache = new FakeCache();

        const preview = await (
            await request(
                `/uk/w/${publicId}`,
                {},
                buildEnv({ BOT_ENVIRONMENT: 'preview' })
            )
        ).text();

        assert.match(preview, /<meta name="robots" content="noindex"\/>/);

        await run(repositories.wishes.softRemoveAll(owner.id, nextNow()));

        const empty = await request(`/uk/w/${publicId}`);
        const emptyBody = await empty.text();

        assert.equal(empty.status, 200);
        assert.match(emptyBody, /<meta name="robots" content="noindex"\/>/);
        assert.match(emptyBody, /Тут поки що порожньо/);
    });

    it('keeps production pages noindex outside the canonical host', async () => {
        const { publicId } = await seedShare();

        const workersDev = await request(
            `${WORKERS_DEV_ORIGIN}/uk/w/${publicId}`
        );
        const workersDevBody = await workersDev.text();

        assert.equal(workersDev.status, 200);
        assert.match(
            workersDevBody,
            /<meta name="robots" content="noindex"\/>/
        );
        assert.match(
            workersDevBody,
            new RegExp(
                `<link rel="canonical" href="${WORKERS_DEV_ORIGIN}/uk/w/${publicId}"`
            )
        );

        const robots = await request(`${WORKERS_DEV_ORIGIN}/robots.txt`);

        assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');

        const canonical = await (
            await request(`${CANONICAL_ORIGIN}/uk/w/${publicId}`)
        ).text();

        assert.match(
            canonical,
            /<meta name="robots" content="index, follow"\/>/
        );
    });

    it('shows a truncation notice and at most 100 wishes for huge lists', async () => {
        const { owner, publicId } = await seedShare();

        await seedGeneratedWishes(harness, owner.id, 120);

        const body = await (await request(`/uk/w/${publicId}`)).text();

        assert.equal(body.match(/<article /g)?.length, 100);
        assert.match(body, /Показано перші 100 бажань/);
    });

    it('answers HEAD like GET without a body', async () => {
        const { publicId } = await seedShare();
        const get = await request(`/uk/w/${publicId}`);
        const head = await request(`/uk/w/${publicId}`, { method: 'HEAD' });

        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
        assert.equal(head.headers.get('ETag'), get.headers.get('ETag'));
        assert.equal(head.headers.get('Content-Security-Policy'), EXPECTED_CSP);

        const headRedirect = await request(`/w/${publicId}`, {
            method: 'HEAD'
        });

        assert.equal(headRedirect.status, 302);
    });

    it('sets the security headers on every share response', async () => {
        const { publicId } = await seedShare();
        const responses = await Promise.all([
            request(`/uk/w/${publicId}`),
            request(`/w/${publicId}`),
            request(`/uk/w/${'0'.repeat(26)}`),
            request(`/uk/w/${publicId.toUpperCase()}`)
        ]);

        for (const response of responses) {
            assert.equal(
                response.headers.get('Content-Security-Policy'),
                EXPECTED_CSP
            );
            assert.equal(
                response.headers.get('X-Content-Type-Options'),
                'nosniff'
            );
            assert.equal(
                response.headers.get('Referrer-Policy'),
                'no-referrer'
            );
            assert.equal(response.headers.get('Set-Cookie'), null);
        }
    });

    it('renders without a cache when none is available', async () => {
        const { publicId } = await seedShare();
        const app = createApp({}, {}, {});
        const response = await app.request(`/uk/w/${publicId}`, {}, buildEnv());

        assert.equal(response.status, 200);
        assert.equal(
            response.headers.get('Server-Timing'),
            'share-cache;desc=bypass'
        );
    });

    it('still renders when the cache fails to store the page', async () => {
        const { publicId } = await seedShare();
        const failingCache: CacheLike = {
            match: async () => undefined,
            put: async () => {
                throw new Error('cache unavailable');
            }
        };
        const app = createApp({}, {}, { cache: failingCache });
        const response = await app.request(`/uk/w/${publicId}`, {}, buildEnv());

        assert.equal(response.status, 200);
    });

    it('keeps the root, readiness and unknown routes untouched', async () => {
        const root = await request('/');

        assert.equal(root.status, 200);
        assert.deepEqual(await root.json(), {
            service: 'wishlist',
            runtime: 'cloudflare-workers',
            status: 'runtime-ready'
        });
        assert.equal((await request('/w/')).status, 404);
        assert.equal((await request('/de/w/' + '0'.repeat(26))).status, 404);
    });

    it('renders the full page content for a populated list', async () => {
        const { publicId } = await seedShare();
        const response = await request(`/en/w/${publicId}`);
        const body = await response.text();

        assert.match(body, /<h1>Wish list of Alice<\/h1>/);
        assert.match(body, /Coffee &lt;script&gt;x&lt;\/script&gt;/);
        assert.doesNotMatch(body, /<script/i);
        assert.match(body, /shop\.test/);
        assert.match(
            body,
            /href="https:\/\/www\.shop\.test\/coffee\?x=1"[^>]*rel="nofollow ugc noopener noreferrer"/
        );
        assert.match(body, /href="https:\/\/send\.monobank\.ua\/jar\/abc"/);
        assert.match(body, /href="https:\/\/t\.me\/wishlist_ua_bot"/);
        assert.match(body, /ko-fi\.com/);
        assert.match(body, /github\.com\/serhii-chernenko\/wishlist/);
        assert.match(
            body,
            new RegExp(
                `rel="canonical" href="http://localhost/en/w/${publicId}"`
            )
        );
    });
});
