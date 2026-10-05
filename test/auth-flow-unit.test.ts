import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';
import type { Context } from 'telegraf';
import type { Message, User } from 'telegraf/types';

import { getMessages } from '../src/bot/content/messages';
import { isValidPayments } from '../src/bot/input/payments';
import {
    createBotRequest,
    createSessionHolder
} from '../src/bot/runtime/context';
import type {
    BotRequest,
    Repositories,
    Sender,
    SessionState,
    UserRecord
} from '../src/bot/runtime/types';
import {
    callbacks as authCallbacks,
    checkOwnContact,
    renderAuthDescription,
    screen as authScreen
} from '../src/bot/screens/auth';
import { renderAdminFeedback } from '../src/bot/services/feedback-service';
import {
    createUserService,
    getVisibilityType,
    type VisibilityRequest
} from '../src/bot/services/user-service';
import type { WorkerBindings } from '../src/worker/env';

const LL = getMessages('uk');

const ACTOR: User = {
    id: 100,
    is_bot: false,
    first_name: 'Olena',
    username: 'olena',
    language_code: 'uk'
};

const ACTOR_WITHOUT_USERNAME: User = {
    id: 100,
    is_bot: false,
    first_name: 'Olena',
    language_code: 'uk'
};

const createUser = (overrides: Partial<UserRecord> = {}) => {
    return {
        id: 1,
        telegramId: ACTOR.id,
        username: 'olena',
        usernameSearchable: true,
        phone: null,
        phoneDigits: null,
        language: null,
        payments: null,
        ...overrides
    } as UserRecord;
};

const createAuthRequest = (options: {
    actor?: User;
    user?: UserRecord | null;
    session?: SessionState;
    saveVisibility?: (request: VisibilityRequest) => Promise<{
        user: UserRecord;
        created: boolean;
    }>;
}) => {
    const texts: { html: string; keyboard: unknown }[] = [];
    const visibilityRequests: VisibilityRequest[] = [];
    const actions: string[] = [];
    const record = async () => {
        return undefined;
    };
    const sender: Sender = {
        async text(html, keyboard) {
            texts.push({ html, keyboard });
        },
        async textWithHandle() {
            throw new Error('unexpected textWithHandle');
        },
        wish: record,
        toast: record,
        removeKeyboard: record,
        replaceKeyboard: record,
        deleteIncoming: record
    };
    const holder = createSessionHolder(
        options.session ?? { v: 1, pendingInput: null, find: null }
    );
    const services = {
        users: {
            async saveVisibility(request: VisibilityRequest) {
                visibilityRequests.push(request);

                return (
                    options.saveVisibility?.(request) ?? {
                        user: createUser(),
                        created: request.user === null
                    }
                );
            }
        },
        stats: {}
    } as unknown as BotRequest['services'];
    const req = createBotRequest(
        {
            ctx: {} as Context,
            env: {} as WorkerBindings,
            locale: 'uk',
            actor: options.actor ?? ACTOR,
            user: options.user ?? null,
            sessionLanguage: 'en',
            repos: {} as Repositories,
            services,
            telemetry: {
                botActionCompleted(input) {
                    actions.push(input.action);
                },
                internalFailure() {
                    return undefined;
                }
            },
            send: sender,
            defer() {
                return undefined;
            }
        },
        holder
    );

    return { req, texts, holder, visibilityRequests, actions };
};

const contactMessage = (contact: {
    phone_number: string;
    user_id?: number;
}): Message => {
    return {
        message_id: 5,
        date: 1_700_000_000,
        chat: { id: ACTOR.id, type: 'private', first_name: 'Olena' },
        contact: { first_name: 'Olena', ...contact }
    } as Message;
};

const authType = authCallbacks.authType;

assert.ok(authType);

