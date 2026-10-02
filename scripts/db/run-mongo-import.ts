import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    assertPreviewResetTarget,
    assertRemoteD1Target,
    executeImportSql,
    getProjectRoot,
    preflightImportTarget,
    resetPreviewTarget,
    type ImportTarget
} from './d1-import-target';
import { loadD1Environment } from './d1-child-environment';
import { getDefaultGithubRepository, prepareMongoImport } from './mongo-import';

const usage =
    'Usage: run-mongo-import.ts <local|production|preview> [--input-dir <path>] [--github-ref <ref>] [--allow-local-production-source] [--reset-preview]';

const parseTarget = (value: string | undefined): ImportTarget => {
    if (value === 'local' || value === 'production' || value === 'preview') {
        return value;
    }

    throw new Error(usage);
};

export interface ImportCliOptions {
    inputDirectory?: string;
    githubRef?: string;
    allowLocalProductionSource: boolean;
    resetPreview: boolean;
}

export const parseImportOptions = (arguments_: string[]): ImportCliOptions => {
    const rest = arguments_.filter(argument => argument !== '--');
    const options: ImportCliOptions = {
        allowLocalProductionSource: false,
        resetPreview: false
    };

    for (let index = 0; index < rest.length; index += 1) {
        const argument = rest[index];

        if (argument === '--allow-local-production-source') {
            options.allowLocalProductionSource = true;
        } else if (argument === '--reset-preview') {
            options.resetPreview = true;
        } else if (argument === '--input-dir' || argument === '--github-ref') {
            const value = rest[index + 1];

            if (!value || value.startsWith('--')) {
                throw new Error(usage);
            }

            if (argument === '--input-dir') {
                options.inputDirectory = value;
            } else {
                options.githubRef = value;
            }

            index += 1;
        } else {
            throw new Error(usage);
        }
    }

    return options;
};

export type MongoImportSourceSelection =
    | { kind: 'directory'; directory: string }
    | {
          kind: 'github';
          repository: string;
          ref: string;
          requireCommitSha: boolean;
      };

const resolveExistingDirectory = (directory: string, description: string) => {
    const resolvedDirectory = path.resolve(directory);

    if (
        !fs.existsSync(resolvedDirectory) ||
        !fs.statSync(resolvedDirectory).isDirectory()
    ) {
        throw new Error(
            `${description} does not exist: ${resolvedDirectory}. Pass --input-dir or set MONGO_BACKUP_DIR`
        );
    }

    return resolvedDirectory;
};

const resolveProductionSource = (
    options: ResolveSourceOptions
): MongoImportSourceSelection => {
    const { environment, githubRef, inputDirectory } = options;
    const ref = githubRef ?? (environment.MONGO_BACKUP_REF || undefined);

    if (options.allowLocalProductionSource && inputDirectory === undefined) {
        throw new Error(
            '--allow-local-production-source is only valid together with --input-dir'
        );
    }

    if (inputDirectory !== undefined) {
        if (!options.allowLocalProductionSource) {
            throw new Error(
                '--input-dir for the production import requires the explicit --allow-local-production-source flag'
            );
        }

        if (ref) {
            throw new Error(
                'Choose either --input-dir or a pinned MONGO_BACKUP_REF/--github-ref for the production import, not both'
            );
        }

        return {
            kind: 'directory',
            directory: resolveExistingDirectory(
                inputDirectory,
                'Production import backup directory'
            )
        };
    }

    if (!ref) {
        throw new Error(
            'MONGO_BACKUP_REF must identify the private backup repository commit to import'
        );
    }

    return {
        kind: 'github',
        repository: resolveMongoBackupRepository(
            'production',
            environment.MONGO_BACKUP_REPOSITORY
        ),
        ref,
        requireCommitSha: true
    };
};

interface ResolveSourceOptions {
    projectRoot: string;
    environment: Readonly<Record<string, string | undefined>>;
    inputDirectory?: string | undefined;
    githubRef?: string | undefined;
    allowLocalProductionSource?: boolean | undefined;
}

