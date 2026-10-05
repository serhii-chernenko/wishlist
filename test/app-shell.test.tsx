import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { APP_SHELL_CSP } from '../src/web/app-shell/csp';
import { registerAppShellRoutes } from '../src/web/app-shell/route';
import type { WorkerApp } from '../src/worker/app';
import type { WorkerBindings } from '../src/worker/env';

const EXACT_CSP =
    "default-src 'none'; script-src 'self' https://telegram.org; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors https://web.telegram.org";
const BOT_URL = 'https://t.me/wishlist_ua_bot';
const TELEGRAM_SDK = 'https://telegram.org/js/telegram-web-app.js';

const buildEnv = (
    overrides: Partial<Record<keyof WorkerBindings, unknown>> = {}
) => {
    return {
        BOT_ENVIRONMENT: 'preview',
        WISHLIST_TG_URL: BOT_URL,
        CF_VERSION_METADATA: { id: 'deploy 1/a' },
        ...overrides
    } as unknown as WorkerBindings;
};

const request = (
    path: string,
    env: WorkerBindings = buildEnv(),
    headers: Record<string, string> = {}
) => {
    const app: WorkerApp = new Hono<{ Bindings: WorkerBindings }>();

    registerAppShellRoutes(app);

    return app.request(path, { headers }, env);
};

test('the CSP is exactly the documented policy', async () => {
    const response = await request('/app');

    assert.equal(APP_SHELL_CSP, EXACT_CSP);
    assert.equal(response.headers.get('Content-Security-Policy'), EXACT_CSP);
});

test('the shell is served with the documented headers', async () => {
    const response = await request('/app');

    assert.equal(response.status, 200);
    assert.equal(
        response.headers.get('Content-Type'),
        'text/html; charset=utf-8'
    );
    assert.equal(response.headers.get('Cache-Control'), 'no-cache');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(
        response.headers.get('Permissions-Policy'),
        'camera=(), geolocation=(), microphone=()'
    );
    assert.match(response.headers.get('ETag') ?? '', /^"[0-9a-f]{32}"$/);
});

test('a matching If-None-Match gets 304 without a body', async () => {
    const first = await request('/app');
    const etag = first.headers.get('ETag') ?? '';
    const second = await request('/app', buildEnv(), { 'If-None-Match': etag });

    assert.equal(second.status, 304);
    assert.equal(await second.text(), '');
    assert.equal(second.headers.get('ETag'), etag);
    assert.equal(second.headers.get('Content-Security-Policy'), EXACT_CSP);
});

test('the ETag follows the deploy id', async () => {
    const base = (await request('/app')).headers.get('ETag');
    const nextDeploy = (
        await request(
            '/app',
            buildEnv({ CF_VERSION_METADATA: { id: 'deploy-2' } })
        )
    ).headers.get('ETag');
    const again = (await request('/app')).headers.get('ETag');

    assert.equal(base, again);
    assert.notEqual(base, nextDeploy);
});

test('the shell links versioned assets, the SDK first and no inline code', async () => {
    const html = await (await request('/app')).text();
    const sdkIndex = html.indexOf(`<script src="${TELEGRAM_SDK}"`);
    const bundleIndex = html.indexOf('/app/app.js?v=deploy%201%2Fa');

    assert.ok(sdkIndex > -1);
    assert.ok(bundleIndex > sdkIndex);
    assert.match(
        html,
        /<script type="module" src="\/app\/app\.js\?v=deploy%201%2Fa">/
    );
    assert.match(
        html,
        /<link rel="stylesheet" href="\/app\/app\.css\?v=deploy%201%2Fa"/
    );

    const scripts = Array.from(html.matchAll(/<script\b[^>]*>/g), match => {
        return match[0];
    });

    assert.equal(scripts.length, 2);

    for (const script of scripts) {
        assert.match(script, /\bsrc="/);
    }

    assert.doesNotMatch(html, /<script[^>]*>[^<]+<\/script>/);
    assert.doesNotMatch(html, /\sstyle=/);
    assert.doesNotMatch(html, /<style/);
    assert.doesNotMatch(html, /\son[a-z]+=/);
});

test('the shell carries config in data attributes and the document basics', async () => {
    const html = await (await request('/app')).text();

    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<html lang="uk" data-theme="wishlist">/);
    assert.match(
        html,
        /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/
    );
    assert.match(html, /<meta name="robots" content="noindex"/);
    assert.match(
        html,
        /<div id="root" data-bot-url="https:\/\/t\.me\/wishlist_ua_bot" data-env="preview" data-version="deploy 1\/a">/
    );
    assert.match(
        html,
        /<link rel="preload" href="\/fonts\/unbounded-cyrillic-wght-normal\.woff2\?v=5\.3\.0" as="font" type="font\/woff2" crossorigin="anonymous"/
    );
});

test('the root holds text-free tag skeletons and a trilingual noscript', async () => {
    const html = await (await request('/app')).text();
    const root = html.slice(html.indexOf('<div id="root"'));
    const skeletons = root.match(/class="boot-tag[ "]/g) ?? [];

    assert.equal(skeletons.length, 4);

    const skeleton =
        /<div class="boot"[^>]*>(.*?)<\/div><\/div><noscript>/s.exec(root)?.[1];

    assert.ok(skeleton !== undefined);
    assert.equal(skeleton.replace(/<[^>]*>/g, ''), '');

    const noscript = /<noscript>(.*?)<\/noscript>/s.exec(html)?.[1] ?? '';

    assert.match(noscript, /<p lang="uk">/);
    assert.match(noscript, /<p lang="en">/);
    assert.match(noscript, /<p lang="pl">/);
});

test('the shell escapes configuration values', async () => {
    const html = await (
        await request(
            '/app',
            buildEnv({
                WISHLIST_TG_URL: 'https://t.me/x"><script>alert(1)</script>'
            })
        )
    ).text();

    assert.doesNotMatch(html, /<script>alert/);
});

test('/app/ redirects to /app and keeps the query', async () => {
    const response = await request('/app/?start=w_12&x=1');

    assert.equal(response.status, 301);
    assert.equal(response.headers.get('Location'), '/app?start=w_12&x=1');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
    assert.match(
        response.headers.get('Content-Security-Policy') ?? '',
        /frame-ancestors 'none'/
    );
    assert.equal((await request('/app/')).headers.get('Location'), '/app');
});
