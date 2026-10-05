import assert from 'node:assert/strict';

import { Effect } from 'effect';

import type { UserRecord, WishRecord } from '../../src/db/repositories';
import type { TelemetryFields } from '../../src/worker/telemetry';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import type { D1Harness } from './d1-harness';

export const CONTACT_NOW = new Date('2026-10-04T12:00:00.000Z');
const CONTACT_NOW_SECONDS = Math.floor(CONTACT_NOW.getTime() / 1000);

export const FIXTURE_PHONE = '+380997531864';
export const FIXTURE_PHONE_DIGITS = '380997531864';
export const FIXTURE_PHONE_FORMATTED = '+380 99 753 18 64';
export const FIXTURE_PHONE_NATIONAL = '997531864';
export const FIXTURE_ADDRESS_TOKEN = 'Qzvrlockerx';
export const FIXTURE_ADDRESS = `${FIXTURE_ADDRESS_TOKEN} 4471\nLviv, Horodotska 9`;

/** Every rendering of the fixture phone and address that must never reach a forbidden surface. */
export const FIXTURE_SECRETS = [
    FIXTURE_PHONE,
    FIXTURE_PHONE_DIGITS,
    FIXTURE_PHONE_FORMATTED,
    FIXTURE_PHONE_NATIONAL,
    FIXTURE_ADDRESS_TOKEN,
    'Horodotska',
    `tel:+${FIXTURE_PHONE_DIGITS}`
] as const;

const stripSeparators = (value: string) => {
    return value.replace(/[\s\-().]/g, '');
};

export const assertNoContactLeak = (body: string, where: string) => {
    const compact = stripSeparators(body);

    for (const secret of FIXTURE_SECRETS) {
        assert.ok(
            !body.includes(secret) &&
                !compact.includes(stripSeparators(secret)),
            `${where} leaks ${secret}`
        );
    }
};

export const OWNER: InitDataUserFixture = {
    id: 610_000_001,
    first_name: 'Olena',
    username: 'olena_owner'
};

export const VIEWER: InitDataUserFixture = {
    id: 610_000_002,
    first_name: 'Viktor',
    username: 'viktor_viewer'
};

export const GUEST: InitDataUserFixture = {
    id: 610_000_003,
    first_name: 'Guest',
    username: 'guest_nobody'
};

export const createContactFixtures = (getHarness: () => D1Harness) => {
    const events: TelemetryFields[] = [];

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const env = (): WorkerBindings => {
        return {
            ...getHarness().env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            WISHLIST_TG_URL: 'https://t.me/wishlist_ua_bot',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const call = (
        as: InitDataUserFixture,
        method: string,
        path: string,
        body?: unknown
    ) => {
        const app = createApp(
            {},
            {},
            {},
            {
                now: () => CONTACT_NOW,
                crypto: createNodeApiCrypto(),
                emitTelemetry: (_env, _context, fields) => {
                    events.push(fields);
                }
            }
        );
        const headers = new Headers({
            Authorization: `tma ${createSignedInitData({ user: as, authDate: CONTACT_NOW_SECONDS })}`
        });

        if (body !== undefined) {
            headers.set('Content-Type', 'application/json');
        }

        return app.request(
            `/api/app${path}`,
            {
                method,
                headers,
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            },
            env()
        );
    };

    const registerUser = async (
        fixture: InitDataUserFixture,
        overrides: Partial<
            Parameters<D1Harness['repositories']['users']['create']>[0]
        > = {}
    ): Promise<UserRecord> => {
        const created = await run(
            getHarness().repositories.users.create({
                telegramId: fixture.id,
                username: fixture.username ?? null,
                usernameSearchable: true,
                createdAt: CONTACT_NOW,
                ...overrides
            })
        );

        assert.ok(created);

        return created;
    };

    const registerOwnerWithContact = async (
        disclosure: { showPhone: boolean; showAddress: boolean } = {
            showPhone: true,
            showAddress: true
        }
    ) => {
        const owner = await registerUser(OWNER, {
            phone: FIXTURE_PHONE,
            phoneDigits: FIXTURE_PHONE_DIGITS,
            payments: 'Jar payments-visible-marker'
        });
        const { users } = getHarness().repositories;

        await run(
            users.setDeliveryAddress(owner.id, FIXTURE_ADDRESS, CONTACT_NOW)
        );

        const updated = await run(
            users.setDisclosure(owner.id, disclosure, CONTACT_NOW)
        );

        assert.ok(updated);

        return updated;
    };

    const addWishes = async (
        userId: number,
        count: number
    ): Promise<WishRecord[]> => {
        const created: WishRecord[] = [];

        for (let index = 0; index < count; index += 1) {
            const wish = await run(
                getHarness().repositories.wishes.createWithFields(
                    userId,
                    { currency: 'UAH', title: `Wish ${index + 1}` },
                    CONTACT_NOW
                )
            );

            assert.ok(wish);
            created.push(wish);
        }

        return created;
    };

    const publishShare = async (userId: number) => {
        const share = await run(
            getHarness().repositories.shares.publish(
                userId,
                'Olena',
                CONTACT_NOW
            )
        );

        return share.publicId;
    };

    const findUser = async (id: number) => {
        const user = await run(getHarness().repositories.users.findById(id));

        assert.ok(user);

        return user;
    };

    return {
        events,
        run,
        call,
        registerUser,
        registerOwnerWithContact,
        addWishes,
        publishShare,
        findUser
    };
};
