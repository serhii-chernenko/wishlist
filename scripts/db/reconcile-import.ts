import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadD1Environment } from './d1-child-environment';
import {
    executeD1Query,
    getProjectRoot,
    type ImportTarget
} from './d1-import-target';
import type { ImportAggregates, ImportReport } from './mongo-import';

export interface ObservedAggregates {
    users: number;
    wishes: number;
    gives: number;
    usernameSearchable: number;
    usersWithPhone: number;
    usersWithPayments: number;
    usersWithTelegraphToken: number;
    usersWithWishlistFilter: number;
    wishesWithoutUser: number;
    images: number;
    removed: number;
    done: number;
    hidden: number;
    priority: number;
    priceSum: number;
}

export interface ObservedState {
    aggregates: ObservedAggregates;
    releaseVersions: Record<string, number>;
    foreignKeyViolations: number;
}

export type ReconcileReport = Pick<
    ImportReport,
    'transformedCounts' | 'orphanWishes' | 'aggregates'
>;

export const aggregateSql = [
    'SELECT',
    '  (SELECT COUNT(*) FROM "users") AS "users",',
    '  (SELECT COUNT(*) FROM "wishes") AS "wishes",',
    '  (SELECT COUNT(*) FROM "gives") AS "gives",',
    '  (SELECT COUNT(*) FROM "users" WHERE "username_searchable" = 1) AS "usernameSearchable",',
    '  (SELECT COUNT(*) FROM "users" WHERE "phone" IS NOT NULL) AS "usersWithPhone",',
    '  (SELECT COUNT(*) FROM "users" WHERE "payments" IS NOT NULL) AS "usersWithPayments",',
    '  (SELECT COUNT(*) FROM "users" WHERE "telegraph_access_token" IS NOT NULL) AS "usersWithTelegraphToken",',
    '  (SELECT COUNT(*) FROM "users" WHERE "wishlist_filter" IS NOT NULL) AS "usersWithWishlistFilter",',
    '  (SELECT COUNT(*) FROM "wishes" WHERE "user_id" IS NULL) AS "wishesWithoutUser",',
    '  (SELECT COALESCE(SUM(json_array_length("images")), 0) FROM "wishes") AS "images",',
    '  (SELECT COUNT(*) FROM "wishes" WHERE "removed" = 1) AS "removed",',
    '  (SELECT COUNT(*) FROM "wishes" WHERE "done" = 1) AS "done",',
    '  (SELECT COUNT(*) FROM "wishes" WHERE "hidden" = 1) AS "hidden",',
    '  (SELECT COUNT(*) FROM "wishes" WHERE "priority" = 1) AS "priority",',
    '  (SELECT COALESCE(SUM("price"), 0) FROM "wishes") AS "priceSum";'
].join('\n');

export const releaseVersionSql =
    'SELECT "release_version" AS "releaseVersion", COUNT(*) AS "total" FROM "users" GROUP BY "release_version" ORDER BY "release_version";';

export const foreignKeyCheckSql = 'PRAGMA foreign_key_check;';

export const parseStatementRows = (
    output: string
): Record<string, unknown>[] => {
    let parsed: unknown;

    try {
        parsed = JSON.parse(output) as unknown;
    } catch (error) {
        throw new Error(`Wrangler returned invalid JSON: ${String(error)}`);
    }

    const envelope = Array.isArray(parsed) ? parsed[0] : undefined;

    if (
        typeof envelope !== 'object' ||
        envelope === null ||
        !('success' in envelope) ||
        envelope.success !== true ||
        !('results' in envelope) ||
        !Array.isArray(envelope.results)
    ) {
        throw new Error('Wrangler did not return a successful D1 result');
    }

    return envelope.results.map((row: unknown) => {
        if (typeof row !== 'object' || row === null) {
            throw new Error('Wrangler returned an invalid D1 result row');
        }

        return row as Record<string, unknown>;
    });
};

const readSafeCount = (value: unknown, name: string) => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`D1 returned an invalid ${name} value`);
    }

    return value as number;
};

export const parseObservedAggregates = (
    rows: Record<string, unknown>[]
): ObservedAggregates => {
    const [row] = rows;

    if (rows.length !== 1 || row === undefined) {
        throw new Error('D1 did not return exactly one aggregate row');
    }

    const read = (name: keyof ObservedAggregates) => {
        return readSafeCount(row[name], name);
    };

    return {
        users: read('users'),
        wishes: read('wishes'),
        gives: read('gives'),
        usernameSearchable: read('usernameSearchable'),
        usersWithPhone: read('usersWithPhone'),
        usersWithPayments: read('usersWithPayments'),
        usersWithTelegraphToken: read('usersWithTelegraphToken'),
        usersWithWishlistFilter: read('usersWithWishlistFilter'),
        wishesWithoutUser: read('wishesWithoutUser'),
        images: read('images'),
        removed: read('removed'),
        done: read('done'),
        hidden: read('hidden'),
        priority: read('priority'),
        priceSum: read('priceSum')
    };
};

