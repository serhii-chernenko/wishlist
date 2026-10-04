import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { getRuntimeCrypto, sha256Hex } from '../../src/api/auth/crypto';
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
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

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
            repositories.wishes.create(userId, title, 'UAH', nextNow())
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

        const miss = await request(`/ua/w/${publicId}`);
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

        const hit = await request(`/ua/w/${publicId}`);

        assert.equal(hit.status, 200);
        assert.equal(hit.headers.get('Server-Timing'), 'share-cache;desc=hit');
        assert.equal(hit.headers.get('Cache-Control'), 'no-cache');
        assert.equal(etagOf(hit), etagOf(miss));
        assert.equal(await hit.text(), missBody);
        assert.equal(cache.putKeys.length, 1);
    });

    it('serves each language from its own cache entry', async () => {
        const { publicId } = await seedShare();
        const ukrainian = await request(`/ua/w/${publicId}`);
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
                        repositories.wishes.create(
                            owner.id,
                            'Third',
                            'UAH',
                            nextNow()
                        )
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
                'setPriorityLevel',
                () => {
                    return run(
                        repositories.wishes.setPriorityLevel(
                            wish.id,
                            owner.id,
                            3,
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
                'setShowUsername',
                () => {
                    return run(
                        repositories.shares.setShowUsername(
                            owner.id,
                            true,
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

        let previous = await request(`/ua/w/${publicId}`);

        for (const [name, mutate] of mutations) {
            await mutate();

            const next = await request(`/ua/w/${publicId}`);

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
        const before = await request(`/ua/w/${publicId}`);

        await run(
            repositories.users.syncProfile(owner.id, {
                username: 'owner_user',
                telegramLanguageCode: 'de',
                now: nextNow()
            })
        );

        const after = await request(`/ua/w/${publicId}`);

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

        const localized = await request(`/ua/w/${publicId.toUpperCase()}`);

        assert.equal(localized.status, 301);
        assert.equal(localized.headers.get('Location'), `/ua/w/${publicId}`);

        const negotiated = await request(`/w/${publicId.toUpperCase()}`);

        assert.equal(negotiated.status, 301);
        assert.equal(negotiated.headers.get('Location'), `/w/${publicId}`);
    });

    it('returns a localized noindex 404 for invalid, unknown and blocked ids', async () => {
        const { owner, publicId } = await seedShare();
        const unknownId = '0'.repeat(26);

        for (const path of [
            '/ua/w/not-an-id',
            `/ua/w/${unknownId}`,
            `/w/${unknownId}`,
            '/ua/w/ilou0000000000000000000000'
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

        const blocked = await request(`/ua/w/${publicId}`);

        assert.equal(blocked.status, 404);
        assert.equal(blocked.headers.get('X-Robots-Tag'), 'noindex');
        assert.equal(cache.putKeys.length, 0);
    });

    it('returns 410 after stopping to share and restores the same link when sharing again', async () => {
        const { owner, publicId } = await seedShare();

        assert.equal((await request(`/ua/w/${publicId}`)).status, 200);

        await run(repositories.shares.revoke(owner.id, nextNow()));

        for (const path of [`/ua/w/${publicId}`, `/w/${publicId}`]) {
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

        const restored = await request(`/ua/w/${publicId}`);

        assert.equal(restored.status, 200);
        assert.match(await restored.text(), /Coffee/);
    });

    it('rotating the link makes the old id unknown and the new one work', async () => {
        const { owner, publicId } = await seedShare();
        const rotated = await run(
            repositories.shares.rotate(owner.id, nextNow())
        );

        assert.ok(rotated);
        assert.equal((await request(`/ua/w/${publicId}`)).status, 404);
        assert.equal((await request(`/ua/w/${rotated.publicId}`)).status, 200);
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

        const response = await request(`/ua/w/${share.publicId}`);
        const body = await response.text();

        assert.equal(response.status, 200);
        assert.match(body, /Coffee/);
        assert.doesNotMatch(body, /Hidden secret|Removed secret/);
        assert.doesNotMatch(body, /380501234567|\+38050|phone/i);
        assert.doesNotMatch(body, /@owner_user/);
        assert.equal(wish.title.length > 0, true);
    });

    describe('username consent', () => {
        const setSearchable = (
            ownerId: number,
            usernameSearchable: boolean,
            phone: string | null = null
        ) => {
            return run(
                repositories.users.setVisibility(
                    ownerId,
                    {
                        usernameSearchable,
                        phone,
                        phoneDigits: phone?.replaceAll(/\D/g, '') ?? null,
                        username: 'owner_user'
                    },
                    nextNow()
                )
            );
        };

        it('hides the username by default even when the owner is searchable', async () => {
            const { owner, publicId } = await seedShare();

            await setSearchable(owner.id, true);

            const body = await (await request(`/ua/w/${publicId}`)).text();

            assert.doesNotMatch(body, /@owner_user/);
            assert.doesNotMatch(body, /t\.me\/owner_user/);
        });

        it('shows the username only after the owner enables it and only while searchable', async () => {
            const { owner, publicId } = await seedShare();

            await setSearchable(owner.id, true);

            const hidden = await request(`/ua/w/${publicId}`);

            await run(
                repositories.shares.setShowUsername(owner.id, true, nextNow())
            );

            const shown = await request(`/ua/w/${publicId}`);
            const shownBody = await shown.text();

            assert.notEqual(etagOf(shown), etagOf(hidden));
            assert.match(shownBody, /@owner_user/);
            assert.match(shownBody, /href="https:\/\/t\.me\/owner_user"/);

            await setSearchable(owner.id, false);

            const notSearchable = await request(`/ua/w/${publicId}`);

            assert.notEqual(etagOf(notSearchable), etagOf(shown));
            assert.doesNotMatch(await notSearchable.text(), /@owner_user/);

            await setSearchable(owner.id, true);
            await run(
                repositories.shares.setShowUsername(owner.id, false, nextNow())
            );

            const disabledAgain = await request(`/ua/w/${publicId}`);

            assert.notEqual(etagOf(disabledAgain), etagOf(shown));
            assert.doesNotMatch(await disabledAgain.text(), /@owner_user/);
        });

        it('never puts the phone number on the page, whatever the settings', async () => {
            const { owner, publicId } = await seedShare();
            const phone = '+380 50 123-45-67';
            const phoneDigits = '380501234567';
            const nationalDigits = '0501234567';

            for (const usernameSearchable of [false, true]) {
                for (const showUsername of [false, true]) {
                    await setSearchable(owner.id, usernameSearchable, phone);
                    await run(
                        repositories.shares.setShowUsername(
                            owner.id,
                            showUsername,
                            nextNow()
                        )
                    );

                    for (const language of ['ua', 'en', 'pl']) {
                        const response = await request(
                            `/${language}/w/${publicId}`
                        );
                        const body = (await response.text()).replaceAll(
                            publicId,
                            ''
                        );
                        const digitsOnly = body.replaceAll(/\D/g, '');
                        const label = `${language} searchable=${usernameSearchable} show=${showUsername}`;

                        assert.equal(response.status, 200, label);
                        assert.equal(
                            digitsOnly.includes(phoneDigits),
                            false,
                            label
                        );
                        assert.equal(
                            digitsOnly.includes(nationalDigits),
                            false,
                            label
                        );
                        assert.doesNotMatch(body, /\+380|tel:/i, label);
                        assert.equal(
                            body.includes('@owner_user'),
                            usernameSearchable && showUsername,
                            label
                        );
                    }
                }
            }
        });
    });

    it('keeps a separate page copy and ETag per chosen theme', async () => {
        const { publicId } = await seedShare();
        const system = await request(`/en/w/${publicId}`);
        const dark = await request(`/en/w/${publicId}`, {
            headers: { Cookie: 'theme=dark' }
        });
        const light = await request(`/en/w/${publicId}`, {
            headers: { Cookie: 'other=1; theme=light' }
        });
        const bogus = await request(`/en/w/${publicId}`, {
            headers: { Cookie: 'theme=sepia' }
        });
        const systemHtml = await system.text();
        const darkHtml = await dark.text();

        assert.doesNotMatch(systemHtml, /<html[^>]*data-theme/);
        assert.match(darkHtml, /<html lang="en" data-theme="wishlist-dark">/);
        assert.match(await light.text(), /data-theme="wishlist"/);
        assert.equal(etagOf(bogus), etagOf(system));
        assert.equal(new Set([system, dark, light].map(etagOf)).size, 3);
        assert.equal(system.headers.get('Vary'), 'Cookie');
        assert.equal(cache.putKeys.length, 3);

        const reused = await request(`/en/w/${publicId}`, {
            headers: { Cookie: 'theme=dark', 'If-None-Match': etagOf(dark) }
        });
        const crossTheme = await request(`/en/w/${publicId}`, {
            headers: { 'If-None-Match': etagOf(dark) }
        });

        assert.equal(reused.status, 304);
        assert.equal(crossTheme.status, 200);
        assert.match(darkHtml, /<nav class="theme-switch" aria-label="Theme">/);
        assert.match(
            darkHtml,
            /<span aria-current="true" aria-label="Dark theme"/
        );
        assert.match(
            darkHtml,
            new RegExp(
                `href="/theme\\?set=system&amp;back=%2Fen%2Fw%2F${publicId}" rel="nofollow"`
            )
        );
    });

    it('sets or clears the theme cookie and sends the visitor back', async () => {
        const dark = await request('/theme?set=dark&back=%2Fpl%2Fw%2Fabc');

        assert.equal(dark.status, 303);
        assert.equal(dark.headers.get('Location'), '/pl/w/abc');
        assert.equal(
            dark.headers.get('Set-Cookie'),
            'theme=dark; Max-Age=31536000; Path=/; SameSite=Lax; Secure'
        );
        assert.equal(dark.headers.get('Cache-Control'), 'private, no-store');

        const system = await request('/theme?set=system&back=%2Fen');

        assert.equal(system.headers.get('Location'), '/en');
        assert.equal(
            system.headers.get('Set-Cookie'),
            'theme=; Max-Age=0; Path=/; SameSite=Lax; Secure'
        );

        const unknown = await request('/theme?set=neon&back=%2Fua');

        assert.match(
            unknown.headers.get('Set-Cookie') ?? '',
            /^theme=; Max-Age=0/
        );
    });

    it('never redirects the theme switch off-site', async () => {
        for (const back of [
            'https://evil.example/',
            '//evil.example/x',
            '/\\evil.example',
            'javascript:alert(1)',
            'ua',
            '',
            '/ua\n/x'
        ]) {
            const response = await request(
                `/theme?set=light&back=${encodeURIComponent(back)}`
            );

            assert.equal(response.headers.get('Location'), '/', back);
        }

        const missing = await request('/theme?set=light');

        assert.equal(missing.headers.get('Location'), '/');

        const kept = await request(
            `/theme?set=light&back=${encodeURIComponent('/ua/w/abc?x=1')}`
        );

        assert.equal(kept.headers.get('Location'), '/ua/w/abc?x=1');
    });

    it('renders error pages in the chosen theme with a switcher back to the same path', async () => {
        const response = await request('/en/w/unknownid0000000000000000', {
            headers: { Cookie: 'theme=dark' }
        });
        const html = await response.text();

        assert.equal(response.status, 404);
        assert.match(html, /data-theme="wishlist-dark"/);
        assert.match(html, /back=%2Fen%2Fw%2Funknownid0000000000000000/);
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
            'User-agent: *\nAllow: /\nDisallow: /__share-cache/\nDisallow: /app\nDisallow: /api/\nDisallow: /img/\nDisallow: /theme\nDisallow: /currency\n\nSitemap: https://wishlist.chernenko.dev/sitemap.xml\n'
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
            await request(`${CANONICAL_ORIGIN}/ua/w/${publicId}`)
        ).text();

        assert.match(
            production,
            /<meta name="robots" content="index, follow"\/>/
        );

        cache = new FakeCache();

        const preview = await (
            await request(
                `/ua/w/${publicId}`,
                {},
                buildEnv({ BOT_ENVIRONMENT: 'preview' })
            )
        ).text();

        assert.match(preview, /<meta name="robots" content="noindex"\/>/);

        await run(repositories.wishes.softRemoveAll(owner.id, nextNow()));

        const empty = await request(`/ua/w/${publicId}`);
        const emptyBody = await empty.text();

        assert.equal(empty.status, 200);
        assert.match(emptyBody, /<meta name="robots" content="noindex"\/>/);
        assert.match(emptyBody, /Тут поки що порожньо/);
    });

    it('keeps production pages noindex outside the canonical host', async () => {
        const { publicId } = await seedShare();

        const workersDev = await request(
            `${WORKERS_DEV_ORIGIN}/ua/w/${publicId}`
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
                `<link rel="canonical" href="${WORKERS_DEV_ORIGIN}/ua/w/${publicId}"`
            )
        );

        const robots = await request(`${WORKERS_DEV_ORIGIN}/robots.txt`);

        assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');

        const canonical = await (
            await request(`${CANONICAL_ORIGIN}/ua/w/${publicId}`)
        ).text();

        assert.match(
            canonical,
            /<meta name="robots" content="index, follow"\/>/
        );
    });

    it('shows a truncation notice and at most 100 wishes for huge lists', async () => {
        const { owner, publicId } = await seedShare();

        await seedGeneratedWishes(harness, owner.id, 120);

        const body = await (await request(`/ua/w/${publicId}`)).text();

        assert.equal(body.match(/<article /g)?.length, 100);
        assert.match(body, /Показано перші 100 бажань/);
    });

    it('answers HEAD like GET without a body', async () => {
        const { publicId } = await seedShare();
        const get = await request(`/ua/w/${publicId}`);
        const head = await request(`/ua/w/${publicId}`, { method: 'HEAD' });

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
            request(`/ua/w/${publicId}`),
            request(`/w/${publicId}`),
            request(`/ua/w/${'0'.repeat(26)}`),
            request(`/ua/w/${publicId.toUpperCase()}`)
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
        const response = await app.request(`/ua/w/${publicId}`, {}, buildEnv());

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
        const response = await app.request(`/ua/w/${publicId}`, {}, buildEnv());

        assert.equal(response.status, 200);
    });

    it('still renders when the cache lookup fails and reports a bypass', async () => {
        const { publicId } = await seedShare();
        const stored: string[] = [];
        const failingCache: CacheLike = {
            match: async () => {
                throw new Error('cache unavailable');
            },
            put: async key => {
                stored.push(key);
            }
        };
        const app = createApp({}, {}, { cache: failingCache });
        const response = await app.request(`/ua/w/${publicId}`, {}, buildEnv());

        assert.equal(response.status, 200);
        assert.equal(
            response.headers.get('Server-Timing'),
            'share-cache;desc=bypass'
        );
        assert.match(await response.text(), /Coffee/);
    });

    it('sends X-Robots-Tag noindex on every non-indexable response and omits it on indexable pages', async () => {
        const { owner, publicId } = await seedShare();
        const previewEnv = buildEnv({ BOT_ENVIRONMENT: 'preview' });

        const indexable = await request(`${CANONICAL_ORIGIN}/ua/w/${publicId}`);

        assert.equal(indexable.status, 200);
        assert.equal(indexable.headers.get('X-Robots-Tag'), null);

        const notModified = await request(
            `${CANONICAL_ORIGIN}/ua/w/${publicId}`,
            {
                headers: { 'If-None-Match': etagOf(indexable) }
            }
        );

        assert.equal(notModified.status, 304);
        assert.equal(notModified.headers.get('X-Robots-Tag'), null);

        const nonIndexable = [
            await request(`${WORKERS_DEV_ORIGIN}/ua/w/${publicId}`),
            await request(`/ua/w/${publicId}`, {}, previewEnv),
            await request(`/w/${publicId}`, {}, previewEnv),
            await request(`/ua/w/${publicId.toUpperCase()}`, {}, previewEnv)
        ];

        for (const response of nonIndexable) {
            assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
        }

        const previewPage = nonIndexable[1];

        assert.ok(previewPage);

        const previewNotModified = await request(
            `/ua/w/${publicId}`,
            { headers: { 'If-None-Match': etagOf(previewPage) } },
            previewEnv
        );

        assert.equal(previewNotModified.status, 304);
        assert.equal(previewNotModified.headers.get('X-Robots-Tag'), 'noindex');

        await run(repositories.wishes.softRemoveAll(owner.id, nextNow()));

        const emptyOnCanonical = await request(
            `${CANONICAL_ORIGIN}/ua/w/${publicId}`
        );

        assert.equal(emptyOnCanonical.status, 200);
        assert.equal(emptyOnCanonical.headers.get('X-Robots-Tag'), 'noindex');
    });

    it('serves the status json on /status and keeps unknown routes not found', async () => {
        const status = await request('/status');

        assert.equal(status.status, 200);
        assert.deepEqual(await status.json(), {
            service: 'wishlist',
            runtime: 'cloudflare-workers',
            status: 'runtime-ready'
        });
        assert.equal((await request('/w/')).status, 404);
        assert.equal((await request('/de/w/' + '0'.repeat(26))).status, 404);
        assert.equal((await request('/de')).status, 404);
        assert.equal((await request('/uax')).status, 404);
        assert.equal((await request('/ua/w/')).status, 404);
        assert.equal((await request(`/enx/w/${'0'.repeat(26)}`)).status, 404);
    });

    it('permanently redirects legacy /uk urls to /ua', async () => {
        const { publicId } = await seedShare();

        for (const [path, location] of [
            [`/uk/w/${publicId}`, `/ua/w/${publicId}`],
            [`/uk/w/${publicId.toUpperCase()}`, `/ua/w/${publicId}`],
            ['/uk/w/not-an-id', '/ua/w/not-an-id'],
            ['/uk', '/ua'],
            ['/uk/', '/ua']
        ] as const) {
            const response = await request(path);

            assert.equal(response.status, 301, path);
            assert.equal(response.headers.get('Location'), location, path);
            assert.equal(
                response.headers.get('Cache-Control'),
                'public, max-age=86400',
                path
            );
        }

        const followed = await request(`/ua/w/${publicId}`);
        const body = await followed.text();

        assert.equal(followed.status, 200);
        assert.equal(followed.headers.get('Content-Language'), 'uk');
        assert.match(body, /<html lang="uk">/);
        assert.match(
            body,
            new RegExp(
                `<link rel="alternate" hreflang="uk" href="http://localhost/ua/w/${publicId}"`
            )
        );
    });

    it('redirects the root to a home page by Accept-Language', async () => {
        for (const [header, location] of [
            ['pl-PL,pl;q=0.9,en;q=0.5', '/pl'],
            ['en-GB,en;q=0.9', '/en'],
            ['uk-UA,uk;q=0.9', '/ua'],
            ['de-DE,fr;q=0.8', '/ua'],
            [undefined, '/ua']
        ] as const) {
            const response = await request(
                '/',
                header === undefined
                    ? {}
                    : { headers: { 'Accept-Language': header } }
            );

            assert.equal(response.status, 302, header);
            assert.equal(response.headers.get('Location'), location, header);
            assert.equal(response.headers.get('Vary'), 'Accept-Language');
            assert.equal(
                response.headers.get('Cache-Control'),
                'private, no-store'
            );
        }
    });

    it('serves a localized home page with seo metadata and no database reads', async () => {
        const response = await request(`${CANONICAL_ORIGIN}/ua`);
        const body = await response.text();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('Content-Language'), 'uk');
        assert.equal(response.headers.get('Cache-Control'), 'no-cache');
        assert.equal(response.headers.get('X-Robots-Tag'), null);
        assert.equal(
            response.headers.get('Content-Security-Policy'),
            EXPECTED_CSP
        );
        assert.match(body, /<html lang="uk">/);
        assert.match(body, /<meta name="robots" content="index, follow"\/>/);
        assert.match(
            body,
            /<link rel="canonical" href="https:\/\/wishlist\.chernenko\.dev\/ua"\/>/
        );

        for (const [language, segment] of [
            ['uk', 'ua'],
            ['en', 'en'],
            ['pl', 'pl']
        ]) {
            assert.match(
                body,
                new RegExp(
                    `<link rel="alternate" hreflang="${language}" href="${CANONICAL_ORIGIN}/${segment}"/>`
                )
            );
        }

        assert.match(
            body,
            new RegExp(
                `<link rel="alternate" hreflang="x-default" href="${CANONICAL_ORIGIN}/"/>`
            )
        );
        assert.match(
            body,
            new RegExp(
                `<meta property="og:url" content="${CANONICAL_ORIGIN}/ua"/>`
            )
        );
        assert.match(
            body,
            /<h1 class="hero-title"><span class="hero-name">Лист бажань<\/span><\/h1>/
        );
        assert.match(body, /Відкрити @wishlist_ua_bot/);
        assert.match(body, /<ol class="steps">/);
        assert.match(body, /href="https:\/\/x\.com\/serhiichernenko"/);
        assert.match(body, /href="https:\/\/t\.me\/ixPrincessBot"/);
        assert.match(body, /href="https:\/\/send\.monobank\.ua\/jar\//);
        assert.match(body, /<a href="\/en" hreflang="en" lang="en"/);
        assert.doesNotMatch(body, /href="\/uk/);

        const scripts = Array.from(
            body.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)
        );

        assert.equal(scripts.length, 1);
        assert.equal(scripts[0]?.[1], ' type="application/ld+json"');

        const structuredData = JSON.parse(scripts[0]?.[2] ?? '') as Record<
            string,
            unknown
        >;

        assert.equal(structuredData['@type'], 'SoftwareApplication');
        assert.equal(structuredData.operatingSystem, 'Telegram');
        assert.equal(structuredData.url, `${CANONICAL_ORIGIN}/ua`);
        assert.equal(structuredData.inLanguage, 'uk');
        assert.deepEqual(structuredData.offers, {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'UAH'
        });
        assert.equal(typeof structuredData.applicationCategory, 'string');

        const polish = await (await request('/pl')).text();

        assert.match(polish, /<html lang="pl">/);
        assert.match(polish, /<title>Lista życzeń/);
        assert.match(polish, /Otwórz @wishlist_ua_bot/);

        const english = await (await request('/en')).text();

        assert.match(english, /<title>Wishlist/);
        assert.match(english, /How it works/);
    });

    it('keeps home pages noindex outside production on the canonical host', async () => {
        for (const [path, env] of [
            [`${WORKERS_DEV_ORIGIN}/en`, buildEnv()],
            [
                `${CANONICAL_ORIGIN}/en`,
                buildEnv({ BOT_ENVIRONMENT: 'preview' })
            ],
            ['/en', buildEnv()]
        ] as const) {
            const response = await request(path, {}, env);

            assert.equal(response.status, 200, path);
            assert.equal(response.headers.get('X-Robots-Tag'), 'noindex', path);
            assert.match(
                await response.text(),
                /<meta name="robots" content="noindex"\/>/,
                path
            );
        }
    });

    it('caches home pages by deploy and language and answers 304 on a matching etag', async () => {
        const first = await request('/en');
        const etag = etagOf(first);

        assert.equal(
            first.headers.get('Server-Timing'),
            'share-cache;desc=miss'
        );
        assert.equal(cache.putKeys.length, 1);
        assert.match(
            cache.putKeys[0] ?? '',
            /^http:\/\/localhost\/__share-cache\/home\/en\/[0-9a-f]{32}$/
        );

        const second = await request('/en');

        assert.equal(
            second.headers.get('Server-Timing'),
            'share-cache;desc=hit'
        );
        assert.equal(await second.text(), await first.text());
        assert.equal(etagOf(second), etag);

        const revalidated = await request('/en', {
            headers: { 'If-None-Match': etag }
        });

        assert.equal(revalidated.status, 304);
        assert.notEqual(etagOf(await request('/pl')), etag);

        const otherDeploy = await request(
            '/en',
            {},
            buildEnv({ CF_VERSION_METADATA: { id: 'next-deploy' } } as never)
        );

        assert.notEqual(etagOf(otherDeploy), etag);
    });

    it('redirects home pages with a trailing slash to the canonical form', async () => {
        for (const [path, location] of [
            ['/ua/', '/ua'],
            ['/en/', '/en'],
            ['/pl/', '/pl']
        ] as const) {
            const response = await request(path);

            assert.equal(response.status, 301, path);
            assert.equal(response.headers.get('Location'), location, path);
        }
    });

    it('serves a sitemap with only the home pages on the production host', async () => {
        const response = await request(`${CANONICAL_ORIGIN}/sitemap.xml`);
        const body = await response.text();

        assert.equal(response.status, 200);
        assert.match(
            response.headers.get('Content-Type') ?? '',
            /^application\/xml/
        );
        assert.deepEqual(
            Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/g), match => {
                return match[1];
            }),
            [
                `${CANONICAL_ORIGIN}/ua`,
                `${CANONICAL_ORIGIN}/en`,
                `${CANONICAL_ORIGIN}/pl`
            ]
        );
        assert.doesNotMatch(body, /\/w\//);
        assert.match(
            body,
            new RegExp(
                `<xhtml:link rel="alternate" hreflang="uk" href="${CANONICAL_ORIGIN}/ua"/>`
            )
        );
        assert.match(
            body,
            new RegExp(
                `<xhtml:link rel="alternate" hreflang="x-default" href="${CANONICAL_ORIGIN}/"/>`
            )
        );

        assert.equal(
            (await request(`${WORKERS_DEV_ORIGIN}/sitemap.xml`)).status,
            404
        );
        assert.equal(
            (
                await request(
                    `${CANONICAL_ORIGIN}/sitemap.xml`,
                    {},
                    buildEnv({ BOT_ENVIRONMENT: 'preview' })
                )
            ).status,
            404
        );
    });

    it('renders the full page content for a populated list', async () => {
        const { publicId } = await seedShare();
        const response = await request(`/en/w/${publicId}`);
        const body = await response.text();

        assert.match(
            body,
            /<h1 [^>]*><span class="hero-lead">Wish list from<\/span> <span class="hero-name">Alice<\/span><\/h1>/
        );
        assert.match(
            body,
            /<link rel="stylesheet" href="\/styles\/share\.css\?v=[^"]+"\/>/
        );
        assert.doesNotMatch(body, /<style/i);
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

    it('renders lazy cover photos with share image URLs and an open in Telegram link', async () => {
        const owner = await createOwner({ language: 'en' });
        const wish = await createWish(owner.id, 'Camera');
        const publicId = await publish(owner.id);

        for (const fileId of ['file-one', 'file-two', 'file-three']) {
            await run(
                repositories.wishes.appendImage(
                    wish.id,
                    owner.id,
                    fileId,
                    nextNow()
                )
            );
        }

        const response = await request(`/en/w/${publicId}`);
        const body = await response.text();
        const hash = (await sha256Hex(getRuntimeCrypto(), 'file-one')).slice(
            0,
            16
        );

        assert.equal(response.status, 200);
        assert.match(
            body,
            new RegExp(
                `<img src="/img/s/${publicId}/${wish.id}/0/${hash}" alt="Photo 1 of 3" loading="lazy"/>`
            )
        );
        assert.doesNotMatch(body, /alt="[^"]*Camera/);
        assert.doesNotMatch(body, /file-one|file-two|file-three/);
        assert.match(
            body,
            new RegExp(
                `href="https://t\\.me/wishlist_ua_bot\\?startapp=s_${publicId}"[^>]*>Open in Telegram and reserve a wish</a>`
            )
        );
    });

    it('keeps twenty wishes with nine photos each below 60 KB', async () => {
        const owner = await createOwner({ language: 'uk' });
        const publicId = await publish(owner.id);

        for (let index = 0; index < 20; index += 1) {
            const wish = await createWish(owner.id, `Wish ${index}`, {
                description: 'о'.repeat(300),
                link: `https://shop.test/items/${index}`,
                price: 1000 + index
            });

            for (let photo = 0; photo < 9; photo += 1) {
                await run(
                    repositories.wishes.appendImage(
                        wish.id,
                        owner.id,
                        `file-${index}-${photo}`,
                        nextNow()
                    )
                );
            }
        }

        const body = await (await request(`/ua/w/${publicId}`)).text();

        assert.equal(body.match(/<img /g)?.length, 20);
        assert.ok(
            Buffer.byteLength(body) < 60_000,
            `${Buffer.byteLength(body)}`
        );
    });

    it('leaves the open in Telegram link out of an empty list', async () => {
        const owner = await createOwner({ language: 'en' });
        const publicId = await publish(owner.id);
        const body = await (await request(`/en/w/${publicId}`)).text();

        assert.doesNotMatch(body, /startapp=/);
    });
});
