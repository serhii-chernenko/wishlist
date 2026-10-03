import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkerBindings } from '../src/worker/env';
import { readBotStateSnapshot } from '../src/worker/scheduled/bot-state-snapshot';
import { runScheduledTasks } from '../src/worker/scheduled/tasks';
import { createD1Harness } from './integration/d1-harness';

const asOf = new Date(1_800_000_000_000);
const hour = 60 * 60 * 1000;
const day = 24 * hour;

const snapshot = {
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

test('bot state snapshot aggregates users, wishes, gives and languages without identities', async () => {
    const harness = await createD1Harness();

    try {
        await harness.applyMigrations();
        await harness.env.DB.prepare(
            `INSERT INTO users
                (telegram_id, language, payments, blocked_at, last_seen_at, last_bot_seen_at, last_app_seen_at, created_at, updated_at)
             VALUES (101, 'uk', NULL, NULL, ?1, ?1, ?4, 0, 0),
                    (102, 'en', 'card 4444', NULL, ?2, ?2, NULL, 0, 0),
                    (103, NULL, NULL, NULL, ?3, NULL, ?3, 0, 0),
                    (104, 'pl', NULL, 1, ?1, ?1, NULL, 0, 0),
                    (105, NULL, NULL, NULL, NULL, NULL, ?5, 0, 0)`
        )
            .bind(
                asOf.getTime() - hour,
                asOf.getTime() - 3 * day,
                asOf.getTime() - 20 * day,
                asOf.getTime() - 2 * hour,
                asOf.getTime() - 2 * day
            )
            .run();
        await harness.env.DB.prepare(
            `INSERT INTO wishes
                (user_id, title, hidden, priority, removed, done, created_at, updated_at)
             VALUES (1, 'active', 0, 0, 0, 0, 0, 0),
                    (1, 'hidden', 1, 0, 0, 0, 0, 0),
                    (2, 'priority', 0, 1, 0, 0, 0, 0),
                    (2, 'done and removed', 0, 0, 1, 1, 0, 0),
                    (3, 'done', 0, 0, 0, 1, 0, 0)`
        ).run();
        await harness.env.DB.prepare(
            `INSERT INTO gives (user_id, wish_id, created_at)
             VALUES (2, 1, 0), (3, 3, 0)`
        ).run();

        const result = await readBotStateSnapshot(harness.env, asOf);

        assert.deepEqual(result, {
            registeredUsers: 5,
            blockedUsers: 1,
            activeUsers1d: 1,
            activeUsers7d: 2,
            activeUsers30d: 3,
            botOnlyUsers1d: 0,
            botOnlyUsers7d: 1,
            botOnlyUsers30d: 1,
            appOnlyUsers1d: 0,
            appOnlyUsers7d: 1,
            appOnlyUsers30d: 2,
            bothChannelUsers1d: 1,
            bothChannelUsers7d: 1,
            bothChannelUsers30d: 1,
            appUsersTotal: 3,
            totalWishes: 5,
            activeWishes: 4,
            hiddenWishes: 1,
            priorityWishes: 1,
            doneWishes: 2,
            gives: 2,
            usersWithPayments: 1,
            languageCounts: { uk: 1, en: 1, pl: 0, auto: 2 }
        });
        assert.equal(JSON.stringify(result).includes('101'), false);
        assert.equal(JSON.stringify(result).includes('card 4444'), false);
    } finally {
        await harness.dispose();
    }
});

interface OtlpAttribute {
    key: string;
    value: { stringValue?: string; intValue?: string | number };
}

const readEvents = (bodies: string[]) => {
    return bodies.flatMap(body => {
        const payload = JSON.parse(body) as {
            resourceLogs: {
                scopeLogs: { logRecords: { attributes: OtlpAttribute[] }[] }[];
            }[];
        };

        return payload.resourceLogs.flatMap(resource => {
            return resource.scopeLogs.flatMap(scope => {
                return scope.logRecords.map(record => {
                    return Object.fromEntries(
                        record.attributes.map(attribute => {
                            return [
                                attribute.key,
                                attribute.value.stringValue ??
                                    Number(attribute.value.intValue)
                            ];
                        })
                    );
                });
            });
        });
    });
};

test('the ten-minute cron emits one snapshot event and one language count per locale', async () => {
    const originalFetch = globalThis.fetch;
    const bodies: string[] = [];
    const background: Promise<unknown>[] = [];

    globalThis.fetch = async (_input, init) => {
        bodies.push(String(init?.body));
        return new Response('{}', { status: 200 });
    };

    try {
        await runScheduledTasks(
            {
                cron: '*/10 * * * *',
                scheduledTime: asOf.getTime(),
                noRetry() {}
            },
            {
                BOT_ENVIRONMENT: 'production',
                ENABLE_RELEASE_BROADCAST: 'false',
                NEW_RELIC_LICENSE_KEY: 'test-license-key'
            } as unknown as WorkerBindings,
            {
                waitUntil(promise: Promise<unknown>) {
                    background.push(promise);
                }
            } as unknown as ExecutionContext,
            {
                async readBotStateSnapshot(_env, requestedAsOf) {
                    assert.equal(requestedAsOf.getTime(), asOf.getTime());
                    return snapshot;
                },
                async broadcastRelease() {
                    return null;
                }
            }
        );
        await Promise.all(background);
    } finally {
        globalThis.fetch = originalFetch;
    }

    const events = readEvents(bodies);
    const snapshotEvents = events.filter(event => {
        return event.eventName === 'bot_state_snapshot';
    });
    const languageEvents = events.filter(event => {
        return event.eventName === 'user_language_count';
    });

    assert.equal(snapshotEvents.length, 1);
    assert.equal(snapshotEvents[0]?.registeredUsers, 120);
    assert.equal(snapshotEvents[0]?.activeUsers30d, 90);
    assert.equal(snapshotEvents[0]?.botOnlyUsers7d, 20);
    assert.equal(snapshotEvents[0]?.appOnlyUsers30d, 3);
    assert.equal(snapshotEvents[0]?.bothChannelUsers1d, 4);
    assert.equal(snapshotEvents[0]?.appUsersTotal, 8);
    assert.equal(snapshotEvents[0]?.usersWithPayments, 5);
    assert.equal('languageCounts' in (snapshotEvents[0] ?? {}), false);
    assert.deepEqual(
        languageEvents.map(event => [event.locale, event.languageCount]),
        [
            ['uk', 100],
            ['en', 10],
            ['pl', 6],
            ['auto', 4]
        ]
    );
});

test('a failing snapshot read emits a failure event without stopping the cron', async () => {
    const originalFetch = globalThis.fetch;
    const bodies: string[] = [];
    const background: Promise<unknown>[] = [];
    let broadcasts = 0;

    globalThis.fetch = async (_input, init) => {
        bodies.push(String(init?.body));
        return new Response('{}', { status: 200 });
    };

    try {
        await runScheduledTasks(
            {
                cron: '*/10 * * * *',
                scheduledTime: asOf.getTime(),
                noRetry() {}
            },
            {
                BOT_ENVIRONMENT: 'production',
                ENABLE_RELEASE_BROADCAST: 'false',
                NEW_RELIC_LICENSE_KEY: 'test-license-key'
            } as unknown as WorkerBindings,
            {
                waitUntil(promise: Promise<unknown>) {
                    background.push(promise);
                }
            } as unknown as ExecutionContext,
            {
                async readBotStateSnapshot() {
                    throw new TypeError('d1 unavailable');
                },
                async broadcastRelease() {
                    broadcasts += 1;
                    return null;
                }
            }
        );
        await Promise.all(background);
    } finally {
        globalThis.fetch = originalFetch;
    }

    const failure = readEvents(bodies).find(event => {
        return event.eventName === 'bot_state_snapshot_failed';
    });

    assert.equal(broadcasts, 1);
    assert.equal(failure?.errorType, 'TypeError');
    assert.equal(JSON.stringify(bodies).includes('d1 unavailable'), false);
});