export const parseReleaseVersions = (
    rows: Record<string, unknown>[]
): Record<string, number> => {
    const releaseVersions: Record<string, number> = {};

    for (const row of rows) {
        if (typeof row.releaseVersion !== 'string') {
            throw new Error('D1 returned an invalid release version');
        }

        releaseVersions[row.releaseVersion] = readSafeCount(
            row.total,
            'release version total'
        );
    }

    return releaseVersions;
};

export const compareWithReport = (
    report: ReconcileReport,
    observed: ObservedState
): string[] => {
    const mismatches: string[] = [];
    const expectNumber = (name: string, expected: number, actual: number) => {
        if (expected !== actual) {
            mismatches.push(`${name}: expected ${expected}, got ${actual}`);
        }
    };
    const expected: ImportAggregates = report.aggregates;
    const actual = observed.aggregates;

    expectNumber('users', report.transformedCounts.users, actual.users);
    expectNumber('wishes', report.transformedCounts.wishes, actual.wishes);
    expectNumber('gives', report.transformedCounts.gives, actual.gives);
    expectNumber(
        'usernameSearchable',
        expected.users.usernameSearchable,
        actual.usernameSearchable
    );
    expectNumber(
        'usersWithPhone',
        expected.users.withPhone,
        actual.usersWithPhone
    );
    expectNumber(
        'usersWithPayments',
        expected.users.withPayments,
        actual.usersWithPayments
    );
    expectNumber(
        'usersWithTelegraphToken',
        expected.users.withTelegraphToken,
        actual.usersWithTelegraphToken
    );
    expectNumber(
        'usersWithWishlistFilter',
        expected.users.withWishlistFilter,
        actual.usersWithWishlistFilter
    );
    expectNumber(
        'wishesWithoutUser',
        report.orphanWishes.count,
        actual.wishesWithoutUser
    );
    expectNumber('images', expected.wishes.images, actual.images);
    expectNumber('removed', expected.wishes.removed, actual.removed);
    expectNumber('done', expected.wishes.done, actual.done);
    expectNumber('hidden', expected.wishes.hidden, actual.hidden);
    expectNumber('priority', expected.wishes.priority, actual.priority);
    expectNumber('priceSum', expected.wishes.priceSum, actual.priceSum);
    expectNumber('foreignKeyViolations', 0, observed.foreignKeyViolations);

    const releaseVersions = new Set([
        ...Object.keys(expected.users.releaseVersions),
        ...Object.keys(observed.releaseVersions)
    ]);

    for (const releaseVersion of releaseVersions) {
        expectNumber(
            `releaseVersion ${releaseVersion}`,
            expected.users.releaseVersions[releaseVersion] ?? 0,
            observed.releaseVersions[releaseVersion] ?? 0
        );
    }

    return mismatches;
};

export const readReconcileReport = (reportPath: string): ReconcileReport => {
    if (!fs.existsSync(reportPath)) {
        throw new Error(
            `Import report not found at ${reportPath}; run the import first`
        );
    }

    const parsed = JSON.parse(
        fs.readFileSync(reportPath, 'utf8')
    ) as Partial<ImportReport>;

    if (
        !parsed.transformedCounts ||
        !parsed.orphanWishes ||
        !parsed.aggregates
    ) {
        throw new Error(
            `Import report ${reportPath} is missing required sections`
        );
    }

    return {
        transformedCounts: parsed.transformedCounts,
        orphanWishes: parsed.orphanWishes,
        aggregates: parsed.aggregates
    };
};

export const observeTarget = (target: ImportTarget): ObservedState => {
    const query = (command: string, label: string) => {
        return parseStatementRows(executeD1Query(target, command, label));
    };

    return {
        aggregates: parseObservedAggregates(
            query(aggregateSql, 'D1 aggregate query')
        ),
        releaseVersions: parseReleaseVersions(
            query(releaseVersionSql, 'D1 release version query')
        ),
        foreignKeyViolations: query(foreignKeyCheckSql, 'D1 foreign key check')
            .length
    };
};

const usage = 'Usage: reconcile-import.ts <production|preview>';

const parseTarget = (value: string | undefined): ImportTarget => {
    if (value === 'production' || value === 'preview') {
        return value;
    }

    throw new Error(usage);
};

export const runReconcile = (target: ImportTarget) => {
    const projectRoot = getProjectRoot();

    loadD1Environment(projectRoot);

    const report = readReconcileReport(
        path.join(projectRoot, '.backups', 'mongo-to-d1.report.json')
    );
    const observed = observeTarget(target);
    const mismatches = compareWithReport(report, observed);

    console.log(
        JSON.stringify(
            {
                target,
                expected: {
                    transformedCounts: report.transformedCounts,
                    orphanWishes: report.orphanWishes.count,
                    aggregates: report.aggregates
                },
                observed,
                mismatches
            },
            null,
            2
        )
    );

    if (mismatches.length > 0) {
        throw new Error(
            `Reconciliation failed with ${mismatches.length} mismatch(es): ${mismatches.join('; ')}`
        );
    }
};

const scriptPath = process.argv[1];

if (
    scriptPath &&
    import.meta.url === pathToFileURL(path.resolve(scriptPath)).href
) {
    try {
        runReconcile(parseTarget(process.argv[2]));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
