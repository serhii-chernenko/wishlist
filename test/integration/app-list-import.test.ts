import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Effect } from 'effect';

import type {
    ListImportPreviewRequest,
    ListImportService,
    ListImportStartRequest,
    ListImportStartResult
} from '../../src/bot/services/list-import/types';
import type {
    ApiErrorBody,
    ListImportPreviewDto,
    ListImportStatusDto
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
import { createD1Harness, type D1Harness } from './d1-harness';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const OWNER_TELEGRAM_ID = 6_001;
const OTHER_TELEGRAM_ID = 6_002;
const CLIENT_IP = '198.51.100.9';
const JOB_ID = 41;
const PROFILE_URL = 'https://rewish.io/tESt01/wishes';
const CODE_URL = 'https://rewish.io/tESt01/wishes?access_code=test-access-code';
const ACCESS_CODE = 'test-access-code';

const OWNER: InitDataUserFixture = {
    id: OWNER_TELEGRAM_ID,
    first_name: 'Owner',
    username: 'owner_user',
    language_code: 'en'
};
const OTHER: InitDataUserFixture = {
    id: OTHER_TELEGRAM_ID,
    first_name: 'Other',
    username: 'other_user',
    language_code: 'en'
};

const buildPreview = (
    patch: Partial<ListImportPreviewDto> = {}
): ListImportPreviewDto => {
    return {
        outcome: 'ok',
        jobId: JOB_ID,
        kind: 'wishes',
        counts: {
            found: 10,
            active: 7,
            gifted: 1,
            duplicates: 2,
            overLimit: 0,
            withoutPrice: 1,
            withoutPhoto: 2
        },
        suggestedVisibility: 'public',
        savedWishesNote: false,
        ...patch
    };
};

const buildStatus = (
    patch: Partial<ListImportStatusDto> = {}
): ListImportStatusDto => {
    return {
        jobId: JOB_ID,
        state: 'previewed',
        kind: 'wishes',
        visibility: 'public',
        planned: 8,
        created: 0,
        createdGifted: 0,
        photosPending: 0,
        failure: null,
        ...patch
    };
};

interface FakeJob {
    ownerId: number;
    status: ListImportStatusDto;
}

interface FakeListImport extends ListImportService {
    previewCalls: ListImportPreviewRequest[];
    startCalls: ListImportStartRequest[];
    runCalls: { jobId: number; trigger: string }[];
    statusCalls: { userId: number; jobId: number }[];
    kickCalls: { userId?: number }[];
    order: string[];
    jobs: Map<number, FakeJob>;
    nextPreview: ListImportPreviewDto;
    startOutcome:
        | Extract<ListImportStartResult, { ok: false }>['outcome']
        | null;
}

const unexpected = (name: string) => {
    return () => Promise.reject(new Error(`unexpected ${name}`));
};

const createFakeListImport = (): FakeListImport => {
    const fake: FakeListImport = {
        previewCalls: [],
        startCalls: [],
        runCalls: [],
        statusCalls: [],
        kickCalls: [],
        order: [],
        jobs: new Map(),
        nextPreview: buildPreview(),
        startOutcome: null,
        preview(_deps, request) {
            fake.previewCalls.push(request);

            return Promise.resolve(fake.nextPreview);
        },
        startCommit(_deps, request): Promise<ListImportStartResult> {
            fake.startCalls.push(request);

            const job = fake.jobs.get(request.jobId);

            if (job === undefined || job.ownerId !== request.userId) {
                return Promise.resolve({ ok: false, outcome: 'notFound' });
            }

            if (fake.startOutcome === 'busy') {
                return Promise.resolve({
                    ok: false,
                    outcome: 'busy',
                    jobId: null
                });
            }

            if (fake.startOutcome !== null) {
                return Promise.resolve({
                    ok: false,
                    outcome: fake.startOutcome
                });
            }

            job.status = { ...job.status, state: 'committing' };

            return Promise.resolve({ ok: true, status: job.status });
        },
        runCommit(_deps, request) {
            fake.runCalls.push({
                jobId: request.jobId,
                trigger: request.trigger
            });
            fake.order.push('run');

            const job = fake.jobs.get(request.jobId);

            if (job === undefined) {
                return Promise.resolve(null);
            }

            job.status = {
                ...job.status,
                state: 'done',
                created: job.status.planned
            };

            return Promise.resolve(job.status);
        },
        status(_deps, request) {
            fake.statusCalls.push(request);

            const job = fake.jobs.get(request.jobId);

            return Promise.resolve(
                job === undefined || job.ownerId !== request.userId
                    ? null
                    : job.status
            );
        },
        kick(_deps, request) {
            fake.kickCalls.push(request);
            fake.order.push('kick');

            return Promise.resolve();
        },
        setVisibility: unexpected('setVisibility'),
        cancel: unexpected('cancel'),
        resumeStale: unexpected('resumeStale'),
        drainPhotos: unexpected('drainPhotos'),
        prune: unexpected('prune')
    };

    return fake;
};

describe('Mini App list import endpoints', () => {
    let harness: D1Harness;
    let events: TelemetryFields[];
    let listImport: FakeListImport;
    let limiterAllows: boolean;
    let serviceWired: boolean;
    let ownerId: number;
    let otherId: number;

    const run = <A>(effect: Effect.Effect<A, Error>) => {
        return Effect.runPromise(effect);
    };

    const buildEnv = (): WorkerBindings => {
        return {
            ...harness.env,
            BOT_TOKEN: TEST_BOT_TOKEN,
            BOT_ENVIRONMENT: 'production',
            ADMIN_ID: '1',
            APP_API_LIMITER: undefined,
            APP_SENSITIVE_LIMITER: undefined,
            APP_UPLOAD_LIMITER: undefined,
            APP_IMPORT_LIMITER: undefined,
            IMAGE_PROXY_LIMITER: undefined
        } as unknown as WorkerBindings;
    };

    const request = (
        path: string,
        init: {
            method?: string;
            user?: InitDataUserFixture;
            body?: unknown;
        } = {}
    ) => {
        const deps = {
            now: () => NOW,
            crypto: createNodeApiCrypto(),
            ...(serviceWired ? { listImport } : {}),
            selectLimiter: (_env: unknown, bucket: string) => {
                return bucket === 'import' && !limiterAllows
                    ? { limit: () => Promise.resolve({ success: false }) }
                    : null;
            },
            emitTelemetry: (
                _env: unknown,
                _context: unknown,
                fields: TelemetryFields
            ) => {
                events.push(fields);
            }
        };
        const app = createApp({}, {}, {}, deps, deps);
        const headers = new Headers({
            'cf-connecting-ip': CLIENT_IP,
            'Content-Type': 'application/json',
            Authorization: `tma ${createSignedInitData({
                user: init.user ?? OWNER,
                authDate: NOW_SECONDS
            })}`
        });

        return app.request(
            path,
            {
                method: init.method ?? 'POST',
                headers,
                ...(init.body === undefined
                    ? {}
                    : { body: JSON.stringify(init.body) })
            },
            buildEnv()
        );
    };

    const previewImport = (
        body: unknown = { url: PROFILE_URL },
        user: InitDataUserFixture = OWNER
    ) => {
        return request('/api/app/list-import/preview', { user, body });
    };

    const commitImport = (
        jobId: number | string = JOB_ID,
        body: unknown = { visibility: 'hidden' },
        user: InitDataUserFixture = OWNER
    ) => {
        return request(`/api/app/list-import/${jobId}/commit`, {
            user,
            body
        });
    };

    const readStatus = (
        jobId: number | string = JOB_ID,
        user: InitDataUserFixture = OWNER
    ) => {
        return request(`/api/app/list-import/${jobId}`, {
            method: 'GET',
            user
        });
    };

    const readError = async (response: Response) => {
        return ((await response.json()) as ApiErrorBody).error;
    };

    const seedJob = (patch: Partial<ListImportStatusDto> = {}) => {
        listImport.jobs.set(JOB_ID, {
            ownerId,
            status: buildStatus(patch)
        });
    };

    const createUser = async (telegramId: number, username: string) => {
        const created = await run(
            harness.repositories.users.create({
                telegramId,
                username,
                usernameSearchable: true,
                createdAt: NOW
            })
        );

        assert.ok(created);

        return created.id;
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
        listImport = createFakeListImport();
        limiterAllows = true;
        serviceWired = true;
        await harness.clearApplicationTables();
        ownerId = await createUser(OWNER_TELEGRAM_ID, 'owner_user');
        otherId = await createUser(OTHER_TELEGRAM_ID, 'other_user');
    });

    afterEach(() => {
        listImport.jobs.clear();
    });

    describe('POST /list-import/preview', () => {
        it('returns the service preview and passes the canonical url, user and channel', async () => {
            const response = await previewImport({
                url: 'rewish.io/tESt01?utm_source=tg'
            });

            assert.equal(response.status, 200);
            assert.deepEqual(
                (await response.json()) as ListImportPreviewDto,
                buildPreview()
            );
            assert.deepEqual(listImport.previewCalls, [
                {
                    userId: ownerId,
                    channel: 'app',
                    url: {
                        source: 'rewish',
                        kind: 'wishes',
                        slug: 'tESt01',
                        url: PROFILE_URL
                    }
                }
            ]);
        });

        it('keeps the access code in the parsed url handed to the service', async () => {
            await previewImport({ url: CODE_URL });

            assert.equal(
                listImport.previewCalls[0]?.url.accessCode,
                ACCESS_CODE
            );
            assert.equal(listImport.previewCalls[0]?.url.url, CODE_URL);
        });

        it('carries a failed outcome in a 200 body', async () => {
            listImport.nextPreview = buildPreview({
                outcome: 'userNotFound',
                jobId: null,
                kind: null,
                counts: null
            });

            const response = await previewImport();
            const body = (await response.json()) as ListImportPreviewDto;

            assert.equal(response.status, 200);
            assert.equal(body.outcome, 'userNotFound');
            assert.equal(body.jobId, null);
        });

        it('emits a previewed event with closed labels and no url', async () => {
            await previewImport({ url: CODE_URL });

            const previewed = events.filter(event => {
                return event.event === 'list_import_previewed';
            });

            assert.equal(previewed.length, 1);
            assert.equal(previewed[0]?.channel, 'app');
            assert.equal(previewed[0]?.source, 'rewish');
            assert.equal(previewed[0]?.kind, 'wishes');
            assert.equal(previewed[0]?.itemsBucket, 'tenToFortyNine');
            assert.equal(previewed[0]?.duplicatesBucket, 'oneToNine');
            assert.equal(JSON.stringify(events).includes(ACCESS_CODE), false);
            assert.equal(JSON.stringify(events).includes('tESt01'), false);
        });

        it('rejects a link that is not a rewish list with a url field error', async () => {
            const response = await previewImport({
                url: 'https://example.com/tESt01'
            });

            assert.equal(response.status, 422);
            assert.deepEqual((await readError(response)).fields, {
                url: 'invalid'
            });
            assert.deepEqual(listImport.previewCalls, []);
        });

        it('rejects a missing url', async () => {
            const response = await previewImport({});

            assert.equal(response.status, 422);
            assert.deepEqual((await readError(response)).fields, {
                url: 'required'
            });
        });

        it('rejects with 429 on the user import limiter before the service runs', async () => {
            limiterAllows = false;

            const response = await previewImport();

            assert.equal(response.status, 429);
            assert.deepEqual(await readError(response), {
                code: 'rateLimited',
                retryAfter: 60
            });
            assert.deepEqual(listImport.previewCalls, []);
        });

        it('answers not implemented when the service is not wired', async () => {
            serviceWired = false;

            const response = await previewImport();

            assert.equal(response.status, 501);
        });
    });

    describe('POST /list-import/:id/commit', () => {
        it('starts the commit with the chosen visibility, runs it in the background and kicks after it', async () => {
            seedJob();

            const response = await commitImport(JOB_ID, {
                visibility: 'public'
            });
            const body = (await response.json()) as ListImportStatusDto;

            assert.equal(response.status, 200);
            assert.equal(body.state, 'committing');
            assert.equal(body.failure, null);
            assert.deepEqual(listImport.startCalls, [
                {
                    userId: ownerId,
                    jobId: JOB_ID,
                    visibility: 'public',
                    chatMessageId: null
                }
            ]);
            assert.deepEqual(listImport.runCalls, [
                { jobId: JOB_ID, trigger: 'request' }
            ]);
            assert.deepEqual(listImport.kickCalls, [{ userId: ownerId }]);
            assert.deepEqual(listImport.order, ['run', 'kick']);
        });

        it('rejects a visibility outside hidden and public', async () => {
            seedJob();

            const response = await commitImport(JOB_ID, {
                visibility: 'friends'
            });

            assert.equal(response.status, 422);
            assert.deepEqual((await readError(response)).fields, {
                visibility: 'invalid'
            });
            assert.deepEqual(listImport.startCalls, []);
        });

        it('rejects a missing visibility', async () => {
            seedJob();

            const response = await commitImport(JOB_ID, {});

            assert.equal(response.status, 422);
            assert.deepEqual((await readError(response)).fields, {
                visibility: 'required'
            });
        });

        it("answers 404 for another user's job and never runs it", async () => {
            seedJob();

            const response = await commitImport(JOB_ID, undefined, OTHER);

            assert.equal(response.status, 404);
            assert.deepEqual(await readError(response), { code: 'notFound' });
            assert.deepEqual(listImport.runCalls, []);
            assert.deepEqual(listImport.kickCalls, []);
            assert.equal(listImport.jobs.get(JOB_ID)?.ownerId, ownerId);
            assert.notEqual(otherId, ownerId);
        });

        it('answers 404 for a job that does not exist or an id that is not a number', async () => {
            assert.equal((await commitImport(999)).status, 404);
            assert.equal((await commitImport('abc')).status, 404);
            assert.deepEqual(listImport.startCalls.length, 1);
        });

        it('reports a running import as busy on the job status without running it', async () => {
            seedJob();
            listImport.startOutcome = 'busy';

            const response = await commitImport();
            const body = (await response.json()) as ListImportStatusDto;

            assert.equal(response.status, 200);
            assert.equal(body.state, 'previewed');
            assert.equal(body.failure, 'busy');
            assert.deepEqual(listImport.runCalls, []);
            assert.deepEqual(listImport.kickCalls, []);
        });

        it('reports an outdated preview as expired', async () => {
            seedJob({ state: 'expired' });
            listImport.startOutcome = 'expired';

            const response = await commitImport();
            const body = (await response.json()) as ListImportStatusDto;

            assert.equal(response.status, 200);
            assert.equal(body.state, 'expired');
            assert.equal(body.failure, 'expired');
            assert.deepEqual(listImport.runCalls, []);
        });
    });

    describe('GET /list-import/:id', () => {
        it('returns the status of the own job and kicks while it is committing', async () => {
            seedJob({ state: 'committing', created: 3 });

            const response = await readStatus();
            const body = (await response.json()) as ListImportStatusDto;

            assert.equal(response.status, 200);
            assert.equal(body.state, 'committing');
            assert.equal(body.created, 3);
            assert.deepEqual(listImport.statusCalls, [
                { userId: ownerId, jobId: JOB_ID }
            ]);
            assert.deepEqual(listImport.kickCalls, [{ userId: ownerId }]);
        });

        it('kicks while photos are pending after the commit is done', async () => {
            seedJob({ state: 'done', created: 8, photosPending: 5 });

            const response = await readStatus();

            assert.equal(response.status, 200);
            assert.deepEqual(listImport.kickCalls, [{ userId: ownerId }]);
        });

        it('does not kick for a settled job with nothing left to load', async () => {
            seedJob({ state: 'done', created: 8, photosPending: 0 });

            const response = await readStatus();

            assert.equal(response.status, 200);
            assert.deepEqual(listImport.kickCalls, []);
        });

        it("answers 404 for another user's job without kicking", async () => {
            seedJob({ state: 'committing' });

            const response = await readStatus(JOB_ID, OTHER);

            assert.equal(response.status, 404);
            assert.deepEqual(await readError(response), { code: 'notFound' });
            assert.deepEqual(listImport.kickCalls, []);
        });

        it('answers 404 for an unknown job', async () => {
            assert.equal((await readStatus(999)).status, 404);
        });
    });
});
