import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import type { RateLimiterLike } from '../../src/api/rate-limit';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    APP_INIT_DATA_MAX_BYTES,
    type ApiErrorBody,
    type BootstrapDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import {
    createInitDataFields,
    createNodeApiCrypto,
    createSignedInitData,
    signInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { countRows, createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const ADMIN_TELEGRAM_ID = 777_000_111;
const STRANGER_TELEGRAM_ID = 555_000_222;
const ORIGIN = 'http://localhost';
const API_SECURITY_HEADERS = {
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
};

const ADMIN: InitDataUserFixture = {
    id: ADMIN_TELEGRAM_ID,
    first_name: 'Admin',
    username: 'admin_user',
    language_code: 'en'
};

describe('Mini App API auth and bootstrap', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const buildEnv = (
        overrides: Record<string, unknown> = {}
    ): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            MINI_APP_ENABLED: 'true',
            ADMIN_ID: String(ADMIN_TELEGRAM_ID),
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            ...overrides
        } as unknown as WorkerBindings;
    };

    const request = (
        path: string,
        init: { initData?: string; headers?: Record<string, string> } = {},
        env: WorkerBindings = buildEnv()
    ) => {
        const app = createApp(
            {},
            {},
            {},
            {
                now: () => NOW,
                crypto: createNodeApiCrypto(),
                emitTelemetry: (_env, _context, fields) => {
                    events.push(fields);
                }
            }
        );
        const headers = new Headers(init.headers);

        if (init.initData !== undefined) {
            headers.set('Authorization', `tma ${init.initData}`);
        }

        return app.request(`/api/app${path}`, { headers }, env);
    };

    const signedFor = (
        user: InitDataUserFixture = ADMIN,
        authDate = NOW_SECONDS
    ) => {
        return createSignedInitData({ user, authDate });
    };

    const readError = async (response: Response) => {
        return ((await response.json()) as ApiErrorBody).error;
    };

    const eventsNamed = (name: string) => {
        return events.filter(event => {
            return event.event === name;
        });
    };

    const createUser = async (
        input: Partial<
            Parameters<D1Harness['repositories']['users']['create']>[0]
        > = {}
    ) => {
        const created = await run(
            harness.repositories.users.create({
                telegramId: ADMIN_TELEGRAM_ID,
                username: 'admin_user',
                usernameSearchable: true,
                createdAt: NOW,
                ...input
            })
        );

        assert.ok(created);

        return created;
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        events = [];
        await harness.clearApplicationTables();
    });

    it('rejects every unauthenticated variant with 401 and its reason', async () => {
        const fields = createInitDataFields({
            user: ADMIN,
            authDate: NOW_SECONDS
        });
        const cases: [string, Record<string, string>, string][] = [
            ['missing', {}, 'missing'],
            [
                'wrong scheme',
                { Authorization: `Bearer ${signedFor()}` },
                'missing'
            ],
            ['empty', { Authorization: 'tma ' }, 'missing'],
            [
                'oversized',
                {
                    Authorization: `tma ${signedFor()}&pad=${'x'.repeat(APP_INIT_DATA_MAX_BYTES)}`
                },
                'malformed'
            ],
            [
                'duplicate',
                {
                    Authorization: `tma ${signedFor()}&auth_date=${NOW_SECONDS}`
                },
                'malformed'
            ],
            [
                'bad hash',
                {
                    Authorization: `tma ${signInitData(fields, { botToken: '1:OTHER' })}`
                },
                'badHash'
            ],
            [
                'stale',
                {
                    Authorization: `tma ${signedFor(ADMIN, NOW_SECONDS - 24 * 3600 - 1)}`
                },
                'stale'
            ],
            [
                'future',
                {
                    Authorization: `tma ${signedFor(ADMIN, NOW_SECONDS + 301)}`
                },
                'future'
            ]
        ];

        for (const [label, headers, reason] of cases) {
            const response = await request('/bootstrap', { headers });

            assert.equal(response.status, 401, label);
            assert.deepEqual(
                await readError(response),
                { code: 'unauthorized', reason },
                label
            );

            for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
                assert.equal(response.headers.get(name), value, label);
            }
        }

        assert.deepEqual(
            eventsNamed('app_auth_rejected').map(event => event.reason),
            cases.map(([, , reason]) => reason)
        );
        assert.equal(await countRows(harness, 'users'), 0);
    });

    it('lets only the admin through in preview and local, with no D1 writes', async () => {
        for (const environment of ['preview', 'local']) {
            const env = buildEnv({ BOT_ENVIRONMENT: environment });
            const denied = await request(
                '/bootstrap',
                {
                    initData: signedFor({
                        id: STRANGER_TELEGRAM_ID,
                        username: 'stranger'
                    })
                },
                env
            );

            assert.equal(denied.status, 403, environment);
            assert.deepEqual(await readError(denied), {
                code: 'previewAccessDenied'
            });

            const allowed = await request(
                '/bootstrap',
                { initData: signedFor() },
                env
            );

            assert.equal(allowed.status, 200, environment);
        }

        assert.equal(await countRows(harness, 'users'), 0);
        assert.equal(await countRows(harness, 'sessions'), 0);
        assert.equal(
            eventsNamed('app_auth_rejected').every(event => {
                return event.reason === 'previewAccessDenied';
            }),
            true
        );

        const withoutAdmin = await request(
            '/bootstrap',
            { initData: signedFor() },
            buildEnv({ BOT_ENVIRONMENT: 'preview', ADMIN_ID: '' })
        );

        assert.equal(withoutAdmin.status, 403);
    });

    it('rejects a foreign Origin before reading initData', async () => {
        const foreign = await request('/bootstrap', {
            initData: signedFor(),
            headers: { Origin: 'https://evil.example' }
        });

        assert.equal(foreign.status, 403);
        assert.deepEqual(await readError(foreign), { code: 'forbidden' });
        assert.equal(eventsNamed('app_auth_rejected')[0]?.reason, 'origin');

        const sameOrigin = await request('/bootstrap', {
            initData: signedFor(),
            headers: { Origin: ORIGIN }
        });

        assert.equal(sameOrigin.status, 200);
    });

    it('answers 429 with Retry-After when the route limiter refuses', async () => {
        const keys: string[] = [];
        const refusing: RateLimiterLike = {
            async limit({ key }) {
                keys.push(key);
                return { success: false };
            }
        };
        const response = await request(
            '/bootstrap',
            { initData: signedFor() },
            buildEnv({ APP_API_LIMITER: refusing })
        );

        assert.equal(response.status, 429);
        assert.equal(response.headers.get('Retry-After'), '60');
        assert.deepEqual(await readError(response), {
            code: 'rateLimited',
            retryAfter: 60
        });
        assert.deepEqual(keys, [`tg:${ADMIN_TELEGRAM_ID}`]);
        assert.equal(eventsNamed('app_rate_limited')[0]?.bucket, 'api');
    });

    it('allows the request and reports the gap when the limiter binding is absent', async () => {
        const allowing: RateLimiterLike = {
            async limit() {
                return { success: true };
            }
        };

        for (const binding of [undefined, {}]) {
            events = [];

            const response = await request(
                '/bootstrap',
                { initData: signedFor() },
                buildEnv({ APP_API_LIMITER: binding })
            );

            assert.equal(response.status, 200);
            assert.deepEqual(
                eventsNamed('app_rate_limiter_missing').map(event => {
                    return [event.bucket, event.result];
                }),
                [['api', 'missing']]
            );
        }

        events = [];

        const limited = await request(
            '/bootstrap',
            { initData: signedFor() },
            buildEnv({ APP_API_LIMITER: allowing })
        );

        assert.equal(limited.status, 200);
        assert.equal(eventsNamed('app_rate_limiter_missing').length, 0);
    });

    it('answers 503 disabled for every API path when the kill switch is off', async () => {
        const env = buildEnv({ MINI_APP_ENABLED: 'false' });

        for (const path of ['/bootstrap', '/wishes', '/does-not-exist']) {
            const response = await request(
                path,
                { initData: signedFor() },
                env
            );

            assert.equal(response.status, 503, path);
            assert.deepEqual(await readError(response), { code: 'disabled' });
            assert.equal(response.headers.get('cache-control'), 'no-store');
        }
    });

    it('bootstraps a guest without creating anything', async () => {
        const response = await request('/bootstrap?platform=ios&start=w_5', {
            initData: signedFor()
        });
        const body = (await response.json()) as BootstrapDto;

        assert.equal(response.status, 200);
        assert.deepEqual(body.me, {
            registered: false,
            visibility: null,
            telegramUsername: 'admin_user',
            phoneMasked: null,
            payments: null,
            currency: 'UAH',
            languageChoice: 'auto',
            locale: 'en',
            wishlistFilter: null,
            canShowPublicUsername: false
        });
        assert.equal(body.counts, null);
        assert.equal(body.messages.common.retry, 'Try again');
        assert.equal(body.config.limits.title, 200);
        assert.equal(body.config.limits.pageSize, 20);
        assert.equal(body.config.priceFilters.UAH.length, 5);
        assert.deepEqual(body.config.priceFilters.UAH[0], {
            filter: 0,
            from: null,
            to: 999
        });
        assert.deepEqual(body.config.priceFilters.EUR[0], {
            filter: 0,
            from: null,
            to: 19
        });
        assert.deepEqual(body.config.priceFilters.PLN[4], {
            filter: 4,
            from: 1000,
            to: null
        });
        assert.equal(body.config.rates.perUnit.UAH, 1);
        assert.ok(body.config.rates.perUnit.EUR > 0);
        assert.match(body.config.rates.date, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(body.config.botUrl, harness.env.WISHLIST_TG_URL);
        assert.equal(body.config.supportLinks.length > 0, true);
        assert.equal(body.config.links.github, harness.env.GITHUB_REPO_URL);
        assert.equal(await countRows(harness, 'users'), 0);
        assert.equal(await countRows(harness, 'sessions'), 0);
        assert.deepEqual(
            eventsNamed('app_session_started').map(event => {
                return [
                    event.platform,
                    event.startKind,
                    event.isGuest,
                    event.locale
                ];
            }),
            [['ios', 'wish', true, 'en']]
        );
    });

    it('reports the theme from a closed set and falls back to unknown', async () => {
        const themeOf = async (query: string) => {
            events = [];
            await request(`/bootstrap${query}`, { initData: signedFor() });

            return eventsNamed('app_session_started')[0]?.theme;
        };

        assert.equal(await themeOf('?theme=dark'), 'dark');
        assert.equal(await themeOf('?theme=light'), 'light');
        assert.equal(await themeOf(''), 'unknown');
        assert.equal(await themeOf('?theme=neon'), 'unknown');
    });

    it('stamps last_app_seen_at once per hour for registered users only', async () => {
        await request('/bootstrap', { initData: signedFor() });
        assert.equal(await countRows(harness, 'users'), 0);

        const user = await createUser();

        await request('/bootstrap', { initData: signedFor() });

        const first = await run(harness.repositories.users.findById(user.id));

        assert.equal(first?.lastAppSeenAt?.getTime(), NOW.getTime());
        assert.equal(first?.lastBotSeenAt, null);

        const later = new Date(NOW.getTime() + 30 * 60 * 1000);

        assert.equal(
            await run(harness.repositories.users.markAppSeen(user.id, later)),
            false
        );
        assert.equal(
            (
                await run(harness.repositories.users.findById(user.id))
            )?.lastAppSeenAt?.getTime(),
            NOW.getTime()
        );

        const afterAnHour = new Date(NOW.getTime() + 61 * 60 * 1000);

        assert.equal(
            await run(
                harness.repositories.users.markAppSeen(user.id, afterAnHour)
            ),
            true
        );
        assert.equal(
            (
                await run(harness.repositories.users.findById(user.id))
            )?.lastAppSeenAt?.getTime(),
            afterAnHour.getTime()
        );
    });

    it('does not stamp last_app_seen_at when authentication is rejected', async () => {
        const user = await createUser();

        await request('/bootstrap', {
            initData: signedFor(ADMIN, NOW_SECONDS - 10 * 24 * 3600)
        });

        assert.equal(
            (await run(harness.repositories.users.findById(user.id)))
                ?.lastAppSeenAt,
            null
        );
    });

    it('bootstraps a user, syncs the profile and clears blocked_at', async () => {
        const user = await createUser({
            username: 'old_name',
            phone: '380991112233',
            phoneDigits: '380991112233',
            payments: 'Card 4444',
            blockedAt: new Date(NOW.getTime() - 1000)
        });
        const wish = await run(
            harness.repositories.wishes.create(user.id, 'Bicycle', NOW)
        );

        assert.ok(wish);

        const response = await request('/bootstrap', { initData: signedFor() });
        const body = (await response.json()) as BootstrapDto;
        const stored = await run(harness.repositories.users.findById(user.id));

        assert.equal(response.status, 200);
        assert.equal(stored?.blockedAt, null);
        assert.equal(stored?.username, 'admin_user');
        assert.equal(body.me.registered, true);
        assert.equal(body.me.visibility, 'both');
        assert.equal(body.me.phoneMasked, '+380 •• ••• 22 33');
        assert.equal(body.me.payments, 'Card 4444');
        assert.equal(body.me.canShowPublicUsername, true);
        assert.deepEqual(body.counts, { wishes: 1, gives: 0 });
        assert.equal(eventsNamed('app_session_started')[0]?.isGuest, false);
    });

    it('resolves the locale like the bot, including Auto', async () => {
        const localeOf = async (user: InitDataUserFixture) => {
            const response = await request('/bootstrap', {
                initData: signedFor(user)
            });
            const body = (await response.json()) as BootstrapDto;

            return [
                body.me.locale,
                body.me.languageChoice,
                body.messages.nav.home
            ];
        };

        assert.deepEqual(await localeOf({ ...ADMIN, language_code: 'pl' }), [
            'pl',
            'auto',
            'Start'
        ]);

        await run(
            harness.repositories.sessions.setLanguage(
                ADMIN_TELEGRAM_ID,
                'uk',
                NOW
            )
        );
        assert.deepEqual(await localeOf({ ...ADMIN, language_code: 'pl' }), [
            'uk',
            'uk',
            'Головна'
        ]);

        const user = await createUser({ telegramLanguageCode: 'pl' });
        const { language_code: _languageCode, ...withoutLanguage } = ADMIN;

        assert.deepEqual(await localeOf(withoutLanguage), [
            'pl',
            'auto',
            'Start'
        ]);
        assert.deepEqual(await localeOf({ ...ADMIN, language_code: 'en' }), [
            'en',
            'auto',
            'Home'
        ]);

        await run(harness.repositories.users.setLanguage(user.id, 'pl', NOW));
        assert.deepEqual(await localeOf({ ...ADMIN, language_code: 'uk' }), [
            'pl',
            'pl',
            'Start'
        ]);
    });

    it('requires registration on user routes and serves implemented handlers', async () => {
        const guestOnUserRoute = await request('/wishes', {
            initData: signedFor()
        });

        assert.equal(guestOnUserRoute.status, 403);
        assert.deepEqual(await readError(guestOnUserRoute), {
            code: 'registrationRequired'
        });

        const guestMe = await request('/me', { initData: signedFor() });

        assert.equal(guestMe.status, 200);

        await createUser();

        const userWishes = await request('/wishes', { initData: signedFor() });

        assert.equal(userWishes.status, 200);

        const unknown = await request('/nope', { initData: signedFor() });

        assert.equal(unknown.status, 404);
        assert.deepEqual(await readError(unknown), { code: 'notFound' });
    });

    it('reports every API request with the route template and no identifiers', async () => {
        await request('/bootstrap', { initData: signedFor() });
        await request('/wishes/987654321', { initData: signedFor() });
        await request('/nope', { initData: signedFor() });

        const completed = eventsNamed('app_api_completed');

        assert.deepEqual(
            completed.map(event => {
                return [
                    event.route,
                    event.method,
                    event.status,
                    event.errorCode
                ];
            }),
            [
                ['/api/app/bootstrap', 'GET', 200, null],
                ['/api/app/wishes/:id', 'GET', 403, 'registrationRequired'],
                ['/api/app/*', 'GET', 404, 'notFound']
            ]
        );

        const serialized = JSON.stringify(events);

        assert.equal(serialized.includes(String(ADMIN_TELEGRAM_ID)), false);
        assert.equal(serialized.includes('admin_user'), false);
        assert.equal(serialized.includes('987654321'), false);
    });
});
