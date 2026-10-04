import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    assertApplicationTablesEmpty,
    assertPreviewResetTarget,
    getD1ExecuteArguments,
    parseApplicationTableCounts,
    previewResetSql,
    resetPreviewTarget
} from '../scripts/db/d1-import-target';
import {
    createGithubCliTokenEnvironment,
    getGithubCliTokenArguments,
    prepareMongoImport
} from '../scripts/db/mongo-import';
import {
    parseImportOptions,
    resolveMongoImportSource,
    runMongoImport
} from '../scripts/db/run-mongo-import';
import {
    createSyntheticMongoExport,
    giveObjectId,
    missingWishOid,
    multilineDescription,
    orphanOwnerOid,
    serializeNdjson,
    serializeRecord,
    trickyTitle,
    userObjectId,
    wishObjectId,
    writeSyntheticMongoExport,
    type SyntheticMongoExport
} from './fixtures/mongo/synthetic-export';

const hashGitBlob = (bytes: Uint8Array) => {
    return createHash('sha1')
        .update(`blob ${bytes.byteLength}\0`)
        .update(bytes)
        .digest('hex');
};

interface TestCleanupContext {
    after(callback: () => void): void;
}

const createFixtureDirectory = (
    context: TestCleanupContext,
    mutate?: (records: SyntheticMongoExport) => void
) => {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'wishlist-mongo-import-test-')
    );
    const records = createSyntheticMongoExport();

    mutate?.(records);
    writeSyntheticMongoExport(directory, records);
    context.after(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    return directory;
};

const runImport = (directory: string) => {
    return prepareMongoImport({
        source: { kind: 'directory', directory },
        outputDirectory: path.join(directory, 'output')
    });
};

const readSql = (directory: string) => {
    return fs.readFileSync(
        path.join(directory, 'output', 'mongo-to-d1.sql'),
        'utf8'
    );
};

const splitStatements = (sql: string) => sql.trim().split('\n\n');

test('Mongo import transforms the synthetic export and reports every exception', async context => {
    const directory = createFixtureDirectory(context);
    const report = await runImport(directory);
    const sql = readSql(directory);

    assert.deepEqual(report.sourceCounts, { users: 24, wishes: 72, gives: 7 });
    assert.deepEqual(report.transformedCounts, {
        users: 24,
        wishes: 72,
        gives: 4
    });
    assert.deepEqual(
        report.skipped.gives.map(give => give.reason),
        ['missingWish', 'missingUser', 'removedWish']
    );
    assert.equal(report.orphanWishes.count, 6);
    assert.equal(report.orphanWishes.mongoIds.length, 6);
    assert.deepEqual(report.droppedKeys, {
        __v: 103,
        hideGreeting: 5,
        language: 1,
        noticed: 24
    });
    assert.equal(report.aggregates.wishes.withoutUser, 6);
    assert.equal(report.aggregates.users.total, 24);
    assert.equal(report.aggregates.gives.total, 4);
    assert.equal(report.aggregates.users.releaseVersions['0.0.0'], 6);
    assert.equal(report.aggregates.users.withPhone, 12);
    assert.equal(report.aggregates.users.usernameSearchable, 16);
    assert.equal(report.validation.validated, true);
    assert.equal(
        JSON.parse(fs.readFileSync(report.outputReportPath, 'utf8'))
            .orphanWishes.count,
        6
    );
    assert.equal(
        path.basename(report.outputReportPath),
        'mongo-to-d1.report.json'
    );
    assert.equal(fs.statSync(report.outputSqlPath).mode & 0o777, 0o600);
    assert.match(sql, /^PRAGMA foreign_keys = ON;/);
    assert.doesNotMatch(sql, /ON CONFLICT/i);
    assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT)/im);
    assert.doesNotMatch(sql, /^\s*--/m);
    assert.ok(
        sql.indexOf('INSERT INTO "users"') < sql.indexOf('INSERT INTO "wishes"')
    );
    assert.ok(
        sql.indexOf('INSERT INTO "wishes"') < sql.indexOf('INSERT INTO "gives"')
    );
    assert.ok(sql.includes(trickyTitle.replaceAll("'", "''")));
    assert.ok(sql.includes(multilineDescription));
});

