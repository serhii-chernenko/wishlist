import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import type {
    ListImportKickRequest,
    ListImportService
} from '../../src/bot/services/list-import/types';
import type { ImportedWishRow, UserRecord } from '../../src/db/repositories';
import {
    LIST_IMPORT_LOAD_KICK_INTERVAL_MS,
    type BootstrapDto,
    type OwnerWishListDto,
    type SearchResultDto,
    type ShareDto,
    type SharedListDto,
    type WishListDto
} from '../../src/shared/app-api';
import { createApp } from '../../src/worker/app';
import type { WorkerBindings } from '../../src/worker/env';
import {
    createNodeApiCrypto,
    createSignedInitData,
    TEST_BOT_TOKEN,
    type InitDataUserFixture
} from '../fixtures/app-auth';
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const PENDING_URL = 'https://storage.rewish.io/pending-photo';

const OWNER: InitDataUserFixture = {
    id: 620_000_001,
    first_name: 'Owner',
    username: 'pending_owner',
    language_code: 'uk'
};
const VIEWER: InitDataUserFixture = {
    id: 620_000_002,
    first_name: 'Viewer',
    username: 'pending_viewer',
    language_code: 'uk'
};

const createRecordingService = () => {
    const kicks: ListImportKickRequest[] = [];
    const unexpected = async (): Promise<never> => {
        throw new Error('unexpected call');
    };
    const service: ListImportService = {
        preview: unexpected,
        setVisibility: unexpected,
        startCommit: unexpected,
        runCommit: unexpected,
        status: unexpected,
        cancel: unexpected,
        resumeStale: unexpected,
        drainPhotos: unexpected,
        prune: unexpected,
        async kick(_deps, request) {
            kicks.push(request);
        }
    };

    return { service, kicks };
};

