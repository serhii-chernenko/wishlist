import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import { TelegramApiError, type TelegramApi } from '../../src/api/telegram-api';
import { getReleaseLabels } from '../../src/bot/content/release-format';
import {
    getReleaseItemText,
    getReleases
} from '../../src/bot/content/releases';
import {
    FEEDBACK_MAX_LENGTH,
    PAYMENTS_MAX_LENGTH
} from '../../src/bot/input/limits';
import {
    CLIENT_EVENT_KINDS,
    CLIENT_SCREENS,
    type ApiErrorBody,
    type LanguageResultDto,
    type MeDto,
    type ReleasesDto,
    type ShareDto,
    type StatsDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import type { TelemetryFields } from '../../src/worker/telemetry';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { countRows, createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const ADMIN_TELEGRAM_ID = 777_000_111;
const OWNER_TELEGRAM_ID = 555_000_222;
const GUEST_TELEGRAM_ID = 555_000_333;
const CANONICAL_ORIGIN = 'https://wishlist.chernenko.dev';

const OWNER: InitDataUserFixture = {
    id: OWNER_TELEGRAM_ID,
    first_name: 'Olena',
    last_name: 'Koval',
    username: 'olena_k',
    language_code: 'en'
};

const GUEST: InitDataUserFixture = {
    id: GUEST_TELEGRAM_ID,
    first_name: 'Guest',
    username: 'guest_user',
    language_code: 'en'
};

const NAMELESS_GUEST: InitDataUserFixture = {
    id: GUEST_TELEGRAM_ID,
    first_name: 'Guest',
    language_code: 'en'
};

interface SentMessage {
    chatId: number | string;
    text: string;
}

describe('Mini App API account, share, feedback and info', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];
    let sentMessages: SentMessage[];
    let sendMessageError: Error | null;

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
            ADMIN_ID: String(ADMIN_TELEGRAM_ID),
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            ...overrides
        } as unknown as WorkerBindings;
    };

    const createFakeTelegram = (): TelegramApi => {
        return {
            async sendMessage(chatId, text) {
                if (sendMessageError) {
                    throw sendMessageError;
                }

                sentMessages.push({ chatId, text });

                return {} as Awaited<ReturnType<TelegramApi['sendMessage']>>;
            },
            async sendPhoto() {
                throw new Error('sendPhoto is not expected');
            },
            async sendMediaGroup() {
                throw new Error('sendMediaGroup is not expected');
            },
            async editMessageText() {
                throw new Error('unexpected editMessageText');
            },
            async deleteMessage() {
                throw new Error('deleteMessage is not expected');
            },
            async getFile() {
                throw new Error('getFile is not expected');
            },
            async downloadFile() {
                throw new Error('downloadFile is not expected');
            }
        };
    };

    const createTestApp = () => {
        return createApp(
            {},
            {},
            { now: () => NOW },
            {
                now: () => NOW,
                crypto: createNodeApiCrypto(),
                createTelegramApi: createFakeTelegram,
                emitTelemetry: (_env, _context, fields) => {
                    events.push(fields);
                }
            }
        );
    };

    const api = (
        method: string,
        path: string,
        options: { as?: InitDataUserFixture; body?: unknown } = {}
    ) => {
        const headers = new Headers();

        if (options.as !== undefined) {
            headers.set(
                'Authorization',
                `tma ${createSignedInitData({ user: options.as, authDate: NOW_SECONDS })}`
            );
        }

        const init: RequestInit = { method, headers };

        if (options.body !== undefined) {
            headers.set('Content-Type', 'application/json');
            init.body = JSON.stringify(options.body);
        }

        return createTestApp().request(`/api/app${path}`, init, buildEnv());
    };

    const getPage = (path: string) => {
        return createTestApp().request(path, {}, buildEnv());
    };

    const readJson = async <Body>(response: Response) => {
        return (await response.json()) as Body;
    };

    const readError = async (response: Response) => {
        return (await readJson<ApiErrorBody>(response)).error;
    };

    const eventsNamed = (name: string) => {
        return events.filter(event => {
            return event.event === name;
        });
    };

    const registerUser = async (
        fixture: InitDataUserFixture,
        overrides: Partial<
            Parameters<D1Harness['repositories']['users']['create']>[0]
        > = {}
    ) => {
        const created = await run(
            harness.repositories.users.create({
                telegramId: fixture.id,
                username: fixture.username ?? null,
                usernameSearchable: true,
                createdAt: NOW,
                ...overrides
            })
        );

        assert.ok(created);

        return created;
    };

    const addWish = async (userId: number, title: string) => {
        const wish = await run(
            harness.repositories.wishes.create(userId, title, 'UAH', NOW)
        );

        assert.ok(wish);

        return wish;
    };

    const readSessionState = async (telegramId: number) => {
        const session = await run(
            harness.repositories.sessions.get(telegramId)
        );

        return session === null
            ? null
            : (JSON.parse(session.state) as {
                  pendingInput: Record<string, unknown> | null;
              });
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
        sentMessages = [];
        sendMessageError = null;
        await harness.clearApplicationTables();
    });

    describe('GET /me', () => {
        it('describes a guest and a registered user', async () => {
            const guest = await api('GET', '/me', { as: GUEST });

            assert.equal(guest.status, 200);
            assert.deepEqual(await readJson<MeDto>(guest), {
                registered: false,
                visibility: null,
                telegramUsername: 'guest_user',
                phoneMasked: null,
                payments: null,
                deliveryAddress: null,
                disclosure: { payments: true, phone: false, address: false },
                currency: 'EUR',
                languageChoice: 'auto',
                locale: 'en',
                wishlistFilter: null,
                canShowPublicUsername: false,
                showGifted: false
            });

            await registerUser(OWNER);

            const owner = await readJson<MeDto>(
                await api('GET', '/me', { as: OWNER })
            );

            assert.equal(owner.registered, true);
            assert.equal(owner.visibility, 'username');
            assert.equal(owner.canShowPublicUsername, true);
            assert.equal(await countRows(harness, 'users'), 1);
        });
    });

    describe('visibility', () => {
        it('creates the user when a guest picks the username visibility', async () => {
            assert.equal(await countRows(harness, 'users'), 0);

            const response = await api('PUT', '/me/visibility', {
                as: GUEST,
                body: { type: 'username' }
            });
            const me = await readJson<MeDto>(response);

            assert.equal(response.status, 200);
            assert.equal(me.registered, true);
            assert.equal(me.visibility, 'username');
            assert.equal(await countRows(harness, 'users'), 1);

            const stored = await run(
                harness.repositories.users.findByTelegramId(GUEST_TELEGRAM_ID)
            );

            assert.equal(stored?.username, 'guest_user');
            assert.equal(stored?.usernameSearchable, true);
            assert.equal(stored?.showGifted, true);
            assert.equal(me.showGifted, true);
            assert.deepEqual(
                eventsNamed('bot_action_completed').map(event => {
                    return [event.channel, event.action, event.result];
                }),
                [['app', 'user_registered', 'username']]
            );
        });

        it('keeps the language a guest chose in the session on registration', async () => {
            await api('PUT', '/me/language', {
                as: GUEST,
                body: { choice: 'pl' }
            });

            const me = await readJson<MeDto>(
                await api('PUT', '/me/visibility', {
                    as: GUEST,
                    body: { type: 'username' }
                })
            );

            assert.equal(me.languageChoice, 'pl');
            assert.equal(me.locale, 'pl');
        });

        it('rejects a guest without a Telegram username with usernameRequired', async () => {
            const response = await api('PUT', '/me/visibility', {
                as: NAMELESS_GUEST,
                body: { type: 'username' }
            });

            assert.equal(response.status, 422);
            assert.deepEqual(await readError(response), {
                code: 'validation',
                fields: { type: 'usernameRequired' }
            });
            assert.equal(await countRows(harness, 'users'), 0);
        });

        it('rejects unknown visibility types', async () => {
            for (const type of ['phone', 'both', 'x']) {
                const response = await api('PUT', '/me/visibility', {
                    as: GUEST,
                    body: { type }
                });

                assert.equal(response.status, 422, type);
            }

            assert.equal(await countRows(harness, 'users'), 0);
        });

        it('switches a phone-only user back to the username visibility', async () => {
            await registerUser(OWNER, {
                usernameSearchable: false,
                phone: '+380501234567',
                phoneDigits: '380501234567'
            });

            const me = await readJson<MeDto>(
                await api('PUT', '/me/visibility', {
                    as: OWNER,
                    body: { type: 'username' }
                })
            );

            assert.equal(me.visibility, 'username');
            assert.equal(me.phoneMasked, null);
            assert.equal(await countRows(harness, 'users'), 1);
        });
    });

    describe('contact intent', () => {
        it('writes a pending contact with via app for a guest', async () => {
            const response = await api(
                'POST',
                '/me/visibility/contact-intent',
                { as: GUEST, body: { type: 'phone' } }
            );

            assert.equal(response.status, 204);
            assert.deepEqual(
                (await readSessionState(GUEST_TELEGRAM_ID))?.pendingInput,
                {
                    kind: 'contact',
                    authType: 'phone',
                    via: 'app',
                    createdAt: NOW.getTime()
                }
            );
            assert.equal(await countRows(harness, 'users'), 0);

            await api('POST', '/me/visibility/contact-intent', {
                as: GUEST,
                body: { type: 'both' }
            });

            assert.deepEqual(
                (await readSessionState(GUEST_TELEGRAM_ID))?.pendingInput,
                {
                    kind: 'contact',
                    authType: 'both',
                    via: 'app',
                    createdAt: NOW.getTime()
                }
            );
        });

        it('requires a username for both and a valid type', async () => {
            const noUsername = await api(
                'POST',
                '/me/visibility/contact-intent',
                { as: NAMELESS_GUEST, body: { type: 'both' } }
            );

            assert.equal(noUsername.status, 422);
            assert.deepEqual(await readError(noUsername), {
                code: 'validation',
                fields: { type: 'usernameRequired' }
            });

            const phoneOnly = await api(
                'POST',
                '/me/visibility/contact-intent',
                { as: NAMELESS_GUEST, body: { type: 'phone' } }
            );

            assert.equal(phoneOnly.status, 204);

            const invalid = await api('POST', '/me/visibility/contact-intent', {
                as: GUEST,
                body: { type: 'username' }
            });

            assert.equal(invalid.status, 422);
        });

        it('cancel clears only a pending contact', async () => {
            await run(
                harness.repositories.sessions.saveState(
                    GUEST_TELEGRAM_ID,
                    { v: 1, pendingInput: { kind: 'feedback' }, find: null },
                    NOW
                )
            );

            const untouched = await api(
                'DELETE',
                '/me/visibility/contact-intent',
                { as: GUEST }
            );

            assert.equal(untouched.status, 204);
            assert.deepEqual(
                (await readSessionState(GUEST_TELEGRAM_ID))?.pendingInput,
                { kind: 'feedback' }
            );

            await api('POST', '/me/visibility/contact-intent', {
                as: GUEST,
                body: { type: 'phone' }
            });

            const cleared = await api(
                'DELETE',
                '/me/visibility/contact-intent',
                { as: GUEST }
            );

            assert.equal(cleared.status, 204);
            assert.equal(
                (await readSessionState(GUEST_TELEGRAM_ID))?.pendingInput,
                null
            );
        });
    });

    describe('language', () => {
        it('stores a guest choice in the session and returns the new dictionary', async () => {
            const response = await api('PUT', '/me/language', {
                as: GUEST,
                body: { choice: 'pl' }
            });
            const result = await readJson<LanguageResultDto>(response);
            const session = await run(
                harness.repositories.sessions.get(GUEST_TELEGRAM_ID)
            );

            assert.equal(response.status, 200);
            assert.equal(session?.language, 'pl');
            assert.equal(result.me.registered, false);
            assert.equal(result.me.languageChoice, 'pl');
            assert.equal(result.me.locale, 'pl');
            assert.equal(await countRows(harness, 'users'), 0);

            const english = await readJson<LanguageResultDto>(
                await api('PUT', '/me/language', {
                    as: GUEST,
                    body: { choice: 'en' }
                })
            );

            assert.notDeepEqual(result.messages, english.messages);

            const auto = await readJson<LanguageResultDto>(
                await api('PUT', '/me/language', {
                    as: GUEST,
                    body: { choice: 'auto' }
                })
            );

            assert.equal(auto.me.languageChoice, 'auto');
            assert.equal(auto.me.locale, 'en');
            assert.deepEqual(auto.messages, english.messages);
            assert.equal(
                (
                    await run(
                        harness.repositories.sessions.get(GUEST_TELEGRAM_ID)
                    )
                )?.language,
                null
            );
        });

        it('stores a user choice on the user and leaves the session alone', async () => {
            await registerUser(OWNER);

            const result = await readJson<LanguageResultDto>(
                await api('PUT', '/me/language', {
                    as: OWNER,
                    body: { choice: 'uk' }
                })
            );
            const stored = await run(
                harness.repositories.users.findByTelegramId(OWNER_TELEGRAM_ID)
            );

            assert.equal(stored?.language, 'uk');
            assert.equal(result.me.languageChoice, 'uk');
            assert.equal(result.me.locale, 'uk');
            assert.equal(await countRows(harness, 'sessions'), 0);

            const auto = await readJson<LanguageResultDto>(
                await api('PUT', '/me/language', {
                    as: OWNER,
                    body: { choice: 'auto' }
                })
            );

            assert.equal(auto.me.languageChoice, 'auto');
            assert.equal(auto.me.locale, 'en');
            assert.deepEqual(
                eventsNamed('bot_action_completed').map(event => {
                    return [event.channel, event.action, event.result];
                }),
                [
                    ['app', 'language_changed', 'uk'],
                    ['app', 'language_changed', 'auto']
                ]
            );
        });

        it('rejects unknown choices', async () => {
            for (const body of [{ choice: 'de' }, {}, { choice: 1 }]) {
                const response = await api('PUT', '/me/language', {
                    as: GUEST,
                    body
                });

                assert.equal(response.status, 422, JSON.stringify(body));
            }
        });
    });

    describe('payments', () => {
        it('is registered-only', async () => {
            for (const [method, body] of [
                ['PUT', { text: 'Mono 1234 5678' }],
                ['DELETE', undefined]
            ] as const) {
                const response = await api(method, '/me/payments', {
                    as: GUEST,
                    ...(body === undefined ? {} : { body })
                });

                assert.equal(response.status, 403, method);
                assert.deepEqual(await readError(response), {
                    code: 'registrationRequired'
                });
            }
        });

        it('validates length and content, saves, and removes', async () => {
            await registerUser(OWNER);

            const cases: [string, string][] = [
                ['', 'tooShort'],
                ['   ', 'tooShort'],
                ['12', 'tooShort'],
                ['---', 'tooShort'],
                ['x'.repeat(PAYMENTS_MAX_LENGTH + 1), 'tooLong']
            ];

            for (const [text, code] of cases) {
                const response = await api('PUT', '/me/payments', {
                    as: OWNER,
                    body: { text }
                });

                assert.equal(response.status, 422, code);
                assert.deepEqual(await readError(response), {
                    code: 'validation',
                    fields: { text: code }
                });
            }

            const missing = await api('PUT', '/me/payments', {
                as: OWNER,
                body: {}
            });

            assert.equal(missing.status, 422);

            const saved = await api('PUT', '/me/payments', {
                as: OWNER,
                body: { text: '  Mono: 4441 1111 2222 3333  ' }
            });

            assert.equal(saved.status, 200);
            assert.equal(
                (await readJson<MeDto>(saved)).payments,
                'Mono: 4441 1111 2222 3333'
            );
            assert.equal(
                (
                    await run(
                        harness.repositories.users.findByTelegramId(
                            OWNER_TELEGRAM_ID
                        )
                    )
                )?.payments,
                'Mono: 4441 1111 2222 3333'
            );

            const atLimit = await api('PUT', '/me/payments', {
                as: OWNER,
                body: { text: 'y'.repeat(PAYMENTS_MAX_LENGTH) }
            });

            assert.equal(atLimit.status, 200);

            const removed = await api('DELETE', '/me/payments', { as: OWNER });

            assert.equal(removed.status, 200);
            assert.equal((await readJson<MeDto>(removed)).payments, null);
            assert.equal(
                (
                    await run(
                        harness.repositories.users.findByTelegramId(
                            OWNER_TELEGRAM_ID
                        )
                    )
                )?.payments,
                null
            );
            assert.deepEqual(
                eventsNamed('bot_action_completed').map(event => {
                    return event.action;
                }),
                ['payments_updated', 'payments_updated', 'payments_removed']
            );
        });
    });

    describe('share', () => {
        it('is registered-only', async () => {
            const response = await api('GET', '/share', { as: GUEST });

            assert.equal(response.status, 403);
        });

        it('walks the empty, publish, username, rotate and stop lifecycle', async () => {
            const owner = await registerUser(OWNER);

            const empty = await readJson<ShareDto>(
                await api('GET', '/share', { as: OWNER })
            );

            assert.deepEqual(empty, {
                state: 'empty',
                url: null,
                appUrl: null,
                showUsername: false,
                canShowUsername: true,
                allowIndexing: true,
                consent: { name: 'Olena Koval', host: 'wishlist.chernenko.dev' }
            });

            const refused = await api('POST', '/share/publish', { as: OWNER });

            assert.equal(refused.status, 409);
            assert.deepEqual(await readError(refused), { code: 'shareEmpty' });

            await addWish(owner.id, 'Coffee grinder');

            const unshared = await readJson<ShareDto>(
                await api('GET', '/share', { as: OWNER })
            );

            assert.equal(unshared.state, 'unshared');
            assert.equal(unshared.url, null);
            assert.equal(unshared.appUrl, null);

            const publishedResponse = await api('POST', '/share/publish', {
                as: OWNER
            });
            const published = await readJson<ShareDto>(publishedResponse);

            assert.equal(publishedResponse.status, 200);
            assert.equal(published.state, 'shared');
            assert.ok(published.url?.startsWith(`${CANONICAL_ORIGIN}/w/`));

            const share = await run(
                harness.repositories.shares.findActiveByUserId(owner.id)
            );

            assert.equal(share?.displayName, 'Olena Koval');
            assert.equal(
                published.url,
                `${CANONICAL_ORIGIN}/w/${share?.publicId}`
            );
            assert.equal(
                published.appUrl,
                `${harness.env.WISHLIST_TG_URL}?startapp=s_${share?.publicId}`
            );

            const again = await readJson<ShareDto>(
                await api('POST', '/share/publish', { as: OWNER })
            );

            assert.equal(again.url, published.url);

            const page = await getPage(`/ua/w/${share?.publicId}`);

            assert.equal(page.status, 200);
            assert.match(await page.text(), /Coffee grinder/);

            const shown = await api('PUT', '/share/username', {
                as: OWNER,
                body: { show: true }
            });

            assert.equal(shown.status, 200);
            assert.equal((await readJson<ShareDto>(shown)).showUsername, true);

            const hidden = await readJson<ShareDto>(
                await api('PUT', '/share/username', {
                    as: OWNER,
                    body: { show: false }
                })
            );

            assert.equal(hidden.showUsername, false);

            const invalidShow = await api('PUT', '/share/username', {
                as: OWNER,
                body: { show: 'yes' }
            });

            assert.equal(invalidShow.status, 422);

            const rotatedResponse = await api('POST', '/share/rotate', {
                as: OWNER
            });
            const rotated = await readJson<ShareDto>(rotatedResponse);

            assert.equal(rotatedResponse.status, 200);
            assert.equal(rotated.state, 'shared');
            assert.notEqual(rotated.url, published.url);
            assert.equal(
                (await getPage(`/ua/w/${share?.publicId}`)).status,
                404
            );
            assert.equal(
                (
                    await getPage(
                        `/ua/w/${rotated.url?.slice(rotated.url.lastIndexOf('/') + 1)}`
                    )
                ).status,
                200
            );

            const stopped = await api('POST', '/share/stop', { as: OWNER });
            const stoppedBody = await readJson<ShareDto>(stopped);

            assert.equal(stopped.status, 200);
            assert.equal(stoppedBody.state, 'unshared');
            assert.equal(stoppedBody.url, null);
            assert.equal(stoppedBody.appUrl, null);

            const rotatedPublicId = rotated.url?.slice(
                rotated.url.lastIndexOf('/') + 1
            );
            const gone = await getPage(`/ua/w/${rotatedPublicId}`);

            assert.equal(gone.status, 410);
            assert.equal((await getPage(`/w/${rotatedPublicId}`)).status, 410);

            const stoppedAgain = await api('POST', '/share/stop', {
                as: OWNER
            });

            assert.equal(stoppedAgain.status, 200);
            assert.deepEqual(
                eventsNamed('bot_action_completed').map(event => {
                    return [event.channel, event.action, event.result];
                }),
                [
                    ['app', 'wishlist_shared', 'published'],
                    ['app', 'wishlist_shared', 'existing'],
                    ['app', 'wishlist_share_username_toggled', 'on'],
                    ['app', 'wishlist_share_username_toggled', 'off'],
                    ['app', 'wishlist_share_rotated', 'success'],
                    ['app', 'wishlist_share_stopped', 'success']
                ]
            );
        });

        it('answers notShared when nothing is shared', async () => {
            const owner = await registerUser(OWNER);

            await addWish(owner.id, 'Book');

            for (const [method, path, body] of [
                ['PUT', '/share/username', { show: true }],
                ['POST', '/share/rotate', undefined]
            ] as const) {
                const response = await api(method, path, {
                    as: OWNER,
                    ...(body === undefined ? {} : { body })
                });

                assert.equal(response.status, 409, path);
                assert.deepEqual(await readError(response), {
                    code: 'notShared'
                });
            }
        });

        it('refuses to show a username that cannot be public', async () => {
            const owner = await registerUser(OWNER, {
                usernameSearchable: false,
                phone: '+380501234567',
                phoneDigits: '380501234567'
            });

            await addWish(owner.id, 'Book');
            await api('POST', '/share/publish', { as: OWNER });

            const shared = await readJson<ShareDto>(
                await api('GET', '/share', { as: OWNER })
            );

            assert.equal(shared.state, 'shared');
            assert.equal(shared.canShowUsername, false);

            const refused = await api('PUT', '/share/username', {
                as: OWNER,
                body: { show: true }
            });

            assert.equal(refused.status, 422);
            assert.deepEqual(await readError(refused), {
                code: 'validation',
                fields: { show: 'usernameUnavailable' }
            });

            const hide = await api('PUT', '/share/username', {
                as: OWNER,
                body: { show: false }
            });

            assert.equal(hide.status, 200);
        });

        it('falls back to the dash when the actor has no name', async () => {
            await registerUser({ id: OWNER_TELEGRAM_ID }, { username: null });

            const nameless = await readJson<ShareDto>(
                await api('GET', '/share', {
                    as: { id: OWNER_TELEGRAM_ID, first_name: '' }
                })
            );

            assert.equal(nameless.consent.name, '—');
        });
    });

    describe('feedback', () => {
        it('reaches the admin tagged as sent from the app, for guests too', async () => {
            const guest = await api('POST', '/feedback', {
                as: GUEST,
                body: { text: '  Love <it>  ' }
            });

            assert.equal(guest.status, 204);
            assert.equal(await guest.text(), '');
            assert.equal(sentMessages.length, 1);
            assert.equal(sentMessages[0]?.chatId, String(ADMIN_TELEGRAM_ID));
            assert.match(sentMessages[0]?.text ?? '', /Love &lt;it&gt;/);
            assert.match(sentMessages[0]?.text ?? '', /@guest_user/);
            assert.match(sentMessages[0]?.text ?? '', /#app$/);

            await registerUser(OWNER);

            const registered = await api('POST', '/feedback', {
                as: OWNER,
                body: { text: 'Great app' }
            });

            assert.equal(registered.status, 204);
            assert.equal(sentMessages.length, 2);
            assert.equal(eventsNamed('bot_action_completed').length, 2);
            assert.equal(
                eventsNamed('bot_action_completed')[0]?.action,
                'feedback_sent'
            );
        });

        it('validates the text', async () => {
            const cases: [unknown, string][] = [
                [{}, 'required'],
                [{ text: '' }, 'empty'],
                [{ text: '   ' }, 'empty'],
                [{ text: 5 }, 'invalid'],
                [{ text: 'x'.repeat(FEEDBACK_MAX_LENGTH + 1) }, 'tooLong']
            ];

            for (const [body, code] of cases) {
                const response = await api('POST', '/feedback', {
                    as: GUEST,
                    body
                });

                assert.equal(response.status, 422, code);
                assert.deepEqual(await readError(response), {
                    code: 'validation',
                    fields: { text: code }
                });
            }

            const atLimit = await api('POST', '/feedback', {
                as: GUEST,
                body: { text: 'x'.repeat(FEEDBACK_MAX_LENGTH) }
            });

            assert.equal(atLimit.status, 204);
            assert.equal(sentMessages.length, 1);
        });

        it('answers 502 notDelivered without blocking the sender when the admin forbids', async () => {
            const owner = await registerUser(OWNER);

            sendMessageError = new TelegramApiError('sendMessage', {
                error_code: 403,
                description: 'Forbidden: bot was blocked by the user'
            });

            const response = await api('POST', '/feedback', {
                as: OWNER,
                body: { text: 'Hello' }
            });

            assert.equal(response.status, 502);
            assert.deepEqual(await readError(response), {
                code: 'notDelivered'
            });
            assert.equal(sentMessages.length, 0);
            assert.equal(
                (
                    await run(
                        harness.repositories.users.findByTelegramId(
                            OWNER_TELEGRAM_ID
                        )
                    )
                )?.blockedAt,
                null
            );
            assert.equal(owner.blockedAt, null);
            assert.equal(eventsNamed('feedback_delivery_failed').length, 1);
            assert.equal(eventsNamed('bot_action_completed').length, 0);
        });

        it('answers 502 notDelivered on a transport failure', async () => {
            sendMessageError = new TelegramApiError('sendMessage', {
                error_code: 0,
                description: 'Network error'
            });

            const response = await api('POST', '/feedback', {
                as: GUEST,
                body: { text: 'Hello' }
            });

            assert.equal(response.status, 502);
            assert.deepEqual(await readError(response), {
                code: 'notDelivered'
            });
        });
    });

    describe('stats', () => {
        it('returns public totals to guests', async () => {
            const owner = await registerUser(OWNER);
            const done = await addWish(owner.id, 'Done wish');

            await addWish(owner.id, 'Open wish');
            await run(
                harness.repositories.wishes.softRemove(
                    done.id,
                    owner.id,
                    true,
                    NOW
                )
            );
            await registerUser({ id: 555_000_444, username: 'third' });

            const response = await api('GET', '/stats', { as: GUEST });

            assert.equal(response.status, 200);
            assert.deepEqual(await readJson<StatsDto>(response), {
                users: 2,
                wishes: 2,
                done: 1
            });
        });
    });

    describe('releases', () => {
        const fetchReleases = (as: InitDataUserFixture, query = '') => {
            return api('GET', `/releases${query}`, { as });
        };

        it('pages with the default size and localizes by the request locale', async () => {
            const manifest = getReleases();

            assert.ok(manifest.length > 3);

            const en = await readJson<ReleasesDto>(await fetchReleases(GUEST));

            assert.equal(en.total, manifest.length);
            assert.equal(en.items.length, 3);
            assert.deepEqual(
                en.items.map(item => item.version),
                manifest.slice(0, 3).map(release => release.version)
            );

            const labels = getReleaseLabels('en');
            const first = manifest[0];

            assert.ok(first);

            const firstItem = en.items[0];

            assert.ok(firstItem);
            assert.equal(firstItem.date, first.date);

            for (const group of firstItem.groups) {
                assert.equal(group.label, labels[group.group]);
                assert.deepEqual(
                    group.items,
                    (first.groups[group.group] ?? []).map(entry => {
                        return getReleaseItemText(entry, 'en');
                    })
                );
            }

            assert.deepEqual(
                firstItem.groups.map(group => group.group),
                Object.keys(first.groups)
            );

            const polishUser = await registerUser(OWNER);

            await run(
                harness.repositories.users.setLanguage(polishUser.id, 'pl', NOW)
            );

            const pl = await readJson<ReleasesDto>(await fetchReleases(OWNER));
            const plFirst = pl.items[0];

            assert.ok(plFirst);
            assert.equal(
                plFirst.groups[0]?.label,
                getReleaseLabels('pl')[plFirst.groups[0]?.group ?? 'added']
            );
            assert.notEqual(
                plFirst.groups[0]?.label,
                firstItem.groups[0]?.label
            );

            const uk = await readJson<ReleasesDto>(
                await fetchReleases({ ...GUEST, language_code: 'uk' })
            );

            assert.equal(
                uk.items[0]?.groups[0]?.label,
                getReleaseLabels('uk')[uk.items[0]?.groups[0]?.group ?? 'added']
            );
        });

        it('honours offset and limit and rejects bad values', async () => {
            const manifest = getReleases();
            const page = await readJson<ReleasesDto>(
                await fetchReleases(GUEST, '?offset=1&limit=2')
            );

            assert.deepEqual(
                page.items.map(item => item.version),
                manifest.slice(1, 3).map(release => release.version)
            );
            assert.equal(page.total, manifest.length);

            const beyond = await readJson<ReleasesDto>(
                await fetchReleases(GUEST, `?offset=${manifest.length + 5}`)
            );

            assert.deepEqual(beyond.items, []);
            assert.equal(beyond.total, manifest.length);

            for (const query of [
                '?limit=0',
                '?limit=21',
                '?limit=x',
                '?offset=-1'
            ]) {
                const response = await fetchReleases(GUEST, query);

                assert.equal(response.status, 422, query);
            }
        });
    });

    describe('client events', () => {
        it('records closed-set events as telemetry only', async () => {
            const response = await api('POST', '/client-events', {
                as: GUEST,
                body: { kind: 'renderError', screen: 'wishEditor' }
            });

            assert.equal(response.status, 204);
            assert.equal(await response.text(), '');

            const [event] = eventsNamed('app_client_event');

            assert.equal(event?.kind, 'renderError');
            assert.equal(event?.screen, 'wishEditor');
            assert.equal(await countRows(harness, 'users'), 0);
            assert.equal(await countRows(harness, 'sessions'), 0);

            for (const kind of CLIENT_EVENT_KINDS) {
                for (const screen of CLIENT_SCREENS) {
                    const ok = await api('POST', '/client-events', {
                        as: GUEST,
                        body: { kind, screen }
                    });

                    assert.equal(ok.status, 204, `${kind}/${screen}`);
                }
            }
        });

        it('records screen views and validation failures with closed-set labels', async () => {
            const view = await api('POST', '/client-events', {
                as: GUEST,
                body: { kind: 'screenView', screen: 'wishes' }
            });
            const failure = await api('POST', '/client-events', {
                as: GUEST,
                body: {
                    kind: 'validationFailed',
                    screen: 'wishEditor',
                    field: 'title',
                    code: 'tooLong'
                }
            });

            assert.equal(view.status, 204);
            assert.equal(failure.status, 204);
            assert.deepEqual(
                eventsNamed('app_client_event').map(event => {
                    return [event.kind, event.screen, event.field, event.code];
                }),
                [
                    ['screenView', 'wishes', undefined, undefined],
                    ['validationFailed', 'wishEditor', 'title', 'tooLong']
                ]
            );
        });

        it('rejects values outside the closed sets', async () => {
            const cases: [unknown, Record<string, string>][] = [
                [
                    {
                        kind: 'validationFailed',
                        screen: 'wishEditor',
                        field: 'secret',
                        code: 'nope'
                    },
                    { field: 'invalid', code: 'invalid' }
                ],
                [
                    { kind: 'renderError', screen: 'secret' },
                    { screen: 'invalid' }
                ],
                [{ kind: 'boom', screen: 'home' }, { kind: 'invalid' }],
                [{}, { kind: 'required', screen: 'required' }]
            ];

            for (const [body, fields] of cases) {
                const response = await api('POST', '/client-events', {
                    as: GUEST,
                    body
                });

                assert.equal(response.status, 422);
                assert.deepEqual(await readError(response), {
                    code: 'validation',
                    fields
                });
            }

            assert.equal(eventsNamed('app_client_event').length, 0);
        });
    });
});