test('Mongo import accepts integral float and Extended JSON number forms for telegram ids', async context => {
    const directory = createFixtureDirectory(context);

    await runImport(directory);

    const sql = readSql(directory);

    for (const telegramId of [
        '5733470387',
        '6100000001',
        '6200000002',
        '6300000003',
        '2100000004'
    ]) {
        assert.match(sql, new RegExp(`'[0-9a-f]{24}', ${telegramId},`));
    }
});

test('Mongo import assigns ids by ObjectId order and derives user and give timestamps from ObjectIds', async context => {
    const directory = createFixtureDirectory(context, records => {
        records.users.reverse();
        records.wishes.reverse();
    });

    await runImport(directory);

    const sql = readSql(directory);
    const firstUserOid = userObjectId(0);
    const firstUserSeconds = Number.parseInt(firstUserOid.slice(0, 8), 16);

    assert.ok(
        sql.includes(
            `(1, '${firstUserOid}', 7000000, 'Fake_User_00', 1, '+380990000000', '380990000000', 'UAH', NULL, NULL, NULL, '1.7.0', 'uk', 1, ${firstUserSeconds * 1000}, ${firstUserSeconds * 1000})`
        ),
        'first user row'
    );
    assert.match(
        sql,
        new RegExp(`\\(1, '${wishObjectId(0)}', 1, 'Fake wish 0'`)
    );
});

test('Mongo import applies defaults and converts empty strings to NULL', async context => {
    const directory = createFixtureDirectory(context, records => {
        records.users.splice(1, records.users.length - 1);
        records.wishes.splice(0, records.wishes.length);
        records.gives.splice(0, records.gives.length, {
            _id: { $oid: giveObjectId(0) },
            userId: { $oid: userObjectId(0) },
            wishId: { $oid: wishObjectId(0) }
        });
        Object.assign(records.users[0]!, {
            username: '',
            phone: '',
            currency: undefined,
            version: undefined,
            telegraphAccessToken: '',
            payments: '',
            wishlistFilter: undefined
        });
        records.wishes.push({
            _id: { $oid: wishObjectId(0) },
            userId: { $oid: userObjectId(0) },
            title: 'Bare wish',
            images: []
        });
    });
    const report = await runImport(directory);
    const sql = readSql(directory);

    assert.equal(report.aggregates.users.usernameSearchable, 0);
    assert.equal(report.aggregates.users.withPhone, 0);
    assert.equal(report.aggregates.users.releaseVersions['0.0.0'], 1);
    assert.match(
        sql,
        /\(1, '[0-9a-f]{24}', 7000000, NULL, 0, NULL, NULL, 'UAH', NULL, NULL, NULL, '0\.0\.0', 'uk', 1, \d+, \d+\)/
    );
    assert.match(
        sql,
        /\(1, '[0-9a-f]{24}', 1, 'Bare wish', NULL, NULL, '\[\]', 0, 0, 0, 0, 0, 0, 'UAH', \d+, \d+\)/
    );
});

test('Mongo import accepts a JSON-array source and reports hashes', async context => {
    const directory = createFixtureDirectory(context);
    const records = createSyntheticMongoExport();

    fs.writeFileSync(
        path.join(directory, 'users.json'),
        `[${records.users.map(serializeRecord).join(',')}]`,
        'utf8'
    );

    const report = await runImport(directory);

    assert.equal(report.source.files.users.format, 'json-array');
    assert.equal(report.source.files.wishes.format, 'ndjson');
    assert.match(report.source.files.gives.sha256, /^[0-9a-f]{64}$/);
    assert.equal(report.source.files.users.blobSha, null);
    assert.equal(report.source.files.users.recordCount, 24);
});

