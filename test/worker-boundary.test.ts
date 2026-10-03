import assert from 'node:assert/strict';
import {
    createHash,
    timingSafeEqual as nodeTimingSafeEqual
} from 'node:crypto';
import test, { mock } from 'node:test';

import { Telegraf } from 'telegraf';

import { isPreviewAccessDenied } from '../src/api/auth/middleware';
import { createApp } from '../src/worker/app';
import type { WorkerBindings } from '../src/worker/env';
import {
    compareSecrets,
    TELEGRAM_WEBHOOK_MAX_BODY_BYTES,
    type SecretComparisonCrypto,
    type TelegramUpdateLedger
} from '../src/worker/routes/telegram';
import { runScheduledTasks } from '../src/worker/scheduled/tasks';
import {
    clearCachedBotInfo,
    handleUpdateWithWishlistBot,
    isAccessDeniedInRestrictedEnvironment,
    isIgnorableTelegramUpdate,
    isRuntimeTelegramUpdate
} from '../src/worker/routes/telegram';

class ReadinessPreparedStatement {
    constructor(private readonly readyValue: number | null) {}

    bind(..._values: unknown[]): D1PreparedStatement {
        return this;
    }

    first<T = unknown>(_columnName: string): Promise<T | null>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    async first<T>(): Promise<T | null> {
        return this.readyValue as T | null;
    }

    async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        throw new Error('run is not used by readiness tests');
    }

    async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
        throw new Error('all is not used by readiness tests');
    }

    raw<T = unknown[]>(options: {
        columnNames: true;
    }): Promise<[string[], ...T[]]>;
    raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
    async raw(): Promise<never> {
        throw new Error('raw is not used by readiness tests');
    }
}

const createReadinessDatabase = (readyValue: number | null) => {
    const queries: string[] = [];
    const database = {
        prepare(query: string) {
            queries.push(query);
            return new ReadinessPreparedStatement(readyValue);
        },
        async batch<T = unknown>(): Promise<D1Result<T>[]> {
            return [];
        },
        async exec() {
            return {
                count: 0,
                duration: 0
            };
        },
        withSession() {
            throw new Error('sessions are not used by readiness tests');
        },
        async dump() {
            return new ArrayBuffer(0);
        }
    } satisfies D1Database;

    return {
        database,
        queries
    };
};

const createBindings = (
    DB: D1Database,
    botEnvironment: WorkerBindings['BOT_ENVIRONMENT'] = 'local'
): WorkerBindings => {
    return {
        DB,
        CF_VERSION_METADATA: { id: 'test-version', tag: '', timestamp: '' },
        BOT_ENVIRONMENT: botEnvironment,
        ENABLE_RELEASE_BROADCAST:
            botEnvironment === 'production' ? 'true' : 'false',
        RELEASE_QUEUE: {} as WorkerBindings['RELEASE_QUEUE'],
        IMAGES: {} as WorkerBindings['IMAGES'],
        APP_API_LIMITER: {} as WorkerBindings['APP_API_LIMITER'],
        APP_SENSITIVE_LIMITER: {} as WorkerBindings['APP_SENSITIVE_LIMITER'],
        APP_UPLOAD_LIMITER: {} as WorkerBindings['APP_UPLOAD_LIMITER'],
        IMAGE_PROXY_LIMITER: {} as WorkerBindings['IMAGE_PROXY_LIMITER'],
        MINI_APP_ENABLED: 'true',
        AUTHOR_TWITTER_LINK: 'https://x.com/serhiichernenko',
        WISHLIST_TG_URL: 'https://t.me/wishlist_ua_bot',
        GITHUB_REPO_URL: 'https://github.com/serhii-chernenko/wishlist',
        PRINCESS_TG_URL: 'https://t.me/ixPrincessBot',
        TG_CHANNEL: 'https://t.me/serhii_chernenko',
        YT_CHANNEL: 'https://youtube.com/@serhii.chernenko',
        MONOBANK_URL: 'https://send.monobank.ua/jar/4ZGhPQqyMh',
        KOFI_URL: 'https://ko-fi.com/serhiichernenko',
        PAYPAL_URL: 'https://www.paypal.me/chernenkoserhii',
        REVOLUT_URL: 'https://revolut.me/serhiichernenko',
        ADMIN_ID: '777000111',
        BOT_TOKEN: '123456:test-token',
        NEW_RELIC_LICENSE_KEY: '',
        TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
        TELEGRAM_WEBHOOK_PATH: '/telegram/test'
    };
};

const withoutBinding = (
    bindings: WorkerBindings,
    key: 'BOT_TOKEN' | 'TELEGRAM_WEBHOOK_PATH' | 'TELEGRAM_WEBHOOK_SECRET'
) => {
    const incompleteBindings: Partial<WorkerBindings> = {
        ...bindings
    };

    delete incompleteBindings[key];

    return incompleteBindings as WorkerBindings;
};

