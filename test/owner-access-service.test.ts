import assert from 'node:assert/strict';
import test from 'node:test';

import { Effect } from 'effect';

import {
    createOwnerAccessService,
    isFindableOwner
} from '../src/bot/services/owner-access-service';
import type {
    Repositories,
    ShareRecord,
    UserRecord
} from '../src/db/repositories';

const now = new Date('2026-10-05T10:00:00Z');
const VIEWER_ID = 1;
const OWNER_ID = 2;

const createOwner = (overrides: Partial<UserRecord> = {}): UserRecord => {
    return {
        id: OWNER_ID,
        username: 'alice',
        usernameSearchable: true,
        phone: null,
        blockedAt: null,
        ...overrides
    } as UserRecord;
};

const createShare = (overrides: Partial<ShareRecord> = {}): ShareRecord => {
    return {
        userId: OWNER_ID,
        publicId: '01j9z0000000000000000000ab',
        displayName: 'Alice',
        showUsername: false,
        allowIndexing: true,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
};

interface FakeOptions {
    share?: ShareRecord | null;
    owner?: UserRecord | null;
    hasGive?: boolean;
}

const createService = (options: FakeOptions = {}) => {
    const shareLookups: number[] = [];
    const repositories = {
        gives: {
            hasVisibleWishOfOwner: () => {
                return Effect.succeed(options.hasGive ?? true);
            }
        },
        shares: {
            findActiveByUserId: (userId: number) => {
                shareLookups.push(userId);

                return Effect.succeed(options.share ?? null);
            }
        },
        users: {
            findById: () => {
                return Effect.succeed(
                    options.owner === undefined ? createOwner() : options.owner
                );
            }
        }
    } as unknown as Pick<Repositories, 'gives' | 'shares' | 'users'>;

    return { service: createOwnerAccessService(repositories), shareLookups };
};

test('an owner findable by username or phone is reachable without a share lookup', async () => {
    const byUsername = createService();
    const byPhone = createService();

    assert.deepEqual(
        await byUsername.service.resolve(VIEWER_ID, createOwner()),
        { kind: 'findable' }
    );
    assert.deepEqual(
        await byPhone.service.resolve(
            VIEWER_ID,
            createOwner({ usernameSearchable: false, phone: '+380501234567' })
        ),
        { kind: 'findable' }
    );
    assert.deepEqual(byUsername.shareLookups, []);
    assert.deepEqual(byPhone.shareLookups, []);
});

test('an owner hidden from search is reachable only through an active share link', async () => {
    const hidden = createOwner({ usernameSearchable: false });
    const share = createShare();

    assert.deepEqual(
        await createService({ share }).service.resolve(VIEWER_ID, hidden),
        { kind: 'shareOnly', share }
    );
    assert.equal(
        await createService({ share: null }).service.resolve(VIEWER_ID, hidden),
        null
    );
});

test('a blocked owner is unreachable even with a share link or a public username', async () => {
    const { service, shareLookups } = createService({
        share: createShare()
    });
    const blocked = createOwner({ blockedAt: now });
    const blockedAndHidden = createOwner({
        blockedAt: now,
        usernameSearchable: false
    });

    assert.equal(await service.resolve(VIEWER_ID, blocked), null);
    assert.equal(await service.resolve(VIEWER_ID, blockedAndHidden), null);
    assert.deepEqual(shareLookups, []);
});

test('a missing owner and the viewer themselves are unreachable', async () => {
    const { service } = createService({ share: createShare() });

    assert.equal(await service.resolve(VIEWER_ID, null), null);
    assert.equal(
        await service.resolve(VIEWER_ID, createOwner({ id: VIEWER_ID })),
        null
    );
});

test('a giver reaches only the owner of a wish they give', async () => {
    const reachable = createService({ hasGive: true });
    const forged = createService({ hasGive: false });
    const blocked = createService({
        owner: createOwner({ blockedAt: now })
    });
    const missing = createService({ owner: null });

    assert.deepEqual(
        await reachable.service.resolveForGiver(VIEWER_ID, OWNER_ID),
        { owner: createOwner(), access: { kind: 'findable' } }
    );
    assert.equal(
        await forged.service.resolveForGiver(VIEWER_ID, OWNER_ID),
        null
    );
    assert.equal(
        await blocked.service.resolveForGiver(VIEWER_ID, OWNER_ID),
        null
    );
    assert.equal(
        await missing.service.resolveForGiver(VIEWER_ID, OWNER_ID),
        null
    );
});

test('findability needs a searchable username or a phone and no block', () => {
    assert.equal(isFindableOwner(createOwner()), true);
    assert.equal(
        isFindableOwner(createOwner({ usernameSearchable: false })),
        false
    );
    assert.equal(
        isFindableOwner(
            createOwner({ usernameSearchable: false, phone: '+48512345678' })
        ),
        true
    );
    assert.equal(isFindableOwner(createOwner({ blockedAt: now })), false);
});