test('contact must belong to the sender (bug 12)', () => {
    assert.deepEqual(
        checkOwnContact(
            contactMessage({ phone_number: '+380501112233', user_id: 100 }),
            100
        ),
        { ok: true, phone: '+380501112233' }
    );
    assert.deepEqual(
        checkOwnContact(
            contactMessage({ phone_number: '+380501112233', user_id: 200 }),
            100
        ),
        { ok: false, reason: 'foreign' }
    );
    assert.deepEqual(
        checkOwnContact(contactMessage({ phone_number: '+380501112233' }), 100),
        { ok: false, reason: 'foreign' }
    );
    assert.deepEqual(
        checkOwnContact(
            { message_id: 1, text: '+380501112233' } as Message,
            100
        ),
        { ok: false, reason: 'missing' }
    );
});

test('username visibility without a Telegram username errors and renders home', async () => {
    const { req, texts, visibilityRequests } = createAuthRequest({
        actor: ACTOR_WITHOUT_USERNAME
    });

    await authType(req, { type: 'authType', authType: 'username' });

    assert.equal(texts[0]?.html, LL.auth.errors.username());
    assert.match(texts[1]?.html ?? '', /^Вітаннячка/);
    assert.deepEqual(visibilityRequests, []);
});

test('guest registration by username stores visibility and session language', async () => {
    const { req, texts, visibilityRequests, actions } = createAuthRequest({});

    await authType(req, { type: 'authType', authType: 'username' });

    assert.deepEqual(visibilityRequests, [
        {
            actor: ACTOR,
            user: null,
            sessionLanguage: 'en',
            authType: 'username',
            phone: null
        }
    ]);
    assert.equal(
        texts[0]?.html,
        LL.auth.success.guest() + LL.auth.success.username('olena')
    );
    assert.equal(texts[1]?.html, LL.greeting.user());
    assert.deepEqual(actions, ['user_registered']);
});

test('phone visibility prompts for the contact and keeps pending input', async () => {
    const { req, texts, holder } = createAuthRequest({ user: createUser() });

    await authType(req, { type: 'authType', authType: 'phone' });

    assert.deepEqual(holder.current.pendingInput, {
        kind: 'contact',
        authType: 'phone'
    });
    assert.equal(texts[0]?.html, LL.auth.sendNumber.description());
    assert.deepEqual(texts[0]?.keyboard, {
        keyboard: [
            [{ text: LL.auth.sendNumber.title(), request_contact: true }]
        ],
        one_time_keyboard: true,
        resize_keyboard: true
    });
});

test('a foreign contact re-prompts and keeps pending input', async () => {
    const session: SessionState = {
        v: 1,
        pendingInput: { kind: 'contact', authType: 'both' },
        find: null
    };
    const { req, texts, holder, visibilityRequests } = createAuthRequest({
        session
    });

    await authScreen.onInput?.(
        req,
        { kind: 'contact', authType: 'both' },
        contactMessage({ phone_number: '+380501112233', user_id: 777 })
    );

    assert.equal(texts[0]?.html, LL.auth.errors.foreignContact());
    assert.equal(texts[1]?.html, LL.auth.sendNumber.description());
    assert.deepEqual(holder.current.pendingInput, session.pendingInput);
    assert.deepEqual(visibilityRequests, []);
});

test('an own contact completes visibility and clears pending input', async () => {
    const { req, texts, holder, visibilityRequests, actions } =
        createAuthRequest({
            user: createUser(),
            session: {
                v: 1,
                pendingInput: { kind: 'contact', authType: 'both' },
                find: null
            }
        });

    await authScreen.onInput?.(
        req,
        { kind: 'contact', authType: 'both' },
        contactMessage({ phone_number: '+380501112233', user_id: 100 })
    );

    assert.equal(visibilityRequests[0]?.authType, 'both');
    assert.equal(visibilityRequests[0]?.phone, '+380501112233');
    assert.equal(holder.current.pendingInput, null);
    assert.equal(
        texts[0]?.html,
        LL.auth.success.user() + LL.auth.success.both('olena', '+380501112233')
    );
    assert.deepEqual(actions, ['visibility_changed']);
});