const nodeSecretCrypto: SecretComparisonCrypto = {
    async digest(_algorithm, data) {
        const digest = Uint8Array.from(
            createHash('sha256').update(data).digest()
        );

        return digest.buffer;
    },
    timingSafeEqual(left, right) {
        return nodeTimingSafeEqual(new Uint8Array(left), new Uint8Array(right));
    }
};

const secretsMatch = (provided: string, expected: string) => {
    return compareSecrets(provided, expected, nodeSecretCrypto);
};

const createClaimingLedger = (
    overrides: Partial<TelegramUpdateLedger> = {}
): TelegramUpdateLedger => {
    return {
        async claimUpdate(_botKey, _updateId, leaseId) {
            return {
                state: 'claimed',
                leaseId,
                reclaimed: false
            };
        },
        async terminalizeUpdate() {
            return true;
        },
        ...overrides
    };
};

const ledgerRouteDependencies = {
    secretsMatch,
    createUpdateLedger: () => createClaimingLedger(),
    async deriveBotKey() {
        return 'a'.repeat(64);
    },
    createLeaseId: () => 'test-lease-id'
};

const createTelegramUpdateBody = (updateId: number) => {
    return JSON.stringify({
        update_id: updateId,
        message: {
            message_id: 7,
            date: 1_784_098_000,
            chat: {
                id: -100_000_000_001,
                type: 'supergroup'
            },
            from: { id: 777000111, is_bot: false, first_name: 'Test' },
            text: 'test'
        }
    });
};