export const resolveMongoImportSource = (
    target: ImportTarget,
    options: ResolveSourceOptions
): MongoImportSourceSelection => {
    if (target === 'production') {
        return resolveProductionSource(options);
    }

    const { environment, githubRef, inputDirectory, projectRoot } = options;
    const ref = githubRef ?? (environment.MONGO_BACKUP_REF || undefined);
    const directoryOverride =
        inputDirectory ?? (environment.MONGO_BACKUP_DIR || undefined);

    if (options.allowLocalProductionSource) {
        throw new Error(
            `--allow-local-production-source is only valid for the production import target, not ${target}`
        );
    }

    if (ref && directoryOverride) {
        throw new Error(
            'Choose either MONGO_BACKUP_DIR/--input-dir or MONGO_BACKUP_REF/--github-ref, not both'
        );
    }

    if (ref) {
        return {
            kind: 'github',
            repository: resolveMongoBackupRepository(
                target,
                environment.MONGO_BACKUP_REPOSITORY
            ),
            ref,
            requireCommitSha: false
        };
    }

    return {
        kind: 'directory',
        directory: resolveExistingDirectory(
            directoryOverride ?? path.join(projectRoot, 'wishlist-db'),
            `${target} import backup directory`
        )
    };
};

export const resolveMongoBackupRepository = (
    target: ImportTarget,
    repositoryOverride: string | undefined
) => {
    const productionRepository = getDefaultGithubRepository();

    if (target === 'production' && repositoryOverride !== undefined) {
        throw new Error(
            `Production Mongo import does not accept MONGO_BACKUP_REPOSITORY; source is fixed to ${productionRepository}`
        );
    }

    return target === 'production'
        ? productionRepository
        : (repositoryOverride ?? productionRepository);
};

export const runMongoImport = async (
    target: ImportTarget,
    cliOptions: ImportCliOptions = {
        allowLocalProductionSource: false,
        resetPreview: false
    }
) => {
    if (cliOptions.resetPreview) {
        assertPreviewResetTarget(target);
    }

    const projectRoot = getProjectRoot();

    if (target !== 'local') {
        loadD1Environment(projectRoot);
    }

    const source = resolveMongoImportSource(target, {
        projectRoot,
        environment: process.env,
        inputDirectory: cliOptions.inputDirectory,
        githubRef: cliOptions.githubRef,
        allowLocalProductionSource: cliOptions.allowLocalProductionSource
    });

    if (target !== 'local') {
        assertRemoteD1Target(target);
    }

    const outputDirectory = path.join(projectRoot, '.backups');
    const sqlPath = path.join(outputDirectory, 'mongo-to-d1.sql');

    try {
        const report = await prepareMongoImport({ source, outputDirectory });

        if (cliOptions.resetPreview) {
            resetPreviewTarget(target);
        }

        const preflightCounts = preflightImportTarget(target);

        console.log(
            JSON.stringify(
                {
                    target,
                    source: report.source,
                    sourceCounts: report.sourceCounts,
                    transformedCounts: report.transformedCounts,
                    skippedGives: report.skipped.gives,
                    orphanWishes: report.orphanWishes.count,
                    droppedKeys: report.droppedKeys,
                    invalidLinks: report.invalidLinks,
                    resetPreview: cliOptions.resetPreview,
                    aggregates: report.aggregates,
                    validation: report.validation,
                    preflightCounts,
                    reportPath: report.outputReportPath
                },
                null,
                2
            )
        );

        executeImportSql(target, report.outputSqlPath);
    } finally {
        fs.rmSync(sqlPath, { force: true });
    }
};

const scriptPath = process.argv[1];

if (
    scriptPath &&
    import.meta.url === pathToFileURL(path.resolve(scriptPath)).href
) {
    void (async () => {
        await runMongoImport(
            parseTarget(process.argv[2]),
            parseImportOptions(process.argv.slice(3))
        );
    })().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
