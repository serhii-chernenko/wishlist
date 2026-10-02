import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
    buildChunkedDeleteSql,
    copiedTablesInInsertOrder,
    countInsertStatements,
    getExportArguments,
    getExportSqlFileName,
    getWipeOrder
} from '../../scripts/db/copy-production-to-preview';
import { createD1Harness, type D1Harness } from './d1-harness';

const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const projectRoot = process.cwd();
const wranglerTimeoutMs = 60_000;
const trickyTitle = 'O\'Brien "Q"; DROP TABLE wishes;-- \u{1F451} Хай';
const multilineDescription =
    'first line\n\nsecond line with \'quotes\' and "double"';
const seededUserTotal = 150;
const seededWishTotal = 300;
const seededGiveTotal = 130;
const seededTimestamp = 1_752_580_800_000;
const localConfigSource = {
    name: 'copy-roundtrip',
    compatibility_date: '2026-05-09',
    d1_databases: [
        {
            binding: 'DB',
            database_name: 'wishlist-local',
            database_id: '00000000-0000-0000-0000-000000000000'
        }
    ]
};

const createWranglerEnvironment = () => {
    const environment: NodeJS.ProcessEnv = { ...process.env };

    delete environment.CLOUDFLARE_API_TOKEN;
    delete environment.CLOUDFLARE_ACCOUNT_ID;
    environment.WRANGLER_SEND_METRICS = 'false';

    return environment;
};

const runWrangler = (arguments_: string[]) => {
    return spawnSync(pnpmExecutable, ['exec', 'wrangler', ...arguments_], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: createWranglerEnvironment(),
        maxBuffer: 64 * 1024 * 1024,
        timeout: wranglerTimeoutMs
    });
};

const isWranglerRunnable = () => {
    const result = runWrangler(['--version']);

    return result.error === undefined && result.status === 0;
};

const createLocalDirectory = () => {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'wishlist-d1-roundtrip-')
    );
    const configPath = path.join(directory, 'wrangler.jsonc');
    const stateDirectory = path.join(directory, '.wrangler', 'state');

    fs.writeFileSync(configPath, JSON.stringify(localConfigSource));

    return {
        directory,
        configPath,
        stateDirectory,
        proxyPersistDirectory: path.join(stateDirectory, 'v3')
    };
};

type LocalDirectory = ReturnType<typeof createLocalDirectory>;

const getLocalExportArguments = (
    local: LocalDirectory,
    outputPath: string,
    table: string
) => {
    const remoteArguments = getExportArguments(local.configPath, outputPath, [
        table
    ]);
    const environmentIndex = remoteArguments.indexOf('--env');
    const withoutEnvironment = remoteArguments.filter((_, index) => {
        return index !== environmentIndex && index !== environmentIndex + 1;
    });

    return withoutEnvironment.slice(2).map(argument => {
        return argument === '--remote' ? '--local' : argument;
    });
};

const runChecked = (arguments_: string[]) => {
    const result = runWrangler(arguments_);

    assert.equal(
        result.status,
        0,
        `wrangler ${arguments_.join(' ')} failed: ${result.stderr}${result.stdout}`
    );

    return result.stdout;
};

const executeLocal = (
    local: LocalDirectory,
    source: { command: string } | { file: string }
) => {
    const sourceArguments =
        'command' in source
            ? ['--command', source.command]
            : ['--file', source.file];

    return runChecked([
        'd1',
        'execute',
        'DB',
        '--local',
        '--config',
        local.configPath,
        '--persist-to',
        local.stateDirectory,
        '--yes',
        '--json',
        ...sourceArguments
    ]);
};

const wipeApplicationTables = (local: LocalDirectory) => {
    for (const table of getWipeOrder(copiedTablesInInsertOrder)) {
        executeLocal(local, { command: buildChunkedDeleteSql(table) });
    }
};

const snapshotTables = async (harness: D1Harness) => {
    const snapshot: Record<string, string> = {};

    for (const table of copiedTablesInInsertOrder) {
        const { results } = await harness.env.DB.prepare(
            `SELECT * FROM ${table} ORDER BY id`
        ).all();

        snapshot[table] = JSON.stringify(results);
    }

    return snapshot;
};

const countTables = async (harness: D1Harness) => {
    const counts: Record<string, number> = {};

    for (const table of copiedTablesInInsertOrder) {
        const row = await harness.env.DB.prepare(
            `SELECT count(*) AS total FROM ${table}`
        ).first<{ total: number }>();

        counts[table] = row?.total ?? 0;
    }

    return counts;
};