const failClosedCases: {
    name: string;
    expected: RegExp;
    mutate: (records: SyntheticMongoExport) => void;
}[] = [
    {
        name: 'bad ObjectId',
        expected: /users\[0\]\._id: expected an Extended JSON ObjectId/,
        mutate: records => {
            records.users[0]!._id = { $oid: 'nothex' };
        }
    },
    {
        name: 'bad date',
        expected: /wishes\[0\]\.createdAt: expected a valid millisecond date/,
        mutate: records => {
            records.wishes[0]!.createdAt = { $date: 'not-a-date' };
        }
    },
    {
        name: 'non-integral telegram id',
        expected: /users\[0\]\.telegramId: expected a safe integer/,
        mutate: records => {
            records.users[0]!.telegramId = 1.5;
        }
    },
    {
        name: 'unsafe telegram id',
        expected: /users\[0\]\.telegramId: expected a safe integer/,
        mutate: records => {
            records.users[0]!.telegramId = 2 ** 60;
        }
    },
    {
        name: 'non-positive telegram id',
        expected:
            /users\[0\]\.telegramId: expected an integer greater than or equal to 1/,
        mutate: records => {
            records.users[0]!.telegramId = 0;
        }
    },
    {
        name: 'duplicate telegram id',
        expected: /Duplicate Telegram user ID 7000000/,
        mutate: records => {
            records.users[1]!.telegramId = 7_000_000;
        }
    },
    {
        name: 'case-insensitive duplicate username',
        expected: /Duplicate username \(case-insensitive\) fake_user_00/,
        mutate: records => {
            records.users[1]!.username = 'FAKE_user_00';
        }
    },
    {
        name: 'duplicate phone',
        expected: /Duplicate phone \+380990000000/,
        mutate: records => {
            records.users[2]!.phone = '+380990000000';
        }
    },
    {
        name: 'duplicate user ObjectId',
        expected: /Duplicate users Mongo ObjectId/,
        mutate: records => {
            records.users[1]!._id = records.users[0]!._id;
        }
    },
    {
        name: 'duplicate wish ObjectId',
        expected: /Duplicate wishes Mongo ObjectId/,
        mutate: records => {
            records.wishes[1]!._id = records.wishes[0]!._id;
        }
    },
    {
        name: 'duplicate give pair',
        expected: /Duplicate give \(user, wish\) pair/,
        mutate: records => {
            records.gives.push({
                ...records.gives[0]!,
                _id: { $oid: 'eeeeeeeeeeeeeeeeeeeeeeee' }
            });
        }
    },
    {
        name: 'empty title',
        expected: /wishes\[0\]\.title: expected a non-empty string/,
        mutate: records => {
            records.wishes[0]!.title = '   ';
        }
    },
    {
        name: 'too many images',
        expected: /wishes\[0\]\.images: expected at most 9 images/,
        mutate: records => {
            records.wishes[0]!.images = Array.from(
                { length: 10 },
                (_, index) => {
                    return `file-${index}`;
                }
            );
        }
    },
    {
        name: 'negative price',
        expected:
            /wishes\[0\]\.price: expected an integer greater than or equal to 0/,
        mutate: records => {
            records.wishes[0]!.price = -5;
        }
    },
    {
        name: 'non-integral price',
        expected: /wishes\[0\]\.price: expected a safe integer/,
        mutate: records => {
            records.wishes[0]!.price = 10.5;
        }
    },
    {
        name: 'unknown wishlist filter',
        expected:
            /users\[0\]\.wishlistFilter: expected a known price filter between 0 and 4/,
        mutate: records => {
            records.users[0]!.wishlistFilter = 5;
        }
    },
    {
        name: 'unexpected field',
        expected: /users\[0\]: unexpected field "isAdmin"/,
        mutate: records => {
            records.users[0]!.isAdmin = true;
        }
    },
    {
        name: 'NUL character',
        expected: /wishes\[0\]\.description: must not contain NUL characters/,
        mutate: records => {
            records.wishes[0]!.description = 'bad\u0000text';
        }
    },
    {
        name: 'non-boolean flag',
        expected: /wishes\[0\]\.removed: expected a boolean/,
        mutate: records => {
            records.wishes[0]!.removed = 'yes';
        }
    }
];

for (const failClosedCase of failClosedCases) {
    test(`Mongo import fails closed on ${failClosedCase.name} without producing SQL`, async context => {
        const directory = createFixtureDirectory(
            context,
            failClosedCase.mutate
        );

        await assert.rejects(runImport(directory), failClosedCase.expected);
        assert.equal(
            fs.existsSync(path.join(directory, 'output', 'mongo-to-d1.sql')),
            false
        );
        assert.equal(
            fs.existsSync(
                path.join(directory, 'output', 'mongo-to-d1.report.json')
            ),
            false
        );
    });
}

