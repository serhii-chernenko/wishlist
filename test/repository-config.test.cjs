const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readRepositoryFile = relativePath => {
    return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
};

test('db layer files exist for the D1 migration path', async () => {
    const dbFiles = [
        '../src/db/index.ts',
        '../src/db/client.ts',
        '../src/db/schema.ts',
        '../src/db/schemas/index.ts',
        '../src/db/relations.ts',
        '../src/db/service.ts',
        '../src/db/repositories/index.ts',
        '../scripts/db/migrate-local.ts',
        '../scripts/db/prepare-mongo-import.ts',
        '../drizzle.production.config.ts',
        '../drizzle'
    ];

    for (const relativePath of dbFiles) {
        const absolutePath = path.join(__dirname, relativePath);

        assert.equal(fs.existsSync(absolutePath), true, absolutePath);
    }

    const drizzleDir = path.join(__dirname, '../drizzle');
    const migrationFiles = fs
        .readdirSync(drizzleDir, {
            recursive: true
        })
        .filter(fileName => fileName.endsWith('.sql'));

    assert.ok(migrationFiles.length > 0);
});

test('remote migration and webhook cutover cannot run from ordinary CI deploys', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json'));
    const workflowSource = readRepositoryFile('.github/workflows/main.yml');
    const wranglerConfig = JSON.parse(readRepositoryFile('wrangler.jsonc'));

    assert.equal(packageJson.scripts['deploy:prod'], undefined);
    assert.equal(packageJson.scripts['deploy:production'], undefined);
    assert.doesNotMatch(
        packageJson.scripts['worker:deploy:prod'],
        /db:migrate|telegram:webhook/
    );
    assert.doesNotMatch(workflowSource, /workflow_dispatch:/);
    assert.doesNotMatch(workflowSource, /^\s+deploy:/m);
    assert.doesNotMatch(workflowSource, /worker:deploy/);
    assert.doesNotMatch(workflowSource, /db:migrate/);
    assert.doesNotMatch(workflowSource, /telegram:webhook/);
    assert.doesNotMatch(workflowSource, /secrets\./);
    assert.equal(wranglerConfig.env.production.workers_dev, false);
    assert.equal(wranglerConfig.env.preview, undefined);
    assert.equal(wranglerConfig.env.production.preview_urls, true);
});

test('wrangler vars share one contract across local, production and preview', () => {
    const wranglerConfig = JSON.parse(readRepositoryFile('wrangler.jsonc'));
    const localVars = wranglerConfig.vars;
    const productionVars = wranglerConfig.env.production.vars;
    const previewVars = wranglerConfig.env.production.previews.vars;

    assert.deepEqual(
        Object.keys(productionVars).sort(),
        Object.keys(localVars).sort()
    );
    assert.deepEqual(
        Object.keys(previewVars).sort(),
        Object.keys(localVars).sort()
    );
    assert.equal(localVars.BOT_ENVIRONMENT, 'local');
    assert.equal(productionVars.BOT_ENVIRONMENT, 'production');
    assert.equal(previewVars.BOT_ENVIRONMENT, 'preview');
    assert.equal(localVars.ENABLE_RELEASE_BROADCAST, 'false');
    assert.equal(productionVars.ENABLE_RELEASE_BROADCAST, 'true');
    assert.equal(previewVars.ENABLE_RELEASE_BROADCAST, 'false');
});

test('production and preview use separate databases and release queues', () => {
    const wranglerConfig = JSON.parse(readRepositoryFile('wrangler.jsonc'));
    const production = wranglerConfig.env.production;
    const productionDatabase = production.d1_databases[0];
    const previewDatabase = production.previews.d1_databases[0];
    const productionQueue = production.queues.producers[0].queue;
    const previewQueue = production.previews.queues.producers[0].queue;

    assert.equal(production.name, 'wishlist');
    assert.equal(productionDatabase.database_name, 'wishlist-production');
    assert.equal(previewDatabase.database_name, 'wishlist-preview');
    assert.notEqual(
        productionDatabase.database_id,
        previewDatabase.database_id
    );
    assert.equal(productionQueue, 'wishlist-release-announcements');
    assert.equal(previewQueue, 'wishlist-preview-release-announcements');
    assert.equal(
        production.queues.consumers[0].dead_letter_queue,
        'wishlist-release-announcements-dlq'
    );
    assert.equal(production.previews.queues.consumers, undefined);
});

test('secrets files stay out of the example templates', () => {
    const exampleFiles = [
        '.dev.vars.example',
        '.dev.vars.production.example',
        '.dev.vars.preview.example'
    ];

    for (const exampleFile of exampleFiles) {
        const source = readRepositoryFile(exampleFile);

        assert.match(source, /^BOT_TOKEN="123456:/m, exampleFile);
        assert.match(source, /replace-with-a-secret-token/, exampleFile);
    }
});
