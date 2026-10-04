import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { SentPhotoMessage, TelegramApi } from '../../src/api/telegram-api';
import {
    createListImportService,
    type ListImportServiceOptions
} from '../../src/bot/services/list-import/list-import-service';
import {
    createListImportStore,
    type ListImportStore
} from '../../src/bot/services/list-import/store';
import type { ListImportDeps } from '../../src/bot/services/list-import/types';
import {
    buildImportedWishInsert,
    type ImportedWishRow
} from '../../src/db/repositories/wish-repository';
import {
    LIST_IMPORT_INSERT_ROWS_PER_STATEMENT,
    LIST_IMPORT_LEASE_MS,
    LIST_IMPORT_PREVIEW_TTL_MS,
    LIST_IMPORT_PRUNE_AFTER_MS,
    type ListImportStatusDto
} from '../../src/shared/app-api';
import { parseListImportUrl } from '../../src/shared/list-import-url';
import type { TelemetryFields } from '../../src/worker/telemetry';
import { JPEG_BYTES } from '../fixtures/link-import-fakes';
import { countRows, createD1Harness, type D1Harness } from './d1-harness';

const D1_PARAMETER_CEILING = 100;
const START = Date.parse('2026-10-04T12:00:00.000Z');
const USER_UUID = '00000000-0000-0000-0000-000000000002';
const PROFILE_URL = 'https://rewish.io/tESt01/wishes?access_code=test~code';

interface RewishWishSeed {
    id: number;
    title: string;
    status?: number;
    avatarPath?: string | null;
}

const toRewishWish = (seed: RewishWishSeed, position: number) => {
    return {
        id: seed.id,
        re_wish_id: 318652,
        title: seed.title,
        description: '',
        avatar_path:
            seed.avatarPath === undefined
                ? `https://storage.rewish.io/00000000-0000-0000-0000-${String(seed.id).padStart(12, '0')}_compressed`
                : seed.avatarPath,
        purchase_link: null,
        price: 100,
        currency: 1,
        status: seed.status ?? 1,
        position
    };
};

const envelope = (value: unknown) => {
    return { value, is_success: true, errors: [] };
};

const jsonResponse = (body: unknown) => {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    });
};

const createRewishFetch = (wishes: () => RewishWishSeed[]) => {
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async input => {
        const url = new URL(String(input));

        calls.push(url.pathname);

        if (url.hostname === 'storage.rewish.io') {
            return new Response(JPEG_BYTES.slice(), {
                status: 200,
                headers: { 'content-type': 'image/jpeg' }
            });
        }

        if (url.pathname.startsWith('/public/api/user/by-code/')) {
            return jsonResponse(envelope({ id: USER_UUID }));
        }

        if (url.pathname.startsWith('/public/api/re-wish/')) {
            return jsonResponse(envelope([{ id: 318652, wishes_count: 1 }]));
        }

        if (url.pathname === '/public/api/wish/by-rewish-id') {
            return jsonResponse(envelope(wishes().map(toRewishWish)));
        }

        return new Response('not found', { status: 404 });
    };

    return { fakeFetch, calls };
};

const seedWishes = (count: number, offset = 0): RewishWishSeed[] => {
    return Array.from({ length: count }, (_, index) => {
        return {
            id: 1000 + offset + index,
            title: `Imported ${offset + index}`
        };
    });
};

const createTelegram = () => {
    const sent: (number | string)[] = [];
    const edits: { chatId: number | string; text: string }[] = [];
    let messageId = 0;
    const telegram: TelegramApi = {
        async sendMessage() {
            throw new Error('unexpected sendMessage');
        },
        async sendPhoto(chatId) {
            messageId += 1;
            sent.push(chatId);

            return {
                message_id: messageId,
                photo: [{ file_id: `tg-${messageId}`, width: 800, height: 800 }]
            } as unknown as SentPhotoMessage;
        },
        async sendMediaGroup() {
            throw new Error('unexpected sendMediaGroup');
        },
        async editMessageText(chatId, _messageId, text) {
            edits.push({ chatId, text });

            return true;
        },
        async deleteMessage() {
            return true;
        },
        async getFile() {
            throw new Error('unexpected getFile');
        },
        async downloadFile() {
            throw new Error('unexpected downloadFile');
        }
    };

    return { telegram, sent, edits };
};