test('Mongo import reports orphan, missing-wish and removed-wish exceptions instead of failing', async context => {
    const directory = createFixtureDirectory(context);
    const report = await runImport(directory);

    assert.ok(report.orphanWishes.mongoIds.length > 0);
    assert.deepEqual(report.skipped.gives.map(give => give.reason).sort(), [
        'missingUser',
        'missingWish',
        'removedWish'
    ]);
    assert.equal(
        report.orphanWishes.mongoIds.every(mongoId => {
            return mongoId.length === 24;
        }),
        true
    );
    assert.notEqual(orphanOwnerOid, missingWishOid);
});

test('Mongo import keeps statements within 20 rows and 100000 bytes', async context => {
    const directory = createFixtureDirectory(context, records => {
        records.users.splice(2);
        records.wishes.splice(0, records.wishes.length);
        records.gives.splice(0, records.gives.length, {
            _id: { $oid: giveObjectId(0) },
            userId: { $oid: userObjectId(0) },
            wishId: { $oid: wishObjectId(0) }
        });

        for (let index = 0; index < 60; index += 1) {
            records.wishes.push({
                _id: { $oid: wishObjectId(index) },
                userId: { $oid: userObjectId(index % 2) },
                title: `Heavy wish ${index}`,
                description: 'd'.repeat(12_000),
                images: []
            });
        }
    });

    await runImport(directory);

    const statements = splitStatements(readSql(directory)).filter(statement => {
        return statement.startsWith('INSERT INTO "wishes"');
    });
    const rowCounts = statements.map(statement => {
        return statement.split('\n').filter(line => /^[(V]/.test(line)).length;
    });

    assert.ok(statements.length > 3);
    assert.ok(
        statements.every(statement => {
            return new TextEncoder().encode(statement).byteLength <= 100_000;
        })
    );
    assert.ok(rowCounts.every(count => count <= 20));
    assert.equal(
        rowCounts.reduce((sum, count) => sum + count, 0),
        60
    );
});

test('Mongo import statements hold at most 20 rows for small rows', async context => {
    const directory = createFixtureDirectory(context);

    await runImport(directory);

    const statements = splitStatements(readSql(directory)).slice(1);

    for (const statement of statements) {
        const rows = statement.split('\n').filter(line => /^[(V]/.test(line));

        assert.ok(rows.length <= 20, statement.slice(0, 60));
    }
});

test('GitHub source resolves once and reads metadata/raw content at the resolved SHA', async context => {
    const directory = createFixtureDirectory(context);
    const resolvedSha = '4b9ebd56e45a52547258886866cfb943da03f620';
    const fileByName = new Map(
        ['users.json', 'wishes.json', 'gives.json'].map(name => {
            return [
                name,
                Uint8Array.from(fs.readFileSync(path.join(directory, name)))
            ] as const;
        })
    );
    const requests: string[] = [];
    const fetchImplementation: typeof fetch = async (input, init) => {
        const url = String(input);
        const accept = new Headers(init?.headers).get('Accept');

        requests.push(`${accept} ${url}`);
        assert.equal(init?.redirect, 'error');
        assert.equal(
            new Headers(init?.headers).get('X-GitHub-Api-Version'),
            '2026-03-10'
        );

        if (url.includes('/commits/')) {
            return Response.json({ sha: resolvedSha });
        }

        const name = Array.from(fileByName.keys()).find(fileName => {
            return url.includes(`/contents/${fileName}?`);
        });

        assert.ok(name);
        assert.match(url, new RegExp(`ref=${resolvedSha}$`));
        const bytes = fileByName.get(name);

        assert.ok(bytes);

        if (accept === 'application/vnd.github+json') {
            return Response.json({
                name,
                type: 'file',
                size: bytes.byteLength,
                sha: hashGitBlob(bytes)
            });
        }

        return new Response(bytes);
    };
    const report = await prepareMongoImport({
        source: {
            kind: 'github',
            repository: 'serhii-chernenko/wishlist-db',
            ref: 'main'
        },
        outputDirectory: path.join(directory, 'github-output'),
        githubToken: 'test-token',
        fetchImplementation
    });

    assert.equal(requests.length, 7);
    assert.equal(report.source.kind, 'github');
    assert.equal(report.source.resolvedCommitSha, resolvedSha);
    assert.equal(
        report.source.files.users.blobSha,
        hashGitBlob(fileByName.get('users.json')!)
    );

    for (let index = 1; index < requests.length; index += 2) {
        assert.match(requests[index] ?? '', /application\/vnd\.github\+json/);
        assert.match(
            requests[index + 1] ?? '',
            /application\/vnd\.github\.raw\+json/
        );
    }
});

test('production import controls require a pinned SHA and the fixed source repository', async context => {
    const directory = createFixtureDirectory(context);
    const failingFetch: typeof fetch = async () => {
        throw new Error('fetch must not run');
    };

    await assert.rejects(
        prepareMongoImport({
            source: {
                kind: 'github',
                ref: 'main',
                requireCommitSha: true
            },
            outputDirectory: path.join(directory, 'production-gate-output'),
            githubToken: 'test-token',
            fetchImplementation: failingFetch
        }),
        /requires an immutable 40-character Git commit SHA/
    );
    await assert.rejects(
        prepareMongoImport({
            source: {
                kind: 'github',
                repository: 'someone/else',
                ref: '4b9ebd56e45a52547258886866cfb943da03f620',
                requireCommitSha: true
            },
            outputDirectory: path.join(directory, 'production-gate-output'),
            githubToken: 'test-token',
            fetchImplementation: failingFetch
        }),
        /Production Mongo import source must be serhii-chernenko\/wishlist-db/
    );

    const productionArguments = getD1ExecuteArguments(
        'production',
        '/tmp/wrangler.jsonc',
        { file: '/tmp/import.sql' }
    );
    const localArguments = getD1ExecuteArguments(
        'local',
        '/tmp/wrangler.jsonc',
        { command: 'SELECT 1' }
    );

    assert.deepEqual(productionArguments.slice(5, 10), [
        '--config',
        '/tmp/wrangler.jsonc',
        '--env',
        'production',
        '--remote'
    ]);
    assert.ok(productionArguments.includes('--file'));
    assert.ok(localArguments.includes('--local'));
    assert.equal(localArguments.includes('--remote'), false);
});

test('import runner parses options and selects the source per target', context => {
    const directory = createFixtureDirectory(context);
    const pinnedSha = '4b9ebd56e45a52547258886866cfb943da03f620';
    const base = { projectRoot: directory, environment: {} };

    assert.deepEqual(
        parseImportOptions(['--', '--github-ref', 'abc', '--input-dir', '/x']),
        {
            githubRef: 'abc',
            inputDirectory: '/x',
            allowLocalProductionSource: false,
            resetPreview: false
        }
    );
    assert.deepEqual(parseImportOptions(['--allow-local-production-source']), {
        allowLocalProductionSource: true,
        resetPreview: false
    });
    assert.deepEqual(parseImportOptions(['--reset-preview']), {
        allowLocalProductionSource: false,
        resetPreview: true
    });
    assert.throws(() => parseImportOptions(['--input-dir']), /Usage/);
    assert.throws(() => parseImportOptions(['--unknown']), /Usage/);

    assert.deepEqual(
        resolveMongoImportSource('production', {
            ...base,
            environment: { MONGO_BACKUP_REF: pinnedSha }
        }),
        {
            kind: 'github',
            repository: 'serhii-chernenko/wishlist-db',
            ref: pinnedSha,
            requireCommitSha: true
        }
    );
    assert.throws(() => {
        resolveMongoImportSource('production', base);
    }, /MONGO_BACKUP_REF must identify/);
    assert.throws(() => {
        resolveMongoImportSource('production', {
            ...base,
            environment: {
                MONGO_BACKUP_REF: pinnedSha,
                MONGO_BACKUP_REPOSITORY: 'someone/else'
            }
        });
    }, /does not accept MONGO_BACKUP_REPOSITORY/);
    assert.throws(() => {
        resolveMongoImportSource('production', {
            ...base,
            inputDirectory: directory
        });
    }, /requires the explicit --allow-local-production-source flag/);
    assert.throws(() => {
        resolveMongoImportSource('production', {
            ...base,
            allowLocalProductionSource: true
        });
    }, /only valid together with --input-dir/);
    assert.throws(() => {
        resolveMongoImportSource('production', {
            ...base,
            inputDirectory: directory,
            allowLocalProductionSource: true,
            githubRef: pinnedSha
        });
    }, /not both/);
    assert.deepEqual(
        resolveMongoImportSource('production', {
            ...base,
            inputDirectory: directory,
            allowLocalProductionSource: true,
            environment: { MONGO_BACKUP_DIR: '/ignored' }
        }),
        { kind: 'directory', directory }
    );
    assert.throws(() => {
        resolveMongoImportSource('production', {
            ...base,
            inputDirectory: path.join(directory, 'missing'),
            allowLocalProductionSource: true
        });
    }, /does not exist/);

    assert.deepEqual(
        resolveMongoImportSource('preview', { ...base, githubRef: 'main' }),
        {
            kind: 'github',
            repository: 'serhii-chernenko/wishlist-db',
            ref: 'main',
            requireCommitSha: false
        }
    );
    assert.deepEqual(
        resolveMongoImportSource('preview', {
            ...base,
            inputDirectory: directory
        }),
        { kind: 'directory', directory }
    );
    assert.throws(() => {
        resolveMongoImportSource('preview', {
            ...base,
            inputDirectory: directory,
            githubRef: 'main'
        });
    }, /not both/);
    assert.throws(() => {
        resolveMongoImportSource('preview', {
            ...base,
            inputDirectory: directory,
            allowLocalProductionSource: true
        });
    }, /only valid for the production import target/);
    assert.throws(() => {
        resolveMongoImportSource('local', base);
    }, /does not exist/);
});

test('Mongo import trims and validates wish links and reports the invalid ones', async context => {
    const links: Array<string | undefined> = [
        '  https://example.com/good  ',
        'https://example.com/one https://example.com/two',
        'https://www.instagram.com/p/x/?igshid=1 / https://www.instagram.com/p/x',
        'not a url',
        'ftp://example.com/file',
        '',
        undefined,
        'http://example.com/ok'
    ];
    const directory = createFixtureDirectory(context, records => {
        records.users.splice(1, records.users.length - 1);
        records.wishes.splice(0, records.wishes.length);
        records.gives.splice(0, records.gives.length, {
            _id: { $oid: giveObjectId(0) },
            userId: { $oid: userObjectId(0) },
            wishId: { $oid: wishObjectId(0) }
        });
        links.forEach((link, index) => {
            records.wishes.push({
                _id: { $oid: wishObjectId(index) },
                userId: { $oid: userObjectId(0) },
                title: `Wish ${index}`,
                images: [],
                ...(link === undefined ? {} : { link })
            });
        });
    });
    const report = await runImport(directory);
    const sql = readSql(directory);

    assert.equal(report.invalidLinks, 2);
    assert.equal(
        JSON.parse(fs.readFileSync(report.outputReportPath, 'utf8'))
            .invalidLinks,
        2
    );
    assert.ok(sql.includes("'https://example.com/good'"));
    assert.ok(sql.includes("'https://example.com/one'"));
    assert.equal(sql.includes('https://example.com/two'), false);
    assert.ok(sql.includes("'https://www.instagram.com/p/x/?igshid=1'"));
    assert.equal(sql.includes('not a url'), false);
    assert.equal(sql.includes('ftp://'), false);
    assert.ok(sql.includes("'http://example.com/ok'"));
});

test('the preview reset flag is refused for every target but preview', async () => {
    assert.doesNotThrow(() => {
        assertPreviewResetTarget('preview');
    });

    for (const target of ['production', 'local'] as const) {
        assert.throws(() => {
            assertPreviewResetTarget(target);
        }, /only valid for the preview import target/);
        assert.throws(() => {
            resetPreviewTarget(target);
        }, /only valid for the preview import target/);
        await assert.rejects(
            runMongoImport(target, {
                allowLocalProductionSource: false,
                resetPreview: true
            }),
            /only valid for the preview import target/
        );
    }
});

test('the preview reset deletes dependent tables before their parents', () => {
    const tables = previewResetSql.split('\n').map(statement => {
        return /DELETE FROM "(\w+)";/.exec(statement)?.[1];
    });

    assert.deepEqual(tables, [
        'sessions',
        'telegram_updates',
        'release_announcements',
        'gives',
        'wishes',
        'wishlist_shares',
        'users'
    ]);
});

test('empty-target preflight counts only application tables and fails closed', () => {
    const counts = parseApplicationTableCounts(
        JSON.stringify([
            {
                success: true,
                results: [
                    {
                        users: 0,
                        wishes: 0,
                        gives: 0,
                        wishlistShares: 0,
                        sessions: 0,
                        telegramUpdates: 0,
                        releaseAnnouncements: 0
                    }
                ]
            }
        ])
    );

    assert.doesNotThrow(() => {
        assertApplicationTablesEmpty(counts);
    });
    assert.throws(() => {
        assertApplicationTablesEmpty({ ...counts, gives: 1 });
    }, /D1 import target is not empty: gives=1/);
    assert.throws(() => {
        assertApplicationTablesEmpty({ ...counts, sessions: 2, users: 1 });
    }, /users=1, sessions=2/);
    assert.throws(() => {
        assertApplicationTablesEmpty({ ...counts, wishlistShares: 1 });
    }, /wishlistShares=1/);
    assert.throws(() => {
        parseApplicationTableCounts(
            JSON.stringify([
                { success: true, results: [{ users: 0, wishes: 0 }] }
            ])
        );
    }, /invalid gives row count/);
});

test('GitHub CLI token fallback receives only CLI configuration environment', () => {
    const environment = createGithubCliTokenEnvironment({
        PATH: '/usr/local/bin:/usr/bin',
        HOME: '/home/operator',
        XDG_CONFIG_HOME: '/home/operator/.config',
        GH_CONFIG_DIR: '/secure/gh',
        GH_HOST: 'github.com',
        SystemRoot: 'C:\\Windows',
        GH_TOKEN: 'direct-token',
        GITHUB_TOKEN: 'actions-token',
        CLOUDFLARE_API_TOKEN: 'cloudflare-token',
        CLOUDFLARE_DATABASE_ID: 'database-id',
        BOT_TOKEN: 'bot-token',
        TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
        TELEGRAM_WEBHOOK_PATH: '/telegram/private'
    });

    assert.deepEqual(environment, {
        PATH: '/usr/local/bin:/usr/bin',
        HOME: '/home/operator',
        XDG_CONFIG_HOME: '/home/operator/.config',
        GH_CONFIG_DIR: '/secure/gh',
        GH_HOST: 'github.com',
        SystemRoot: 'C:\\Windows'
    });
    assert.deepEqual(getGithubCliTokenArguments(), [
        'auth',
        'token',
        '--hostname',
        'github.com'
    ]);
});

test('package import scripts use the one-shot wrapper and reconcile scripts', () => {
    const packageJson = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    const runnerSource = fs.readFileSync(
        path.resolve(process.cwd(), 'scripts/db/run-mongo-import.ts'),
        'utf8'
    );

    assert.equal(
        packageJson.scripts['db:import:local'],
        'tsx scripts/db/run-mongo-import.ts local'
    );
    assert.equal(
        packageJson.scripts['db:import:prod'],
        'tsx scripts/db/run-mongo-import.ts production'
    );
    assert.equal(
        packageJson.scripts['db:import:preview'],
        'tsx scripts/db/run-mongo-import.ts preview'
    );
    assert.equal(
        packageJson.scripts['db:reconcile:prod'],
        'tsx scripts/db/reconcile-import.ts production'
    );
    assert.equal(
        packageJson.scripts['db:reconcile:preview'],
        'tsx scripts/db/reconcile-import.ts preview'
    );
    assert.match(runnerSource, /preflightImportTarget\(target\)/);
    assert.match(runnerSource, /executeImportSql\(target/);
    assert.match(runnerSource, /finally \{/);
    assert.match(runnerSource, /fs\.rmSync\(sqlPath, \{ force: true \}\)/);
});

test('serializer keeps raw float notation in NDJSON output', () => {
    const exported = createSyntheticMongoExport();
    const serialized = serializeNdjson(exported.users);

    assert.match(serialized, /"telegramId":5\.733470387E\+09/);
    assert.match(serialized, /"telegramId":6100000001\.0/);
});

test('Mongo import never stores legacy Telegraph access tokens', async context => {
    const directory = createFixtureDirectory(context);
    const records = createSyntheticMongoExport();

    assert.ok(
        records.users.some(user => {
            return String(user.telegraphAccessToken ?? '').startsWith(
                'fake-token-'
            );
        })
    );

    await runImport(directory);

    assert.equal(readSql(directory).includes('fake-token-'), false);
});
