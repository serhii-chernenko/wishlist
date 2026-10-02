import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';

import type { Repositories, WishRecord } from '../src/db/repositories';
import {
    createShareService,
    type ShareRequest
} from '../src/bot/services/share-service';
import {
    TelegraphError,
    type TelegraphClient
} from '../src/bot/telegraph/client';
import { i18nObject } from '../src/i18n/i18n-util';
import { loadLocale } from '../src/i18n/i18n-util.sync';

loadLocale('uk');
const LL = i18nObject('uk');
const now = new Date('2026-01-02T10:00:00Z');

const createWish = (overrides: Partial<WishRecord> = {}): WishRecord => {
    return {
        id: 1,
        mongoId: null,
        userId: 7,
        title: 'Кавоварка',
        description: null,
        link: null,
        images: '[]',
        priority: false,
        hidden: false,
        removed: false,
        done: false,
        price: 0,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
};

const createFakes = (wishes: WishRecord[]) => {
    const savedTokens: string[] = [];
    const repositories = {
        wishes: {
            listShareable: () => Effect.succeed(wishes)
        },
        users: {
            setTelegraphToken: (_id: number, token: string) => {
                savedTokens.push(token);

                return Effect.succeed(true);
            }
        }
    } as unknown as Pick<Repositories, 'wishes' | 'users'>;

    return { repositories, savedTokens };
};

const createRequest = (
    overrides: Partial<ShareRequest['user']> = {},
    username: string | null = 'serhii'
): ShareRequest => {
    return {
        user: {
            id: 7,
            payments: null,
            telegraphAccessToken: 'stored-token',
            ...overrides
        },
        author: { username, displayName: 'Serhii' },
        LL,
        formatMoney: value => String(value),
        formatDate: date => date.toISOString().slice(0, 10),
        botUrl: 'https://t.me/wishlist_ua_bot',
        donateLinks: []
    };
};

interface ClientCalls {
    accounts: Array<Parameters<TelegraphClient['createAccount']>[0]>;
    pages: Array<Parameters<TelegraphClient['createPage']>[0]>;
}

const createClient = (
    behavior: {
        pageErrors?: Array<TelegraphError | null>;
    } = {}
) => {
    const calls: ClientCalls = { accounts: [], pages: [] };
    const pageErrors = [...(behavior.pageErrors ?? [])];
    const client: TelegraphClient = {
        async createAccount(input) {
            calls.accounts.push(input);

            return `new-token-${calls.accounts.length}`;
        },
        async createPage(input) {
            calls.pages.push(input);

            const error = pageErrors.shift();

            if (error) {
                throw error;
            }

            return { url: 'https://telegra.ph/result' };
        }
    };

    return { client, calls };
};

test('an empty wishlist is reported without calling telegra.ph', async () => {
    const { repositories } = createFakes([]);
    const { client, calls } = createClient();
    const service = createShareService(repositories, client, () => now);

    assert.deepEqual(await service.publishWishlist(createRequest()), {
        status: 'empty'
    });
    assert.equal(calls.pages.length, 0);
});

test('a stored token publishes without creating an account', async () => {
    const { repositories, savedTokens } = createFakes([createWish()]);
    const { client, calls } = createClient();
    const service = createShareService(repositories, client, () => now);

    const outcome = await service.publishWishlist(createRequest());

    assert.deepEqual(outcome, {
        status: 'published',
        url: 'https://telegra.ph/result'
    });
    assert.equal(calls.accounts.length, 0);
    assert.equal(savedTokens.length, 0);
    assert.equal(calls.pages[0]?.accessToken, 'stored-token');
    assert.equal(calls.pages[0]?.title, 'Лист Бажань від Serhii');
    assert.equal(calls.pages[0]?.authorUrl, 'https://t.me/serhii');
});

test('a missing token creates and stores an account with the username', async () => {
    const { repositories, savedTokens } = createFakes([createWish()]);
    const { client, calls } = createClient();
    const service = createShareService(repositories, client, () => now);

    await service.publishWishlist(
        createRequest({ telegraphAccessToken: null })
    );

    assert.deepEqual(calls.accounts[0], {
        shortName: 'serhii',
        authorName: 'Serhii',
        authorUrl: 'https://t.me/serhii'
    });
    assert.deepEqual(savedTokens, ['new-token-1']);
    assert.equal(calls.pages[0]?.accessToken, 'new-token-1');
});

test('users without a username get the fallback short name and no author url', async () => {
    const { repositories } = createFakes([createWish()]);
    const { client, calls } = createClient();
    const service = createShareService(repositories, client, () => now);

    await service.publishWishlist(
        createRequest({ telegraphAccessToken: null }, null)
    );

    assert.deepEqual(calls.accounts[0], {
        shortName: 'wishlist',
        authorName: 'Serhii'
    });
    assert.equal('authorUrl' in (calls.pages[0] ?? {}), false);
});

test('an invalid token is replaced once and the page is retried', async () => {
    const { repositories, savedTokens } = createFakes([createWish()]);
    const { client, calls } = createClient({
        pageErrors: [
            new TelegraphError('invalid', { code: 'ACCESS_TOKEN_INVALID' })
        ]
    });
    const service = createShareService(repositories, client, () => now);

    const outcome = await service.publishWishlist(createRequest());

    assert.equal(outcome.status, 'published');
    assert.equal(calls.accounts.length, 1);
    assert.deepEqual(savedTokens, ['new-token-1']);
    assert.deepEqual(
        calls.pages.map(page => {
            return page.accessToken;
        }),
        ['stored-token', 'new-token-1']
    );
});

test('a second invalid token failure is not retried again', async () => {
    const { repositories } = createFakes([createWish()]);
    const invalid = new TelegraphError('invalid', {
        code: 'ACCESS_TOKEN_INVALID'
    });
    const { client, calls } = createClient({
        pageErrors: [invalid, invalid]
    });
    const service = createShareService(repositories, client, () => now);

    await assert.rejects(
        service.publishWishlist(createRequest()),
        TelegraphError
    );
    assert.equal(calls.pages.length, 2);
    assert.equal(calls.accounts.length, 1);
});

test('other telegraph failures are not retried', async () => {
    const { repositories } = createFakes([createWish()]);
    const { client, calls } = createClient({
        pageErrors: [new TelegraphError('flood', { code: 'FLOOD_WAIT_5' })]
    });
    const service = createShareService(repositories, client, () => now);

    await assert.rejects(
        service.publishWishlist(createRequest()),
        TelegraphError
    );
    assert.equal(calls.pages.length, 1);
    assert.equal(calls.accounts.length, 0);
});