describe('list import repository and service on D1', () => {
    let harness: D1Harness;
    let store: ListImportStore;
    const clock = { now: START };

    const insertUser = async (telegramId: number, currency = 'UAH') => {
        const row = await harness.env.DB.prepare(
            'INSERT INTO users (telegram_id, currency, created_at, updated_at) VALUES (?, ?, 0, 0) RETURNING id'
        )
            .bind(telegramId, currency)
            .first<{ id: number }>();

        assert.ok(row);

        return row.id;
    };

    const workerEnv = () => {
        return {
            ...harness.env,
            LINK_HOST_LIMITER: undefined,
            WISHLIST_IMPORT_ENABLED: 'true'
        } as unknown as typeof harness.env;
    };

    const createDeps = (
        fakeFetch: typeof fetch,
        telegram?: TelegramApi
    ): ListImportDeps => {
        return {
            env: workerEnv(),
            fetch: fakeFetch,
            now: () => {
                return clock.now;
            },
            async sleep(milliseconds) {
                clock.now += milliseconds;
            },
            ...(telegram === undefined ? {} : { telegram })
        };
    };

    const createService = (
        events: TelemetryFields[] = [],
        options: ListImportServiceOptions = {}
    ) => {
        return createListImportService({
            createFlowId: () => {
                return 'flow';
            },
            emitTelemetry: (_env, _context, fields) => {
                events.push(fields);
            },
            ...options
        });
    };

    const parsedProfileUrl = () => {
        const parsed = parseListImportUrl(PROFILE_URL);

        assert.ok(parsed);

        return parsed;
    };

    const importedRow = (
        userId: number,
        index: number,
        overrides: Partial<ImportedWishRow> = {}
    ): ImportedWishRow => {
        return {
            userId,
            title: `Row ${index}`,
            description: null,
            link: null,
            price: 0,
            currency: 'UAH',
            hidden: false,
            removed: false,
            done: false,
            sourceRef: `rewish:wish:${index}`,
            sourceImageUrl: null,
            createdAt: new Date(START),
            updatedAt: new Date(START - index),
            ...overrides
        };
    };

    const readWishes = async (userId: number) => {
        const { results } = await harness.env.DB.prepare(
            'SELECT id, title, hidden, removed, done, gifted_hidden, source_ref, source_image_url, images, currency, price FROM wishes WHERE user_id = ? ORDER BY updated_at DESC, id DESC'
        )
            .bind(userId)
            .all<{
                id: number;
                title: string;
                hidden: number;
                removed: number;
                done: number;
                gifted_hidden: number;
                source_ref: string | null;
                source_image_url: string | null;
                images: string;
                currency: string;
                price: number;
            }>();

        return results;
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
        store = createListImportStore(harness.repositories);
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        clock.now = START;
        await harness.clearApplicationTables();
    });

    it('binds at most 100 parameters per imported-wish insert', () => {
        const rows = Array.from(
            { length: LIST_IMPORT_INSERT_ROWS_PER_STATEMENT },
            (_, index) => {
                return importedRow(1, index);
            }
        );
        const statement = buildImportedWishInsert(harness.db, rows).toSQL();

        assert.equal(statement.params.length, 13 * rows.length);
        assert.ok(statement.params.length <= D1_PARAMETER_CEILING);
    });

    it('inserts imported wishes idempotently by owner and source ref', async () => {
        const userId = await insertUser(1);
        const rows = Array.from({ length: 10 }, (_, index) => {
            return importedRow(userId, index);
        });

        assert.equal(await store.wishes.insertImported(rows), 10);
        assert.equal(await store.wishes.insertImported(rows), 0);
        assert.equal(await countRows(harness, 'wishes'), 10);

        const [first] = await readWishes(userId);

        assert.equal(first?.images, '[]');
    });

    it('lists dedupe keys of every wish, removed and gifted included', async () => {
        const userId = await insertUser(1);

        await store.wishes.insertImported([
            importedRow(userId, 1),
            importedRow(userId, 2, { removed: true, done: true }),
            importedRow(userId, 3, { removed: true })
        ]);

        const keys = await store.wishes.listDedupeKeys(userId);

        assert.equal(keys.length, 3);
    });

    it('previews, commits and drains a profile end to end', async () => {
        const userId = await insertUser(4242, 'PLN');
        const items: RewishWishSeed[] = [
            ...seedWishes(3),
            { id: 2000, title: 'Gifted one', status: 3 },
            { id: 2001, title: 'No photo', avatarPath: null }
        ];
        const { fakeFetch } = createRewishFetch(() => {
            return items;
        });
        const { telegram, sent } = createTelegram();
        const events: TelemetryFields[] = [];
        const service = createService(events);
        const deps = createDeps(fakeFetch, telegram);
        const preview = await service.preview(deps, {
            userId,
            url: parsedProfileUrl(),
            channel: 'app'
        });

        assert.equal(preview.outcome, 'ok');
        assert.equal(preview.kind, 'wishes');
        assert.equal(preview.suggestedVisibility, 'hidden');
        assert.equal(preview.savedWishesNote, true);
        assert.deepEqual(preview.counts, {
            found: 5,
            active: 4,
            gifted: 1,
            duplicates: 0,
            overLimit: 0,
            withoutPrice: 0,
            withoutPhoto: 1
        });
        assert.equal(await countRows(harness, 'wishes'), 0);

        const jobId = preview.jobId as number;
        const job = await store.jobs.findById(jobId);

        assert.equal(job?.sourceUrl, PROFILE_URL);

        assert.equal(
            await service.setVisibility(deps, {
                userId,
                jobId,
                visibility: 'hidden'
            }),
            'ok'
        );

        const started = await service.startCommit(deps, {
            userId,
            jobId,
            visibility: 'hidden',
            chatMessageId: null
        });

        assert.equal(started.ok, true);

        const progress: ListImportStatusDto[] = [];
        const finished = await service.runCommit(deps, {
            jobId,
            trigger: 'request',
            async onProgress(status) {
                progress.push(status);
            }
        });

        assert.equal(finished?.state, 'done');
        assert.equal(finished?.created, 5);
        assert.equal(finished?.createdGifted, 1);
        assert.equal(finished?.photosPending, 4);
        assert.equal(progress.length, 1);
        assert.equal((await store.jobs.findById(jobId))?.sourceUrl, null);

        const wishes = await readWishes(userId);

        assert.deepEqual(
            wishes.map(wish => {
                return [wish.source_ref, wish.hidden, wish.removed, wish.done];
            }),
            [
                ['rewish:wish:1000', 1, 0, 0],
                ['rewish:wish:1001', 1, 0, 0],
                ['rewish:wish:1002', 1, 0, 0],
                ['rewish:wish:2001', 1, 0, 0],
                ['rewish:wish:2000', 1, 1, 1]
            ]
        );
        assert.equal(wishes[0]?.currency, 'UAH');

        const completed = events.filter(event => {
            return event.event === 'list_import_completed';
        });

        assert.equal(completed.length, 1);
        assert.equal(completed[0]?.channel, 'app');
        assert.equal(completed[0]?.trigger, 'request');
        assert.equal(completed[0]?.createdBucket, 'oneToNine');

        const summary = await service.drainPhotos(deps, {
            budgetMs: 60_000,
            trigger: 'kick'
        });

        assert.deepEqual(summary, {
            result: 'drained',
            ingested: 4,
            failed: 0
        });
        assert.deepEqual(sent, [4242, 4242, 4242, 4242]);

        const drained = await readWishes(userId);

        assert.ok(
            drained.every(wish => {
                return wish.source_image_url === null;
            })
        );
        assert.deepEqual(
            JSON.parse(
                drained.find(wish => {
                    return wish.source_ref === 'rewish:wish:2000';
                })?.images ?? '[]'
            ),
            ['tg-4']
        );
        assert.deepEqual(
            drained.map(wish => {
                return wish.source_ref;
            }),
            wishes.map(wish => {
                return wish.source_ref;
            })
        );

        const again = await service.preview(deps, {
            userId,
            url: parsedProfileUrl(),
            channel: 'app'
        });

        assert.equal(again.outcome, 'empty');
        assert.equal(again.counts?.duplicates, 5);
    });

    it('refuses a second commit while one is running and expires old previews', async () => {
        const userId = await insertUser(5);
        const { fakeFetch } = createRewishFetch(() => {
            return seedWishes(2);
        });
        const service = createService();
        const deps = createDeps(fakeFetch);
        const first = await service.preview(deps, {
            userId,
            url: parsedProfileUrl(),
            channel: 'bot'
        });
        const second = await service.preview(deps, {
            userId,
            url: parsedProfileUrl(),
            channel: 'bot'
        });

        assert.equal(
            (await store.jobs.findById(first.jobId as number))?.state,
            'expired'
        );
        assert.equal(
            (await store.jobs.findById(first.jobId as number))?.sourceUrl,
            null
        );

        const started = await service.startCommit(deps, {
            userId,
            jobId: second.jobId as number,
            visibility: 'public',
            chatMessageId: 77
        });

        assert.equal(started.ok, true);

        const third = await service.preview(deps, {
            userId,
            url: parsedProfileUrl(),
            channel: 'bot'
        });

        assert.equal(third.outcome, 'busy');

        await harness.env.DB.prepare(
            "INSERT INTO list_imports (user_id, source, kind, channel, state, visibility, created_at, updated_at) VALUES (?, 'rewish', 'wishes', 'bot', 'previewed', 'public', ?, ?)"
        )
            .bind(userId, clock.now, clock.now)
            .run();

        const { results } = await harness.env.DB.prepare(
            "SELECT id FROM list_imports WHERE state = 'previewed'"
        ).all<{ id: number }>();
        const raced = await service.startCommit(deps, {
            userId,
            jobId: results[0]?.id as number,
            visibility: 'public',
            chatMessageId: null
        });

        assert.deepEqual(raced, { ok: false, outcome: 'busy' });

        const racedDirectly = await store.jobs.startCommit({
            jobId: results[0]?.id as number,
            userId,
            visibility: 'public',
            chatMessageId: null,
            leaseUntil: new Date(clock.now + LIST_IMPORT_LEASE_MS),
            now: new Date(clock.now)
        });

        assert.deepEqual(racedDirectly, { outcome: 'busy' });
    });

    it('gates foreign, expired and cancelled jobs', async () => {
        const owner = await insertUser(6);
        const stranger = await insertUser(7);
        const { fakeFetch } = createRewishFetch(() => {
            return seedWishes(1);
        });
        const service = createService();
        const deps = createDeps(fakeFetch);
        const preview = await service.preview(deps, {
            userId: owner,
            url: parsedProfileUrl(),
            channel: 'bot'
        });
        const jobId = preview.jobId as number;

        assert.equal(
            await service.status(deps, { userId: stranger, jobId }),
            null
        );
        assert.equal(
            await service.cancel(deps, { userId: stranger, jobId }),
            'notFound'
        );

        clock.now += LIST_IMPORT_PREVIEW_TTL_MS;

        const expired = await service.startCommit(deps, {
            userId: owner,
            jobId,
            visibility: 'public',
            chatMessageId: null
        });

        assert.deepEqual(expired, { ok: false, outcome: 'expired' });
        assert.equal(
            (await service.status(deps, { userId: owner, jobId }))?.state,
            'expired'
        );

        const fresh = await service.preview(deps, {
            userId: owner,
            url: parsedProfileUrl(),
            channel: 'bot'
        });

        assert.equal(
            await service.cancel(deps, {
                userId: owner,
                jobId: fresh.jobId as number
            }),
            'ok'
        );
        assert.equal(
            await service.setVisibility(deps, {
                userId: owner,
                jobId: fresh.jobId as number,
                visibility: 'hidden'
            }),
            'expired'
        );
    });

    it('resumes an evicted commit without duplicates and edits the bot message', async () => {
        const userId = await insertUser(8);
        const { fakeFetch } = createRewishFetch(() => {
            return seedWishes(60);
        });
        const { telegram, edits } = createTelegram();
        let steps = 0;
        const evictingStore = (env: ListImportDeps['env']) => {
            const real = createListImportStore(harness.repositories);

            void env;

            return {
                ...real,
                jobs: {
                    ...real.jobs,
                    recordCommitStep: (
                        input: Parameters<typeof real.jobs.recordCommitStep>[0]
                    ) => {
                        steps += 1;

                        return steps === 2
                            ? new Promise<never>(() => {
                                  return undefined;
                              })
                            : real.jobs.recordCommitStep(input);
                    }
                }
            } as ListImportStore;
        };
        const events: TelemetryFields[] = [];
        const evicting = createService(events, { createStore: evictingStore });
        const deps = createDeps(fakeFetch, telegram);
        const preview = await evicting.preview(deps, {
            userId,
            url: parsedProfileUrl(),
            channel: 'bot'
        });
        const jobId = preview.jobId as number;

        await evicting.startCommit(deps, {
            userId,
            jobId,
            visibility: 'public',
            chatMessageId: 555
        });

        void evicting.runCommit(deps, { jobId, trigger: 'request' });

        for (let attempt = 0; attempt < 50 && steps < 2; attempt += 1) {
            await new Promise(resolve => {
                setTimeout(resolve, 20);
            });
        }

        assert.equal(steps, 2);
        assert.equal(await countRows(harness, 'wishes'), 49);
        assert.equal((await store.jobs.findById(jobId))?.created, 49);

        const resumer = createService(events);

        assert.equal(await resumer.resumeStale(deps, {}), 0);

        clock.now += LIST_IMPORT_LEASE_MS + 1;

        assert.equal(await resumer.resumeStale(deps, {}), 1);

        const job = await store.jobs.findById(jobId);

        assert.equal(job?.state, 'done');
        assert.equal(job?.created, 60);
        assert.equal(job?.planned, 60);
        assert.equal(job?.attempts, 2);
        assert.equal(await countRows(harness, 'wishes'), 60);
        assert.equal(edits.length, 1);
        assert.equal(edits[0]?.chatId, 8);
        assert.match(edits[0]?.text ?? '', /60/);

        const resumed = events.find(event => {
            return (
                event.event === 'list_import_completed' &&
                event.trigger === 'resume'
            );
        });

        assert.equal(resumed?.channel, 'bot');
    });

    it('fails a commit that keeps getting evicted after three attempts', async () => {
        const userId = await insertUser(9);
        const { fakeFetch } = createRewishFetch(() => {
            return seedWishes(1);
        });
        const service = createService();
        const deps = createDeps(fakeFetch);
        const preview = await service.preview(deps, {
            userId,
            url: parsedProfileUrl(),
            channel: 'app'
        });

        await service.startCommit(deps, {
            userId,
            jobId: preview.jobId as number,
            visibility: 'public',
            chatMessageId: null
        });
        await harness.env.DB.prepare(
            'UPDATE list_imports SET attempts = 3, lease_until = ? WHERE id = ?'
        )
            .bind(clock.now - 1, preview.jobId)
            .run();

        assert.equal(await service.resumeStale(deps, {}), 0);

        const job = await store.jobs.findById(preview.jobId as number);

        assert.equal(job?.state, 'failed');
        assert.equal(job?.failure, 'timeout');
        assert.equal(job?.sourceUrl, null);
    });

    it('drains only owners with a finished import, so preview-copied pending URLs stay untouched', async () => {
        const copiedOwner = await insertUser(10);
        const importer = await insertUser(11);

        await store.wishes.insertImported([
            importedRow(copiedOwner, 1, {
                sourceImageUrl: 'https://storage.rewish.io/copied'
            }),
            importedRow(importer, 2, {
                sourceImageUrl: 'https://storage.rewish.io/mine'
            })
        ]);

        assert.deepEqual(await store.jobs.listDrainCandidates(10), []);

        await harness.env.DB.prepare(
            "INSERT INTO list_imports (user_id, source, kind, channel, state, visibility, created_at, updated_at) VALUES (?, 'rewish', 'wishes', 'app', 'done', 'public', 0, 0), (?, 'rewish', 'wishes', 'app', 'committing', 'public', 0, 0)"
        )
            .bind(importer, copiedOwner)
            .run();

        const candidates = await store.jobs.listDrainCandidates(10);

        assert.deepEqual(
            candidates.map(candidate => {
                return [candidate.userId, candidate.telegramId];
            }),
            [[importer, 11]]
        );

        const leaseJobId = candidates[0]?.leaseJobId as number;
        const leaseUntil = new Date(clock.now + 60_000);

        assert.equal(
            await store.jobs.acquireDrainLease(
                leaseJobId,
                new Date(clock.now),
                leaseUntil
            ),
            true
        );
        assert.equal(
            await store.jobs.acquireDrainLease(
                leaseJobId,
                new Date(clock.now),
                leaseUntil
            ),
            false
        );

        await store.jobs.releaseDrainLease(leaseJobId, leaseUntil);

        assert.equal(
            await store.jobs.acquireDrainLease(
                leaseJobId,
                new Date(clock.now),
                leaseUntil
            ),
            true
        );
    });

    it('appends an imported photo to gifted wishes but not to hidden gifted or removed ones', async () => {
        const userId = await insertUser(12);

        await store.wishes.insertImported([
            importedRow(userId, 1, {
                removed: true,
                done: true,
                sourceImageUrl: 'https://storage.rewish.io/a'
            }),
            importedRow(userId, 2, {
                removed: true,
                sourceImageUrl: 'https://storage.rewish.io/b'
            })
        ]);

        const [gifted, removed] = await store.wishes.listPendingPhotos(
            userId,
            10
        );

        assert.ok(gifted && removed);
        assert.equal(
            await store.wishes.appendImportedImage(gifted.id, userId, 'tg-1'),
            true
        );
        assert.equal(
            await store.wishes.appendImportedImage(gifted.id, userId, 'tg-2'),
            false
        );
        assert.equal(
            await store.wishes.appendImportedImage(removed.id, userId, 'tg-3'),
            false
        );
        assert.equal(await store.wishes.countPendingPhotos(userId), 1);
        assert.equal(await store.wishes.clearAllSourceImages(userId), 1);
        assert.equal(await store.wishes.countPendingPhotos(userId), 0);
    });

    it('prunes old finished jobs but keeps one that still has pending photos', async () => {
        const quiet = await insertUser(13);
        const pending = await insertUser(14);
        const old = clock.now - LIST_IMPORT_PRUNE_AFTER_MS - 1;

        await harness.env.DB.prepare(
            "INSERT INTO list_imports (user_id, source, kind, channel, state, visibility, created_at, updated_at) VALUES (?, 'rewish', 'wishes', 'app', 'done', 'public', ?, ?), (?, 'rewish', 'wishes', 'app', 'done', 'public', ?, ?), (?, 'rewish', 'wishes', 'app', 'previewed', 'public', ?, ?)"
        )
            .bind(quiet, old, old, pending, old, old, quiet, old, old)
            .run();
        await store.wishes.insertImported([
            importedRow(pending, 1, {
                sourceImageUrl: 'https://storage.rewish.io/p'
            })
        ]);

        const service = createService();
        const deps = createDeps(
            createRewishFetch(() => {
                return [];
            }).fakeFetch
        );

        assert.equal(await service.prune(deps), 1);
        assert.equal(await countRows(harness, 'list_imports'), 2);

        await service.resumeStale(deps, {});

        const { results } = await harness.env.DB.prepare(
            'SELECT state, source_url FROM list_imports WHERE user_id = ?'
        )
            .bind(quiet)
            .all<{ state: string; source_url: string | null }>();

        assert.deepEqual(results, [{ state: 'expired', source_url: null }]);
    });
});