const seedSourceDatabase = async (harness: D1Harness) => {
    const { DB } = harness.env;

    await DB.prepare(
        `INSERT INTO users (telegram_id, username, username_searchable, phone, phone_digits, language, currency, payments, wishlist_filter, release_version, created_at, updated_at)
        WITH RECURSIVE sequence(n) AS (
            SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < ?
        )
        SELECT n + 5000000000, 'User_' || n, n % 2, CASE WHEN n % 3 = 0 THEN '+38099' || n END, CASE WHEN n % 3 = 0 THEN '38099' || n END,
            CASE n % 4 WHEN 0 THEN 'pl' WHEN 1 THEN 'uk' ELSE NULL END, 'UAH', CASE WHEN n % 5 = 0 THEN 'jar ' || n END,
            CASE WHEN n % 7 = 0 THEN n % 5 END, '1.7.1', ?, ?
        FROM sequence`
    )
        .bind(seededUserTotal, seededTimestamp, seededTimestamp)
        .run();
    await DB.prepare(
        `INSERT INTO wishes (user_id, title, description, link, images, priority, hidden, removed, done, price, created_at, updated_at)
        WITH RECURSIVE sequence(n) AS (
            SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < ?
        )
        SELECT CASE WHEN n % 10 = 0 THEN NULL ELSE (n % ?) + 1 END, 'wish ' || n, CASE WHEN n % 2 = 0 THEN ? END, CASE WHEN n % 3 = 0 THEN 'https://example.com/' || n END,
            json_array('file-' || n || '-a', 'file-' || n || '-b'), n % 7 = 0, n % 11 = 0, n % 13 = 0, n % 17 = 0, n * 10, ?, ?
        FROM sequence`
    )
        .bind(
            seededWishTotal,
            seededUserTotal,
            multilineDescription,
            seededTimestamp,
            seededTimestamp
        )
        .run();
    await DB.prepare('UPDATE wishes SET title = ? WHERE id = 1')
        .bind(trickyTitle)
        .run();
    await DB.prepare(
        `INSERT INTO gives (user_id, wish_id, created_at)
        SELECT ((n * 7) % ?) + 1, n + 1, ? FROM (
            WITH RECURSIVE sequence(n) AS (
                SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < ?
            ) SELECT n FROM sequence
        )`
    )
        .bind(seededUserTotal, seededTimestamp, seededGiveTotal)
        .run();
};

describe('production to preview export and import round trip', () => {
    const wranglerRunnable = isWranglerRunnable();
    const localDirectories: LocalDirectory[] = [];
    let sourceSnapshot: Record<string, string>;
    let sourceCounts: Record<string, number>;
    let exportedSqlPaths: Record<string, string>;
    let destination: LocalDirectory;

    before(async () => {
        if (!wranglerRunnable) {
            return;
        }

        const source = createLocalDirectory();

        destination = createLocalDirectory();
        localDirectories.push(source, destination);

        const sourceHarness = await createD1Harness({
            persistDirectory: source.proxyPersistDirectory
        });

        try {
            await sourceHarness.applyMigrations();
            await seedSourceDatabase(sourceHarness);
            sourceSnapshot = await snapshotTables(sourceHarness);
            sourceCounts = await countTables(sourceHarness);
        } finally {
            await sourceHarness.dispose();
        }

        const destinationHarness = await createD1Harness({
            persistDirectory: destination.proxyPersistDirectory
        });

        try {
            await destinationHarness.applyMigrations();
        } finally {
            await destinationHarness.dispose();
        }

        exportedSqlPaths = {};

        for (const table of copiedTablesInInsertOrder) {
            const sqlPath = path.join(
                source.directory,
                getExportSqlFileName(table)
            );

            runChecked(getLocalExportArguments(source, sqlPath, table));
            exportedSqlPaths[table] = sqlPath;
        }
    });

    after(() => {
        for (const local of localDirectories) {
            fs.rmSync(local.directory, { recursive: true, force: true });
        }
    });

    it(
        'exports one file per table with exactly the source row count and no schema',
        { skip: !wranglerRunnable },
        () => {
            for (const table of copiedTablesInInsertOrder) {
                const exportedSql = fs.readFileSync(
                    exportedSqlPaths[table] ?? '',
                    'utf8'
                );

                assert.doesNotMatch(exportedSql, /CREATE (TABLE|INDEX)/);
                assert.doesNotMatch(exportedSql, /__drizzle_migrations/);
                assert.equal(
                    countInsertStatements(exportedSql, table),
                    sourceCounts[table]
                );
            }

            assert.equal(sourceCounts.users, seededUserTotal);
            assert.equal(sourceCounts.wishes, seededWishTotal);
            assert.ok((sourceCounts.gives ?? 0) > 100);
        }
    );

    it(
        'imports identical rows after a wipe and stays identical when repeated',
        { skip: !wranglerRunnable },
        async () => {
            for (let attempt = 0; attempt < 2; attempt++) {
                wipeApplicationTables(destination);

                for (const table of copiedTablesInInsertOrder) {
                    executeLocal(destination, {
                        file: exportedSqlPaths[table] ?? ''
                    });
                }

                const harness = await createD1Harness({
                    persistDirectory: destination.proxyPersistDirectory
                });

                try {
                    assert.deepEqual(await countTables(harness), sourceCounts);
                    assert.deepEqual(
                        await snapshotTables(harness),
                        sourceSnapshot
                    );
                } finally {
                    await harness.dispose();
                }
            }
        }
    );
});
