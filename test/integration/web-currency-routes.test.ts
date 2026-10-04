import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { CacheLike } from '../../src/web/routes';
import { createD1Harness, type D1Harness } from './d1-harness';

const BASE_TIME = Date.parse('2026-10-01T12:00:00.000Z');
const OWNER_TELEGRAM_ID = 9_101;

class FakeCache implements CacheLike {
    readonly entries = new Map<string, string>();

    async match(key: string) {
        const body = this.entries.get(key);

        return body === undefined ? undefined : new Response(body);
    }

    async put(key: string, response: Response) {
        this.entries.set(key, await response.text());
    }
}

describe('share page currency switch', () => {
    let harness: D1Harness;
    let cache: FakeCache;
    let tick = 0;

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };
    const nextNow = () => {
        tick += 1;

        return new Date(BASE_TIME + tick * 1_000);
    };
    const request = (path: string, init: RequestInit = {}) => {
        const env = {
            ...harness.env,
            BOT_ENVIRONMENT: 'production'
        } as unknown as WorkerBindings;

        return createApp({}, {}, { cache, now: () => new Date() }).request(
            path,
            init,
            env
        );
    };
    const seedShare = async () => {
        const owner = await run(
            harness.repositories.users.create({
                telegramId: OWNER_TELEGRAM_ID,
                username: 'owner_user',
                currency: 'UAH',
                createdAt: nextNow()
            })
        );

        assert.ok(owner);

        const wish = await run(
            harness.repositories.wishes.create(
                owner.id,
                'Coffee',
                'UAH',
                nextNow()
            )
        );

        assert.ok(wish);
        await run(
            harness.repositories.wishes.updateFields(
                wish.id,
                owner.id,
                { price: 2500 },
                nextNow()
            )
        );

        const share = await run(
            harness.repositories.shares.publish(owner.id, 'Alice', nextNow())
        );

        return share.publicId;
    };
    const etagOf = (response: Response) => {
        const etag = response.headers.get('ETag');

        assert.ok(etag);

        return etag;
    };
    const page = (publicId: string, language: string, cookie?: string) => {
        return request(
            `/${language}/w/${publicId}`,
            cookie === undefined ? {} : { headers: { Cookie: cookie } }
        );
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        await harness.clearApplicationTables();
        cache = new FakeCache();
    });

    it('follows the page language until the visitor picks a currency', async () => {
        const publicId = await seedShare();
        const english = await (await page(publicId, 'en')).text();
        const ukrainian = await (await page(publicId, 'ua')).text();
        const polish = await (await page(publicId, 'pl')).text();

        assert.match(english, /€/);
        assert.doesNotMatch(english, /currency=/);
        assert.match(ukrainian, /₴/);
        assert.doesNotMatch(ukrainian, /≈/);
        assert.match(polish, /zł/);
    });

    it('shows prices in the cookie currency whatever the page language', async () => {
        const publicId = await seedShare();
        const usd = await (await page(publicId, 'en', 'currency=USD')).text();
        const pln = await (await page(publicId, 'ua', 'currency=PLN')).text();

        assert.match(usd, /≈\s*\$/);
        assert.match(
            usd,
            /<span aria-current="true" aria-label="\$ US dollar"/
        );
        assert.match(pln, /≈\s*\d+\s*zł/);
        assert.match(pln, /<span aria-current="true" aria-label="zł Злотий"/);
    });

    it('keeps a separate page copy and ETag per currency choice', async () => {
        const publicId = await seedShare();
        const auto = await page(publicId, 'en');
        const usd = await page(publicId, 'en', 'currency=USD');
        const eur = await page(publicId, 'en', 'currency=EUR');
        const bogus = await page(publicId, 'en', 'currency=GBP');
        const themedUsd = await page(
            publicId,
            'en',
            'theme=dark; currency=USD'
        );

        assert.equal(etagOf(bogus), etagOf(auto));
        assert.equal(new Set([auto, usd, eur, themedUsd].map(etagOf)).size, 4);
        assert.equal(auto.headers.get('Vary'), 'Cookie');

        const revalidated = await request(`/en/w/${publicId}`, {
            headers: { Cookie: 'currency=USD', 'If-None-Match': etagOf(usd) }
        });
        const crossCurrency = await request(`/en/w/${publicId}`, {
            headers: { Cookie: 'currency=EUR', 'If-None-Match': etagOf(usd) }
        });

        assert.equal(revalidated.status, 304);
        assert.equal(crossCurrency.status, 200);
        assert.equal(cache.entries.size, 4);
    });

    it('sets or clears the currency cookie and sends the visitor back', async () => {
        const chosen = await request('/currency?set=USD&back=%2Fpl%2Fw%2Fabc');

        assert.equal(chosen.status, 303);
        assert.equal(chosen.headers.get('Location'), '/pl/w/abc');
        assert.equal(
            chosen.headers.get('Set-Cookie'),
            'currency=USD; Max-Age=31536000; Path=/; SameSite=Lax; Secure'
        );
        assert.equal(chosen.headers.get('Cache-Control'), 'private, no-store');
        assert.equal(chosen.headers.get('X-Robots-Tag'), 'noindex');

        for (const set of ['auto', 'usd', 'GBP', '']) {
            const cleared = await request(`/currency?set=${set}&back=%2Fen`);

            assert.equal(
                cleared.headers.get('Set-Cookie'),
                'currency=; Max-Age=0; Path=/; SameSite=Lax; Secure',
                set
            );
        }
    });

    it('never redirects the currency switch off-site', async () => {
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
                `/currency?set=EUR&back=${encodeURIComponent(back)}`
            );

            assert.equal(response.status, 303);
            assert.equal(response.headers.get('Location'), '/', back);
        }

        const missing = await request('/currency?set=EUR');

        assert.equal(missing.headers.get('Location'), '/');

        const kept = await request(
            `/currency?set=EUR&back=${encodeURIComponent('/ua/w/abc?x=1')}`
        );

        assert.equal(kept.headers.get('Location'), '/ua/w/abc?x=1');
    });

    it('stays out of search results and renders switch links without scripts', async () => {
        const publicId = await seedShare();
        const html = await (await page(publicId, 'en')).text();

        assert.match(
            html,
            new RegExp(
                `href="/currency\\?set=UAH&amp;back=%2Fen%2Fw%2F${publicId}" rel="nofollow"`
            )
        );
        assert.doesNotMatch(html, /<script/);
    });
});