const createVisibilityRepos = () => {
    const updates: unknown[] = [];
    const creates: unknown[] = [];
    const repos = {
        users: {
            setVisibility(id: number, input: object) {
                updates.push({ id, ...input });
                return Effect.succeed(createUser({ id }));
            },
            create(input: object) {
                creates.push(input);
                return Effect.succeed(createUser());
            }
        }
    } as unknown as Repositories;

    return { repos, updates, creates };
};

test('visibility can be narrowed to any single channel (bug 3)', async () => {
    const { repos, updates } = createVisibilityRepos();
    const service = createUserService({ repos });
    const user = createUser({ phone: '+380501112233' });

    await service.saveVisibility({
        actor: ACTOR,
        user,
        sessionLanguage: null,
        authType: 'username',
        phone: null
    });
    await service.saveVisibility({
        actor: ACTOR,
        user,
        sessionLanguage: null,
        authType: 'phone',
        phone: '+38 (050) 111-22-33'
    });
    await service.saveVisibility({
        actor: ACTOR,
        user,
        sessionLanguage: null,
        authType: 'both',
        phone: '+380501112233'
    });

    assert.deepEqual(updates, [
        {
            id: 1,
            usernameSearchable: true,
            phone: null,
            phoneDigits: null,
            username: 'olena'
        },
        {
            id: 1,
            usernameSearchable: false,
            phone: '+38 (050) 111-22-33',
            phoneDigits: '380501112233',
            username: 'olena'
        },
        {
            id: 1,
            usernameSearchable: true,
            phone: '+380501112233',
            phoneDigits: '380501112233',
            username: 'olena'
        }
    ]);
});

test('registration stores the release version and the guest language', async () => {
    const { repos, creates } = createVisibilityRepos();
    const service = createUserService({
        repos,
        now: () => {
            return new Date('2026-10-01T10:00:00Z');
        }
    });
    const { getLatestReleaseVersion } =
        await import('../src/bot/content/releases');

    const result = await service.saveVisibility({
        actor: ACTOR,
        user: null,
        sessionLanguage: 'pl',
        authType: 'username',
        phone: null
    });

    assert.equal(result.created, true);
    assert.deepEqual(creates, [
        {
            telegramId: 100,
            usernameSearchable: true,
            phone: null,
            phoneDigits: null,
            username: 'olena',
            language: 'pl',
            currency: 'PLN',
            telegramLanguageCode: 'uk',
            releaseVersion: getLatestReleaseVersion(),
            showGifted: true,
            lastSeenAt: new Date('2026-10-01T10:00:00Z'),
            createdAt: new Date('2026-10-01T10:00:00Z'),
            updatedAt: new Date('2026-10-01T10:00:00Z')
        }
    ]);
});

test('visibility type and auth description reflect the stored channels', () => {
    assert.equal(getVisibilityType(null), null);
    assert.equal(getVisibilityType(createUser()), 'username');
    assert.equal(
        getVisibilityType(
            createUser({ usernameSearchable: false, phone: '+380501112233' })
        ),
        'phone'
    );
    assert.equal(
        getVisibilityType(createUser({ phone: '+380501112233' })),
        'both'
    );
    assert.ok(
        renderAuthDescription(LL, createUser()).startsWith(
            LL.auth.description.user(LL.auth.types.username())
        )
    );
    assert.ok(
        renderAuthDescription(LL, null).startsWith(
            LL.auth.description.general() + LL.auth.description.guest()
        )
    );
});

test('feedback to the admin is escaped and carries the username (bug 11)', () => {
    const html = renderAdminFeedback(
        { id: 1, is_bot: false, first_name: '<Olena>', username: 'olena' },
        'I <3 the bot & <script>'
    );

    assert.equal(
        html,
        '#відгук від &lt;Olena&gt; @olena\n\nI &lt;3 the bot &amp; &lt;script&gt;'
    );
});

test('payments need at least five meaningful characters', () => {
    assert.equal(isValidPayments('1234'), false);
    assert.equal(isValidPayments('1 2 3 4 . , -'), false);
    assert.equal(isValidPayments('12345'), true);
    assert.equal(isValidPayments('mono: 4441 1111'), true);
});