const createTelegramRequest = (
    path: string,
    body: string,
    secret = 'test-webhook-secret',
    contentType = 'application/json'
) => {
    return new Request(`https://worker.example${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': contentType,
            'X-Telegram-Bot-Api-Secret-Token': secret
        },
        body
    });
};

test('webhook accepts a validated update only on the exact configured path', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    const handledUpdateIds: number[] = [];
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate(_env, update) {
            handledUpdateIds.push(update.update_id);
        }
    });

    const accepted = await app.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(42)),
        bindings
    );
    const trailingSlash = await app.fetch(
        createTelegramRequest('/telegram/test/', createTelegramUpdateBody(43)),
        bindings
    );

    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), {
        accepted: true,
        updateId: 42
    });
    assert.equal(trailingSlash.status, 404);
    assert.deepEqual(handledUpdateIds, [42]);
});

test('webhook fails closed when any required secret or path is missing', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    let handledUpdates = 0;
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate() {
            handledUpdates += 1;
        }
    });
    const requiredBindings = [
        'BOT_TOKEN',
        'TELEGRAM_WEBHOOK_PATH',
        'TELEGRAM_WEBHOOK_SECRET'
    ] as const;

    for (const binding of requiredBindings) {
        const response = await app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(42)
            ),
            withoutBinding(bindings, binding)
        );

        assert.equal(response.status, 503, binding);
    }

    assert.equal(handledUpdates, 0);
});

test('webhook rejects invalid secrets, media types, JSON, and update IDs', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    let handledUpdates = 0;
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate() {
            handledUpdates += 1;
        }
    });
    const requests = [
        {
            request: createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(42),
                'wrong-secret'
            ),
            status: 401
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(42),
                'test-webhook-secret',
                'text/plain'
            ),
            status: 415
        },
        {
            request: createTelegramRequest('/telegram/test', '{'),
            status: 400
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(-1)
            ),
            status: 400
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(1.5)
            ),
            status: 400
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(Number.MAX_SAFE_INTEGER + 1)
            ),
            status: 400
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                '{"update_id":42,"edited_message":{}}'
            ),
            status: 200
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                '{"edited_message":{}}'
            ),
            status: 400
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                '{"update_id":42,"my_chat_member":{}}'
            ),
            status: 400
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                '{"update_id":42,"callback_query":{}}'
            ),
            status: 400
        },
        {
            request: createTelegramRequest(
                '/telegram/test',
                '{"update_id":42,"message":{}}'
            ),
            status: 400
        }
    ];

    for (const expectation of requests) {
        const response = await app.fetch(expectation.request, bindings);

        assert.equal(response.status, expectation.status);
    }

    assert.equal(handledUpdates, 0);
});

test('webhook caps authenticated JSON before parsing and authenticates first', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    let handledUpdates = 0;
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate() {
            handledUpdates += 1;
        }
    });
    const oversizedBody = ' '.repeat(TELEGRAM_WEBHOOK_MAX_BODY_BYTES + 1);

    const authorized = await app.fetch(
        createTelegramRequest('/telegram/test', oversizedBody),
        bindings
    );
    const unauthorized = await app.fetch(
        createTelegramRequest('/telegram/test', oversizedBody, 'wrong-secret'),
        bindings
    );

    assert.equal(authorized.status, 413);
    assert.equal(unauthorized.status, 401);
    assert.equal(handledUpdates, 0);
});

test('webhook acknowledges processed duplicates and retries busy claims', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    let handledUpdates = 0;
    const duplicateApp = createApp({
        ...ledgerRouteDependencies,
        createUpdateLedger: () => {
            return createClaimingLedger({
                async claimUpdate() {
                    return {
                        state: 'duplicate'
                    };
                }
            });
        },
        async handleUpdate() {
            handledUpdates += 1;
        }
    });
    const busyApp = createApp({
        ...ledgerRouteDependencies,
        createUpdateLedger: () => {
            return createClaimingLedger({
                async claimUpdate() {
                    return {
                        state: 'busy'
                    };
                }
            });
        },
        async handleUpdate() {
            handledUpdates += 1;
        }
    });

    const duplicate = await duplicateApp.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(42)),
        bindings
    );
    const busy = await busyApp.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(42)),
        bindings
    );

    assert.equal(duplicate.status, 200);
    assert.deepEqual(await duplicate.json(), {
        accepted: true,
        duplicate: true,
        updateId: 42
    });
    assert.equal(busy.status, 503);
    assert.equal(handledUpdates, 0);
});

test('webhook logs a secret-safe warning when reclaiming a stale claim', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    const warnings: string[] = [];
    const app = createApp({
        ...ledgerRouteDependencies,
        createUpdateLedger: () => {
            return createClaimingLedger({
                async claimUpdate(_botKey, _updateId, leaseId) {
                    return {
                        state: 'claimed',
                        leaseId,
                        reclaimed: true
                    };
                }
            });
        },
        logWarning(message) {
            warnings.push(message);
        },
        async handleUpdate() {}
    });

    const response = await app.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(42)),
        bindings
    );

    assert.equal(response.status, 200);
    assert.deepEqual(
        warnings.map(message => JSON.parse(message) as unknown),
        [
            {
                event: 'telegram_update_claim_reclaimed',
                botEnvironment: 'local',
                webhook: 'telegram'
            }
        ]
    );
    assert.equal(warnings[0]?.includes('test-token'), false);
    assert.equal(warnings[0]?.includes('test-webhook-secret'), false);
});

test('failed dispatch is terminalized and cannot execute again on retry', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    const terminalizedLeases: string[] = [];
    let dispatchCalls = 0;
    let isTerminalized = false;
    const ledger = createClaimingLedger({
        async claimUpdate(_botKey, _updateId, leaseId) {
            if (isTerminalized) {
                return {
                    state: 'duplicate'
                };
            }

            return {
                state: 'claimed',
                leaseId,
                reclaimed: false
            };
        },
        async terminalizeUpdate(_botKey, _updateId, leaseId) {
            terminalizedLeases.push(leaseId);
            isTerminalized = true;
            return true;
        }
    });
    const failedHandlerApp = createApp({
        ...ledgerRouteDependencies,
        createUpdateLedger: () => ledger,
        async handleUpdate() {
            dispatchCalls += 1;
            throw new Error('expected handler failure');
        }
    });

    const failedDispatch = await failedHandlerApp.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(42)),
        bindings
    );
    const automaticRetry = await failedHandlerApp.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(42)),
        bindings
    );

    assert.equal(failedDispatch.status, 200);
    assert.deepEqual(await failedDispatch.json(), {
        accepted: true,
        updateId: 42
    });
    assert.equal(automaticRetry.status, 200);
    assert.deepEqual(await automaticRetry.json(), {
        accepted: true,
        duplicate: true,
        updateId: 42
    });
    assert.equal(dispatchCalls, 1);
    assert.deepEqual(terminalizedLeases, ['test-lease-id']);
});

test('webhook acknowledges uncertain dispatch state and fails closed before dispatch', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    let dispatchCalls = 0;
    const uncertainDispatchApp = createApp({
        ...ledgerRouteDependencies,
        createUpdateLedger: () => {
            return createClaimingLedger({
                async terminalizeUpdate() {
                    throw new Error('expected terminalization failure');
                }
            });
        },
        async handleUpdate() {
            dispatchCalls += 1;
            throw new Error('expected handler failure');
        }
    });
    const unavailableLedgerApp = createApp({
        ...ledgerRouteDependencies,
        createUpdateLedger: () => {
            return createClaimingLedger({
                async claimUpdate() {
                    throw new Error('expected ledger failure');
                }
            });
        }
    });

    const uncertainDispatch = await uncertainDispatchApp.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(42)),
        bindings
    );
    const unavailableLedger = await unavailableLedgerApp.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(43)),
        bindings
    );

    assert.equal(uncertainDispatch.status, 200);
    assert.deepEqual(await uncertainDispatch.json(), {
        accepted: true,
        updateId: 42
    });
    assert.equal(dispatchCalls, 1);
    assert.equal(unavailableLedger.status, 503);
});

test('health reports configuration and D1 readiness', async () => {
    const readyDatabase = createReadinessDatabase(1);
    const unavailableDatabase = createReadinessDatabase(null);
    const app = createApp({
        secretsMatch
    });
    const authorizedRequest = {
        headers: {
            'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret'
        }
    };

    const readyResponse = await app.request(
        '/health',
        authorizedRequest,
        createBindings(readyDatabase.database)
    );
    const databaseUnavailableResponse = await app.request(
        '/health',
        authorizedRequest,
        createBindings(unavailableDatabase.database)
    );
    const configurationUnavailableResponse = await app.request(
        '/health',
        authorizedRequest,
        withoutBinding(createBindings(readyDatabase.database), 'BOT_TOKEN')
    );
    const unauthorizedResponse = await app.request(
        '/health',
        undefined,
        createBindings(readyDatabase.database)
    );

    assert.equal(readyResponse.status, 200);
    assert.deepEqual(await readyResponse.json(), {
        service: 'wishlist',
        runtime: 'cloudflare-workers',
        ready: true,
        checks: {
            configuration: true,
            database: true
        }
    });
    assert.equal(databaseUnavailableResponse.status, 503);
    assert.equal(configurationUnavailableResponse.status, 503);
    assert.equal(unauthorizedResponse.status, 401);
    assert.deepEqual(readyDatabase.queries, ['SELECT 1 AS ready']);
    assert.deepEqual(unavailableDatabase.queries, ['SELECT 1 AS ready']);
});

const createScheduledController = (cron: string) => {
    return {
        cron,
        scheduledTime: Date.now(),
        noRetry() {}
    } satisfies ScheduledController;
};

const createEmptySnapshot = () => {
    return {
        registeredUsers: 120,
        blockedUsers: 9,
        activeUsers1d: 30,
        activeUsers7d: 60,
        activeUsers30d: 90,
        botOnlyUsers1d: 10,
        botOnlyUsers7d: 20,
        botOnlyUsers30d: 30,
        appOnlyUsers1d: 1,
        appOnlyUsers7d: 2,
        appOnlyUsers30d: 3,
        bothChannelUsers1d: 4,
        bothChannelUsers7d: 5,
        bothChannelUsers30d: 6,
        appUsersTotal: 8,
        totalWishes: 800,
        activeWishes: 700,
        hiddenWishes: 20,
        priorityWishes: 40,
        doneWishes: 100,
        gives: 12,
        usersWithPayments: 5,
        languageCounts: { uk: 100, en: 10, pl: 6, auto: 4 }
    };
};

test('daily maintenance prunes the update ledger and stale sessions in production only', async () => {
    const { database } = createReadinessDatabase(1);
    const calls = {
        processed: 0,
        abandoned: 0,
        sessions: 0,
        broadcast: 0,
        snapshot: 0
    };
    const sessionCutoffs: Date[] = [];
    const dependencies = {
        async pruneProcessedTelegramUpdates() {
            calls.processed += 1;
            return 3;
        },
        async pruneAbandonedTelegramUpdates() {
            calls.abandoned += 1;
            return 2;
        },
        async pruneSessions(_env: WorkerBindings, updatedBefore: Date) {
            calls.sessions += 1;
            sessionCutoffs.push(updatedBefore);
            return 4;
        },
        async broadcastRelease() {
            calls.broadcast += 1;
            return null;
        },
        async readBotStateSnapshot() {
            calls.snapshot += 1;
            return createEmptySnapshot();
        }
    };
    const startedAt = Date.now();

    const production = await runScheduledTasks(
        createScheduledController('0 0 * * *'),
        createBindings(database, 'production'),
        {} as ExecutionContext,
        dependencies
    );
    const local = await runScheduledTasks(
        createScheduledController('0 0 * * *'),
        createBindings(database, 'local'),
        {} as ExecutionContext,
        dependencies
    );

    assert.deepEqual(calls, {
        processed: 1,
        abandoned: 1,
        sessions: 1,
        broadcast: 0,
        snapshot: 0
    });
    assert.deepEqual(production, {
        taskNames: ['maintenance:prune'],
        prunedProcessedTelegramUpdates: 3,
        prunedAbandonedTelegramUpdates: 2,
        prunedSessions: 4
    });
    assert.equal(local.prunedSessions, 0);

    const retentionMilliseconds =
        (sessionCutoffs[0] as Date).getTime() - startedAt;

    assert.ok(
        Math.abs(retentionMilliseconds + 90 * 24 * 60 * 60 * 1000) < 60_000
    );
});

test('a failing session prune is logged and does not skip the ledger prune', async () => {
    const { database } = createReadinessDatabase(1);
    const errorLog = mock.method(console, 'error', () => undefined);
    let processedLedgerPruneCalls = 0;

    try {
        const summary = await runScheduledTasks(
            createScheduledController('0 0 * * *'),
            createBindings(database, 'production'),
            {} as ExecutionContext,
            {
                async pruneProcessedTelegramUpdates() {
                    processedLedgerPruneCalls += 1;
                    return 1;
                },
                async pruneAbandonedTelegramUpdates() {
                    return 0;
                },
                async pruneSessions() {
                    throw new TypeError('d1 unavailable');
                }
            }
        );
        const logged = errorLog.mock.calls.map(call => {
            return String(call.arguments[0]);
        });

        assert.equal(summary.prunedSessions, 0);
        assert.equal(summary.prunedProcessedTelegramUpdates, 1);
        assert.equal(processedLedgerPruneCalls, 1);
        assert.ok(
            logged.some(entry => {
                return (
                    entry.includes('sessions_prune_failed') &&
                    entry.includes('TypeError') &&
                    !entry.includes('d1 unavailable')
                );
            })
        );
    } finally {
        errorLog.mock.restore();
    }
});

test('a failing ledger prune is logged and fails the scheduled run', async () => {
    const { database } = createReadinessDatabase(1);
    const errorLog = mock.method(console, 'error', () => undefined);

    try {
        await assert.rejects(
            runScheduledTasks(
                createScheduledController('0 0 * * *'),
                createBindings(database, 'production'),
                {} as ExecutionContext,
                {
                    async pruneSessions() {
                        return 0;
                    },
                    async pruneProcessedTelegramUpdates() {
                        throw new TypeError('d1 unavailable');
                    }
                }
            ),
            TypeError
        );
    } finally {
        errorLog.mock.restore();
    }
});

test('the ten-minute cron broadcasts the release and snapshots bot state without pruning', async () => {
    const { database } = createReadinessDatabase(1);
    const logLines = mock.method(console, 'log', () => undefined);
    const calls = { broadcast: 0, snapshot: 0, pruned: 0 };

    try {
        const summary = await runScheduledTasks(
            createScheduledController('*/10 * * * *'),
            createBindings(database, 'production'),
            {} as ExecutionContext,
            {
                async broadcastRelease() {
                    calls.broadcast += 1;
                    return {
                        releaseVersion: '2.0.0',
                        candidates: 3,
                        inserted: 3,
                        enqueued: 3
                    };
                },
                async readBotStateSnapshot() {
                    calls.snapshot += 1;
                    return createEmptySnapshot();
                },
                async pruneProcessedTelegramUpdates() {
                    calls.pruned += 1;
                    return 0;
                },
                async pruneAbandonedTelegramUpdates() {
                    calls.pruned += 1;
                    return 0;
                },
                async pruneSessions() {
                    calls.pruned += 1;
                    return 0;
                }
            }
        );

        assert.deepEqual(summary.taskNames, [
            'release:broadcast',
            'bot:state-snapshot'
        ]);
        assert.deepEqual(calls, { broadcast: 1, snapshot: 1, pruned: 0 });
    } finally {
        logLines.mock.restore();
    }
});

test('preview and local environments never snapshot, prune or run production-only work', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database, 'preview');
    const logLines = mock.method(console, 'log', () => undefined);
    let scheduledCalls = 0;
    const countScheduledCall = async () => {
        scheduledCalls += 1;
        return 0;
    };

    try {
        for (const cron of ['0 0 * * *', '*/10 * * * *']) {
            await runScheduledTasks(
                createScheduledController(cron),
                bindings,
                {} as ExecutionContext,
                {
                    pruneProcessedTelegramUpdates: countScheduledCall,
                    pruneAbandonedTelegramUpdates: countScheduledCall,
                    pruneSessions: countScheduledCall,
                    async readBotStateSnapshot() {
                        scheduledCalls += 1;
                        return createEmptySnapshot();
                    }
                }
            );
        }
    } finally {
        logLines.mock.restore();
    }

    assert.equal(scheduledCalls, 0);
});

test('preview environment serves health and webhook', async () => {
    const { database, queries } = createReadinessDatabase(1);
    const bindings = createBindings(database, 'preview');
    const handledUpdateIds: number[] = [];
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate(_env, update) {
            handledUpdateIds.push(update.update_id);
        }
    });

    const health = await app.request(
        '/health',
        {
            headers: {
                'X-Telegram-Bot-Api-Secret-Token': 'test-webhook-secret'
            }
        },
        bindings
    );
    const webhook = await app.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(7)),
        bindings
    );

    assert.equal(health.status, 200);
    assert.equal(webhook.status, 200);
    assert.deepEqual(handledUpdateIds, [7]);
    assert.equal(bindings.ENABLE_RELEASE_BROADCAST, 'false');
    assert.ok(queries.length > 0);
});

const createStrangerUpdateBody = (updateId: number) => {
    return JSON.stringify({
        update_id: updateId,
        message: {
            message_id: 8,
            date: 1_784_098_000,
            chat: { id: 555000222, type: 'private' },
            from: { id: 555000222, is_bot: false, first_name: 'Stranger' },
            text: '/start'
        }
    });
};

for (const restrictedEnvironment of ['preview', 'local'] as const) {
    test(`${restrictedEnvironment} bot ignores every sender except ADMIN_ID without claiming the update`, async () => {
        const { database } = createReadinessDatabase(1);
        const bindings = createBindings(database, restrictedEnvironment);
        const handledUpdateIds: number[] = [];
        const claimedUpdateIds: number[] = [];
        const app = createApp({
            ...ledgerRouteDependencies,
            createUpdateLedger: () => {
                const ledger = createClaimingLedger();

                return {
                    ...ledger,
                    claimUpdate(botKey, updateId, leaseId, startedAt) {
                        claimedUpdateIds.push(updateId);

                        return ledger.claimUpdate(
                            botKey,
                            updateId,
                            leaseId,
                            startedAt
                        );
                    }
                };
            },
            async handleUpdate(_env, update) {
                handledUpdateIds.push(update.update_id);
            }
        });
        const stranger = await app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createStrangerUpdateBody(21)
            ),
            bindings
        );
        const admin = await app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(22)
            ),
            bindings
        );

        assert.equal(stranger.status, 200);
        assert.deepEqual(await stranger.json(), {
            ignored: true,
            updateId: 21
        });
        assert.equal(admin.status, 200);
        assert.deepEqual(handledUpdateIds, [22]);
        assert.deepEqual(claimedUpdateIds, [22]);
    });
}

test('restricted environments serve nobody when ADMIN_ID is empty and production serves everyone', async () => {
    const { database } = createReadinessDatabase(1);
    const handledUpdateIds: number[] = [];
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate(_env, update) {
            handledUpdateIds.push(update.update_id);
        }
    });
    const withoutAdmin = {
        ...createBindings(database, 'preview'),
        ADMIN_ID: ''
    };
    const denied = await app.fetch(
        createTelegramRequest('/telegram/test', createTelegramUpdateBody(31)),
        withoutAdmin
    );
    const production = await app.fetch(
        createTelegramRequest('/telegram/test', createStrangerUpdateBody(32)),
        createBindings(database, 'production')
    );

    assert.deepEqual(await denied.json(), { ignored: true, updateId: 31 });
    assert.equal(production.status, 200);
    assert.deepEqual(handledUpdateIds, [32]);
});

test('preview access check reads the sender of message, callback_query and my_chat_member updates', () => {
    const env = {
        BOT_ENVIRONMENT: 'preview',
        ADMIN_ID: ' 777000111 '
    } as const;
    const bodies = [
        createTelegramUpdateBody(1),
        createCallbackUpdateBody(2),
        createMyChatMemberUpdateBody(3, 'member')
    ];

    for (const body of bodies) {
        const update = JSON.parse(body);

        assert.equal(isAccessDeniedInRestrictedEnvironment(env, update), false);
        assert.equal(
            isAccessDeniedInRestrictedEnvironment(
                { ...env, ADMIN_ID: '1' },
                update
            ),
            true
        );
    }
});

test('only the production environment is unrestricted: preview, local, unknown and missing require ADMIN_ID', () => {
    const update = JSON.parse(createTelegramUpdateBody(1));
    const admin = 777000111;
    const environments = [
        'preview',
        'local',
        'staging',
        'Production',
        '',
        undefined
    ] as const;

    for (const environment of environments) {
        const env = {
            BOT_ENVIRONMENT: environment,
            ADMIN_ID: String(admin)
        } as unknown as Pick<WorkerBindings, 'BOT_ENVIRONMENT' | 'ADMIN_ID'>;
        const strangerEnv = { ...env, ADMIN_ID: '1' };
        const noAdminEnv = { ...env, ADMIN_ID: undefined } as unknown as Pick<
            WorkerBindings,
            'BOT_ENVIRONMENT' | 'ADMIN_ID'
        >;

        assert.equal(
            isAccessDeniedInRestrictedEnvironment(env, update),
            false,
            `webhook admin ${String(environment)}`
        );
        assert.equal(
            isAccessDeniedInRestrictedEnvironment(strangerEnv, update),
            true,
            `webhook stranger ${String(environment)}`
        );
        assert.equal(
            isAccessDeniedInRestrictedEnvironment(noAdminEnv, update),
            true,
            `webhook no admin ${String(environment)}`
        );
        assert.equal(isPreviewAccessDenied(env, admin), false);
        assert.equal(isPreviewAccessDenied(strangerEnv, admin), true);
        assert.equal(isPreviewAccessDenied(noAdminEnv, admin), true);
    }

    const production = {
        BOT_ENVIRONMENT: 'production',
        ADMIN_ID: '1'
    } as const;

    assert.equal(
        isAccessDeniedInRestrictedEnvironment(production, update),
        false
    );
    assert.equal(isPreviewAccessDenied(production, admin), false);
});

const createCallbackUpdateBody = (updateId: number, data = 'n:wl') => {
    return JSON.stringify({
        update_id: updateId,
        callback_query: {
            id: '4382901837412',
            from: { id: 777000111, is_bot: false, first_name: 'Test' },
            message: {
                message_id: 11,
                date: 1_784_098_000,
                chat: { id: 777000111, type: 'private' }
            },
            chat_instance: '-123456',
            data
        }
    });
};

const createMyChatMemberUpdateBody = (updateId: number, status: string) => {
    return JSON.stringify({
        update_id: updateId,
        my_chat_member: {
            chat: { id: 777000111, type: 'private' },
            from: { id: 777000111, is_bot: false, first_name: 'Test' },
            date: 1_784_098_000,
            old_chat_member: { status: 'member' },
            new_chat_member: { status }
        }
    });
};

test('webhook dispatches message, callback_query and my_chat_member updates', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    const handledUpdateIds: number[] = [];
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate(_env, update) {
            handledUpdateIds.push(update.update_id);
        }
    });
    const privateMessage = JSON.stringify({
        update_id: 3,
        message: {
            message_id: 5,
            date: 1_784_098_000,
            chat: { id: 777000111, type: 'private' },
            from: { id: 777000111, is_bot: false, first_name: 'Test' },
            text: '/start'
        }
    });

    const responses = await Promise.all([
        app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createTelegramUpdateBody(1)
            ),
            bindings
        ),
        app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createCallbackUpdateBody(2)
            ),
            bindings
        ),
        app.fetch(
            createTelegramRequest('/telegram/test', privateMessage),
            bindings
        ),
        app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createMyChatMemberUpdateBody(4, 'kicked')
            ),
            bindings
        ),
        app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createCallbackUpdateBody(5, 'unexpected-legacy-data')
            ),
            bindings
        )
    ]);

    for (const response of responses) {
        assert.equal(response.status, 200);
    }

    assert.deepEqual(handledUpdateIds.sort(), [1, 2, 3, 4, 5]);
});

test('webhook answers other update types with 200 ignored and never dispatches them', async () => {
    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    let handledUpdates = 0;
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate() {
            handledUpdates += 1;
        }
    });

    for (const updateType of [
        'edited_message',
        'channel_post',
        'inline_query',
        'chat_member',
        'poll',
        'message_reaction'
    ]) {
        const response = await app.fetch(
            createTelegramRequest(
                '/telegram/test',
                JSON.stringify({ update_id: 91, [updateType]: {} })
            ),
            bindings
        );

        assert.equal(response.status, 200, updateType);
        assert.deepEqual(await response.json(), {
            ignored: true,
            updateId: 91
        });
    }

    assert.equal(handledUpdates, 0);
});

test('update validators accept the three handled shapes and ignore the rest', () => {
    const callbackWithoutMessage = {
        update_id: 1,
        callback_query: { id: '1', from: { id: 5 } }
    };
    const callbackWithoutData = JSON.parse(createCallbackUpdateBody(2)) as {
        callback_query: { data?: string };
    };

    delete callbackWithoutData.callback_query.data;

    assert.equal(isRuntimeTelegramUpdate(callbackWithoutMessage), true);
    assert.equal(isRuntimeTelegramUpdate(callbackWithoutData), true);
    assert.equal(
        isRuntimeTelegramUpdate(JSON.parse(createCallbackUpdateBody(3))),
        true
    );
    assert.equal(
        isRuntimeTelegramUpdate(
            JSON.parse(createMyChatMemberUpdateBody(4, 'member'))
        ),
        true
    );
    assert.equal(
        isRuntimeTelegramUpdate({
            update_id: 1,
            callback_query: { id: 7, from: { id: 5 } }
        }),
        false
    );
    assert.equal(
        isRuntimeTelegramUpdate({
            update_id: 1,
            callback_query: { id: '7', from: { id: 'x' } }
        }),
        false
    );
    assert.equal(
        isRuntimeTelegramUpdate({
            update_id: 1,
            callback_query: { id: '7', from: { id: 5 }, data: 12 }
        }),
        false
    );
    assert.equal(
        isRuntimeTelegramUpdate({
            update_id: 1,
            callback_query: { id: '7', from: { id: 5 }, message: {} }
        }),
        false
    );
    assert.equal(
        isRuntimeTelegramUpdate({
            update_id: 1,
            my_chat_member: {
                chat: { id: 5, type: 'private' },
                from: { id: 5 },
                new_chat_member: {}
            }
        }),
        false
    );
    assert.equal(isIgnorableTelegramUpdate({ update_id: 1 }), true);
    assert.equal(
        isIgnorableTelegramUpdate({ update_id: 1, edited_message: {} }),
        true
    );
    assert.equal(
        isIgnorableTelegramUpdate({ update_id: 1, callback_query: {} }),
        false
    );
    assert.equal(
        isIgnorableTelegramUpdate({ update_id: 1, my_chat_member: {} }),
        false
    );
    assert.equal(isIgnorableTelegramUpdate({ update_id: -1 }), false);
});

test('webhook telemetry carries update type and a closed callback category without identifiers', async () => {
    const originalFetch = globalThis.fetch;
    const shippedBodies: string[] = [];
    const background: Promise<unknown>[] = [];
    const { database } = createReadinessDatabase(1);
    const bindings: WorkerBindings = {
        ...createBindings(database, 'production'),
        NEW_RELIC_LICENSE_KEY: 'test-license-key'
    };
    const app = createApp({
        ...ledgerRouteDependencies,
        async handleUpdate() {}
    });

    globalThis.fetch = async (_input, init) => {
        shippedBodies.push(String(init?.body));
        return new Response('{}', { status: 200 });
    };

    try {
        const response = await app.fetch(
            createTelegramRequest(
                '/telegram/test',
                createCallbackUpdateBody(8, 'w:e:918273645')
            ),
            bindings,
            {
                waitUntil(promise: Promise<unknown>) {
                    background.push(promise);
                },
                passThroughOnException() {}
            } as unknown as ExecutionContext
        );

        assert.equal(response.status, 200);
        await Promise.all(background);
    } finally {
        globalThis.fetch = originalFetch;
    }

    const shipped = shippedBodies.join('\n');

    assert.match(shipped, /callback_query/);
    assert.match(shipped, /wish:edit/);

    for (const identifier of ['918273645', '777000111', '4382901837412']) {
        assert.equal(shipped.includes(identifier), false, identifier);
    }
});

test('bot info is fetched once per bot key and reused by later updates', async () => {
    clearCachedBotInfo();

    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    const update = JSON.parse(createTelegramUpdateBody(42)) as Parameters<
        typeof handleUpdateWithWishlistBot
    >[1];
    let getMeCalls = 0;
    const createBot = () => {
        const bot = new Telegraf('123456:test-token');

        bot.telegram.callApi = (async (method: string) => {
            if (method === 'getMe') {
                getMeCalls += 1;
            }

            return {
                id: 123456,
                is_bot: true,
                first_name: 'Wishlist',
                username: 'wishlist_test_bot'
            };
        }) as typeof bot.telegram.callApi;

        return bot;
    };

    await handleUpdateWithWishlistBot(
        bindings,
        update,
        'test-bot-key',
        createBot
    );
    await handleUpdateWithWishlistBot(
        bindings,
        update,
        'test-bot-key',
        createBot
    );

    assert.equal(getMeCalls, 1);
    clearCachedBotInfo();
});

test('the bot receives telemetry sinks and the execution context waitUntil', async () => {
    clearCachedBotInfo();

    const { database } = createReadinessDatabase(1);
    const bindings = createBindings(database);
    const update = JSON.parse(createTelegramUpdateBody(42)) as Parameters<
        typeof handleUpdateWithWishlistBot
    >[1];
    const waitUntilPromises: Promise<unknown>[] = [];
    let receivedDependencies:
        | Parameters<Parameters<typeof handleUpdateWithWishlistBot>[3] & {}>[1]
        | null = null;

    await handleUpdateWithWishlistBot(
        bindings,
        update,
        'test-bot-key-2',
        (_env, dependencies) => {
            receivedDependencies = dependencies;

            return {
                async handleUpdate() {}
            };
        },
        {
            waitUntil(promise) {
                waitUntilPromises.push(promise);
            }
        }
    );

    const dependencies = receivedDependencies as unknown as {
        telemetry: {
            botActionCompleted: (input: unknown) => void;
            internalFailure: (input: unknown) => void;
        };
        waitUntil: (promise: Promise<unknown>) => void;
    };

    assert.equal(typeof dependencies.telemetry.botActionCompleted, 'function');
    assert.equal(typeof dependencies.telemetry.internalFailure, 'function');
    dependencies.waitUntil(Promise.resolve());
    assert.equal(waitUntilPromises.length, 1);

    let withoutContext: unknown = null;

    await handleUpdateWithWishlistBot(
        bindings,
        update,
        'test-bot-key-3',
        (_env, dependencies) => {
            withoutContext = dependencies;

            return {
                async handleUpdate() {}
            };
        }
    );

    assert.equal(
        'waitUntil' in (withoutContext as Record<string, unknown>),
        false
    );
    clearCachedBotInfo();
});