describe('pending imported photos on list loads', () => {
    let harness: D1Harness;
    let recorder: ReturnType<typeof createRecordingService>;

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const env = (importEnabled = true): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            MINI_APP_ENABLED: 'true',
            ADMIN_ID: '1',
            WISHLIST_IMPORT_ENABLED: String(importEnabled),
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const call = (
        as: InitDataUserFixture,
        method: string,
        path: string,
        body?: unknown,
        importEnabled = true
    ) => {
        const deps = {
            now: () => NOW,
            crypto: createNodeApiCrypto(),
            selectLimiter: () => null,
            listImport: recorder.service,
            emitTelemetry: () => undefined
        };
        const headers = new Headers({
            Authorization: `tma ${createSignedInitData({ user: as, authDate: NOW_SECONDS })}`
        });

        if (body !== undefined) {
            headers.set('Content-Type', 'application/json');
        }

        return createApp({}, {}, { now: () => NOW }, deps, deps).request(
            `/api/app${path}`,
            {
                method,
                headers,
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            },
            env(importEnabled)
        );
    };

    const readJson = async <Body>(response: Response) => {
        assert.equal(response.status, 200);

        return (await response.json()) as Body;
    };

    const registerUser = async (
        fixture: InitDataUserFixture
    ): Promise<UserRecord> => {
        const created = await run(
            harness.repositories.users.create({
                telegramId: fixture.id,
                username: fixture.username ?? null,
                usernameSearchable: true,
                language: 'uk',
                currency: 'UAH',
                createdAt: NOW
            })
        );

        assert.ok(created);

        return created;
    };

    const importedRow = (
        userId: number,
        index: number,
        overrides: Partial<ImportedWishRow> = {}
    ): ImportedWishRow => {
        return {
            userId,
            title: `Imported ${index}`,
            description: null,
            link: null,
            price: 0,
            currency: 'UAH',
            hidden: false,
            removed: false,
            done: false,
            sourceRef: `rewish:wish:${index}`,
            sourceImageUrl: null,
            createdAt: NOW,
            updatedAt: new Date(NOW.getTime() - index),
            ...overrides
        };
    };

    const insertRows = async (rows: ImportedWishRow[]) => {
        await run(harness.repositories.wishes.insertImported(rows));
    };

    const publishShare = async (owner: UserRecord) => {
        await run(
            harness.repositories.users.setShowGifted(owner.id, true, NOW)
        );

        return readJson<ShareDto>(await call(OWNER, 'POST', '/share/publish'));
    };

    const findOwnerToken = async () => {
        const result = await readJson<SearchResultDto>(
            await call(VIEWER, 'POST', '/search', { query: '@pending_owner' })
        );

        assert.equal(result.status, 'found');
        assert.ok('owner' in result && result.owner.token);

        return result.owner.token;
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        recorder = createRecordingService();
        await harness.clearApplicationTables();
    });

    it('flags only wishes whose imported photo is still pending, without exposing the url', async () => {
        const owner = await registerUser(OWNER);

        await insertRows([
            importedRow(owner.id, 1, { sourceImageUrl: PENDING_URL }),
            importedRow(owner.id, 2)
        ]);

        const response = await call(OWNER, 'GET', '/wishes');
        const text = await response.clone().text();
        const list = await readJson<WishListDto>(response);

        assert.deepEqual(
            list.items.map(item => {
                return [item.title, item.photoPending ?? false];
            }),
            [
                ['Imported 1', true],
                ['Imported 2', false]
            ]
        );
        assert.equal(text.includes(PENDING_URL), false);
        assert.equal(text.includes('sourceImageUrl'), false);
    });

    it('kicks the owner drain with the lease hold when the owner loads their list with pending photos', async () => {
        const owner = await registerUser(OWNER);

        await insertRows([
            importedRow(owner.id, 1, { sourceImageUrl: PENDING_URL })
        ]);
        await call(OWNER, 'GET', '/wishes');

        assert.deepEqual(recorder.kicks, [
            {
                userId: owner.id,
                holdLeaseMs: LIST_IMPORT_LOAD_KICK_INTERVAL_MS
            }
        ]);
    });

    it('kicks on bootstrap too, and kicks for pending gifted rows nobody lists', async () => {
        const owner = await registerUser(OWNER);

        await insertRows([
            importedRow(owner.id, 1, {
                removed: true,
                done: true,
                sourceImageUrl: PENDING_URL
            })
        ]);
        await readJson<BootstrapDto>(await call(OWNER, 'GET', '/bootstrap'));

        assert.equal(recorder.kicks.length, 1);
        assert.equal(recorder.kicks[0]?.userId, owner.id);
    });

    it('does not kick without pending photos, without a registered user or with the import off', async () => {
        const owner = await registerUser(OWNER);

        await insertRows([importedRow(owner.id, 1)]);
        await call(OWNER, 'GET', '/wishes');
        await readJson<BootstrapDto>(await call(OWNER, 'GET', '/bootstrap'));
        await readJson<BootstrapDto>(await call(VIEWER, 'GET', '/bootstrap'));

        assert.deepEqual(recorder.kicks, []);

        await insertRows([
            importedRow(owner.id, 2, { sourceImageUrl: PENDING_URL })
        ]);
        await call(OWNER, 'GET', '/wishes', undefined, false);

        assert.deepEqual(recorder.kicks, []);
    });

    it('kicks the owner drain when a third-party viewer opens a list whose owner has pending photos', async () => {
        const owner = await registerUser(OWNER);

        await registerUser(VIEWER);
        await insertRows([
            importedRow(owner.id, 1, { sourceImageUrl: PENDING_URL })
        ]);

        const token = await findOwnerToken();
        const page = await readJson<OwnerWishListDto>(
            await call(VIEWER, 'GET', `/lists/${token}/wishes`)
        );

        assert.equal(page.items[0]?.photoPending, true);
        assert.deepEqual(recorder.kicks, [
            {
                userId: owner.id,
                holdLeaseMs: LIST_IMPORT_LOAD_KICK_INTERVAL_MS
            }
        ]);
    });

    it('counts only the gifted wishes visible to the viewer', async () => {
        const owner = await registerUser(OWNER);

        await registerUser(VIEWER);
        await insertRows([
            importedRow(owner.id, 1, { removed: true, done: true }),
            importedRow(owner.id, 2, { removed: true, done: true }),
            importedRow(owner.id, 3, {
                removed: true,
                done: true,
                hidden: true
            }),
            importedRow(owner.id, 4, { removed: true })
        ]);

        const hiddenFromViewers = await readJson<OwnerWishListDto>(
            await call(VIEWER, 'GET', `/lists/${await findOwnerToken()}/wishes`)
        );

        assert.equal(hiddenFromViewers.giftedTotal, 0);
        assert.equal(hiddenFromViewers.gifted, undefined);

        await run(
            harness.repositories.users.setShowGifted(owner.id, true, NOW)
        );

        const shown = await readJson<OwnerWishListDto>(
            await call(VIEWER, 'GET', `/lists/${await findOwnerToken()}/wishes`)
        );

        assert.equal(shown.total, 0);
        assert.equal(shown.giftedTotal, 2);
        assert.equal(shown.gifted?.length, 2);
    });

    it('reports the gifted total of a shared list as well', async () => {
        const owner = await registerUser(OWNER);

        await registerUser(VIEWER);
        await insertRows([
            importedRow(owner.id, 1),
            importedRow(owner.id, 2, { removed: true, done: true })
        ]);

        const share = await publishShare(owner);
        const publicId = share.url?.split('/').pop() ?? '';
        const shared = await readJson<SharedListDto>(
            await call(VIEWER, 'GET', `/shared/${publicId}`)
        );

        assert.equal(shared.giftedTotal, 1);
        assert.equal(shared.preview?.total, 1);
    });
});
