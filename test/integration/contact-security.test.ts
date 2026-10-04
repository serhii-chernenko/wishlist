import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getTranslator } from '../../src/bot/i18n';
import type {
    ApiErrorBody,
    OwnerWishListDto,
    SearchResultDto,
    SharedListDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { CacheLike } from '../../src/web/routes';
import { createD1Harness, type D1Harness } from './d1-harness';
import {
    assertNoContactLeak,
    createContactFixtures,
    FIXTURE_ADDRESS,
    FIXTURE_PHONE,
    FIXTURE_PHONE_DIGITS,
    GUEST,
    OWNER,
    VIEWER
} from './contact-fixtures';

class RecordingCache implements CacheLike {
    readonly bodies = new Map<string, string>();

    async match(key: string) {
        const body = this.bodies.get(key);

        return body === undefined ? undefined : new Response(body);
    }

    async put(key: string, response: Response) {
        this.bodies.set(key, await response.text());
    }
}

const UNKNOWN_PUBLIC_ID = '01m3yjg16thmzah2dprymwajwj';
const WEB_LANGUAGES = ['ua', 'en', 'pl'] as const;

describe('contact disclosure security', () => {
    let harness: D1Harness;
    let cache: RecordingCache;
    const fixtures = createContactFixtures(() => harness);
    const { call, registerUser, registerOwnerWithContact, findUser, run } =
        fixtures;

    const webEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_ENVIRONMENT: 'production',
            WISHLIST_TG_URL: 'https://t.me/wishlist_ua_bot'
        } as unknown as WorkerBindings;
    };

    const web = (path: string, init: RequestInit = {}) => {
        const app = createApp({}, {}, { cache, now: () => new Date() });

        return app.request(
            `https://wishlist.chernenko.dev${path}`,
            init,
            webEnv()
        );
    };

    const readWeb = async (path: string, init: RequestInit = {}) => {
        const response = await web(path, init);
        const headers = JSON.stringify(Array.from(response.headers.entries()));

        return { response, body: await response.text(), headers };
    };

    const assertWebClean = async (path: string, init: RequestInit = {}) => {
        const { response, body, headers } = await readWeb(path, init);

        assertNoContactLeak(body, `${init.method ?? 'GET'} ${path} body`);
        assertNoContactLeak(headers, `${init.method ?? 'GET'} ${path} headers`);

        return { response, body };
    };

    const searchOwner = async (query: string) => {
        const response = await call(VIEWER, 'POST', '/search', { query });

        assert.equal(response.status, 200);

        return (await response.json()) as SearchResultDto;
    };

    const listContact = async (token: string) => {
        const response = await call(VIEWER, 'GET', `/lists/${token}/wishes`);

        assert.equal(response.status, 200);

        return ((await response.json()) as OwnerWishListDto).owner.contact;
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        fixtures.events.length = 0;
        cache = new RecordingCache();
        await harness.clearApplicationTables();
    });

    describe('web share pages', () => {
        it('never render the phone or address on any route, header or cached copy', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, 3);

            const publicId = await fixtures.publishShare(owner.id);

            for (const language of WEB_LANGUAGES) {
                const { response, body } = await assertWebClean(
                    `/${language}/w/${publicId}`
                );

                assert.equal(response.status, 200);
                assert.ok(
                    body.includes(
                        getTranslator(
                            language === 'ua' ? 'uk' : language
                        ).web.delivery.inTelegram()
                    ),
                    'the gate is open, so the Telegram hint shows'
                );
                await assertWebClean(`/${language}/w/${publicId}`);
                await assertWebClean(`/${language}/w/${publicId}`, {
                    method: 'HEAD'
                });
                await assertWebClean(`/${language}/w/${publicId}?theme=dark`);
            }

            await assertWebClean(`/w/${publicId}`);
            await assertWebClean(`/w/${publicId.toUpperCase()}`);
            await assertWebClean(`/en/w/${UNKNOWN_PUBLIC_ID}`);
            await assertWebClean('/en');
            await assertWebClean('/sitemap.xml');
            await assertWebClean('/robots.txt');
            await assertWebClean('/status');

            assert.ok(cache.bodies.size > 0);

            for (const [key, body] of cache.bodies) {
                assertNoContactLeak(body, `cache entry ${key}`);
                assertNoContactLeak(key, `cache key ${key}`);
            }

            await run(harness.repositories.shares.revoke(owner.id, new Date()));

            const gone = await assertWebClean(`/en/w/${publicId}`);

            assert.equal(gone.response.status, 410);
        });

        it('leave the Telegram hint out while the phone is hidden', async () => {
            const owner = await registerOwnerWithContact({
                showPhone: false,
                showAddress: false
            });

            await fixtures.addWishes(owner.id, 1);

            const publicId = await fixtures.publishShare(owner.id);
            const { body } = await assertWebClean(`/en/w/${publicId}`);

            assert.ok(
                !body.includes(getTranslator('en').web.delivery.inTelegram())
            );
        });

        it('return 404 for a blocked owner without any contact detail', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, 1);

            const publicId = await fixtures.publishShare(owner.id);

            await run(
                harness.repositories.users.markBlockedByTelegramId(
                    OWNER.id,
                    new Date()
                )
            );

            const { response } = await assertWebClean(`/en/w/${publicId}`);

            assert.equal(response.status, 404);
        });
    });

    describe('Mini App viewers', () => {
        it('give a guest without a users row nothing, not even through the share link', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, 1);

            const publicId = await fixtures.publishShare(owner.id);
            const response = await call(GUEST, 'GET', `/shared/${publicId}`);
            const body = await response.text();

            assert.equal(response.status, 403);
            assert.equal(
                (JSON.parse(body) as ApiErrorBody).error.code,
                'registrationRequired'
            );
            assertNoContactLeak(body, 'guest share response');
        });

        it('give a viewer who blocked the bot no contact', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, 1);

            const publicId = await fixtures.publishShare(owner.id);

            await registerUser(VIEWER);
            await run(
                harness.repositories.users.markBlockedByTelegramId(
                    VIEWER.id,
                    new Date()
                )
            );

            const response = await call(VIEWER, 'GET', `/shared/${publicId}`);
            const body = await response.text();

            assert.equal(response.status, 200);
            assert.equal(
                (JSON.parse(body) as SharedListDto).owner.contact,
                null
            );
            assertNoContactLeak(body, 'blocked viewer share response');
        });

        it('hide a blocked owner from search', async () => {
            await registerOwnerWithContact();
            await registerUser(VIEWER);
            await run(
                harness.repositories.users.markBlockedByTelegramId(
                    OWNER.id,
                    new Date()
                )
            );

            const result = await searchOwner(FIXTURE_PHONE_DIGITS);

            assert.equal(result.status, 'notFound');
            assertNoContactLeak(JSON.stringify(result), 'blocked owner search');
        });
    });

    describe('phone search and phone changes', () => {
        it('serves the address to a phone search only while the owner opts in (T5)', async () => {
            const owner = await registerOwnerWithContact({
                showPhone: false,
                showAddress: false
            });

            await fixtures.addWishes(owner.id, 1);
            await registerUser(VIEWER);

            const found = await searchOwner(FIXTURE_PHONE_DIGITS);

            assert.equal(found.status, 'found');
            assert.ok('owner' in found && found.owner.token);
            assert.equal(found.owner.contact, null);
            assert.equal(await listContact(found.owner.token), null);

            await run(
                harness.repositories.users.setDisclosure(
                    owner.id,
                    { showPhone: true, showAddress: true },
                    new Date()
                )
            );

            assert.equal(
                (await listContact(found.owner.token))?.address,
                FIXTURE_ADDRESS
            );
        });

        it('clears both flags when the owner drops the phone from visibility', async () => {
            const owner = await registerOwnerWithContact();

            await run(
                harness.repositories.users.setVisibility(
                    owner.id,
                    {
                        usernameSearchable: true,
                        phone: null,
                        phoneDigits: null,
                        username: OWNER.username ?? null
                    },
                    new Date()
                )
            );

            const reset = await findUser(owner.id);

            assert.equal(reset.phone, null);
            assert.equal(reset.showPhone, false);
            assert.equal(reset.showAddress, false);
            assert.equal(reset.deliveryAddress, FIXTURE_ADDRESS);
        });

        it('clears both flags when the number moves to another account (T6)', async () => {
            const owner = await registerOwnerWithContact();

            await registerUser(VIEWER, {
                phone: FIXTURE_PHONE,
                phoneDigits: FIXTURE_PHONE_DIGITS
            });

            const previous = await findUser(owner.id);

            assert.equal(previous.phone, null);
            assert.equal(previous.showPhone, false);
            assert.equal(previous.showAddress, false);
        });

        it('clears both flags when the owner switches to another number', async () => {
            const owner = await registerOwnerWithContact();
            const setPhone = (phone: string, phoneDigits: string) => {
                return run(
                    harness.repositories.users.setVisibility(
                        owner.id,
                        {
                            usernameSearchable: true,
                            phone,
                            phoneDigits,
                            username: OWNER.username ?? null
                        },
                        new Date()
                    )
                );
            };

            await setPhone(`+${FIXTURE_PHONE_DIGITS}`, FIXTURE_PHONE_DIGITS);

            const unchanged = await findUser(owner.id);

            assert.equal(unchanged.showPhone, true);
            assert.equal(unchanged.showAddress, true);

            await setPhone('+380671112233', '380671112233');

            const switched = await findUser(owner.id);

            assert.equal(switched.phoneDigits, '380671112233');
            assert.equal(switched.showPhone, false);
            assert.equal(switched.showAddress, false);
            assert.equal(switched.deliveryAddress, FIXTURE_ADDRESS);
        });

        it('requires a new consent after the phone comes back', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, 1);
            await run(
                harness.repositories.users.setVisibility(
                    owner.id,
                    {
                        usernameSearchable: true,
                        phone: null,
                        phoneDigits: null,
                        username: OWNER.username ?? null
                    },
                    new Date()
                )
            );
            await run(
                harness.repositories.users.setVisibility(
                    owner.id,
                    {
                        usernameSearchable: true,
                        phone: FIXTURE_PHONE,
                        phoneDigits: FIXTURE_PHONE_DIGITS,
                        username: OWNER.username ?? null
                    },
                    new Date()
                )
            );
            await registerUser(VIEWER);

            const found = await searchOwner(`@${OWNER.username}`);

            assert.ok('owner' in found && found.owner.token);
            assert.equal(await listContact(found.owner.token), null);
        });
    });
});
