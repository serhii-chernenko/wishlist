import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
    failValidation,
    objectIdTimestampMilliseconds,
    readMongoBoolean,
    readMongoDate,
    readMongoInteger,
    readMongoOid,
    readOptionalMongoOid,
    readOptionalText,
    readRecord,
    rejectUnknownKeys
} from './mongo-extended-json';
import { extractLink } from '../../src/bot/input/link';

const githubApiOrigin = 'https://api.github.com';
const githubRequestTimeoutMilliseconds = 15_000;
const maximumSourceFileBytes = 5 * 1024 * 1024;
const maximumTotalSourceBytes = 15 * 1024 * 1024;
const maximumGithubMetadataBytes = 2 * 1024 * 1024;
const maximumD1StatementBytes = 100_000;
const maximumRowsPerStatement = 20;
const maximumWishImages = 9;
const defaultGithubRepository = 'serhii-chernenko/wishlist-db';
const defaultCurrency = 'UAH';
const defaultReleaseVersion = '0.0.0';
const githubCliEnvironmentKeys = new Set([
    'APPDATA',
    'COMSPEC',
    'ComSpec',
    'GH_CONFIG_DIR',
    'GH_HOST',
    'HOME',
    'LOCALAPPDATA',
    'PATH',
    'PATHEXT',
    'Path',
    'SYSTEMROOT',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'WINDIR',
    'XDG_CONFIG_HOME'
]);

const sourceFileNames = {
    users: ['users.json'],
    wishes: ['wishes.json'],
    gives: ['gives.json']
} as const;

const userKeys = new Set([
    '_id',
    'telegramId',
    'username',
    'phone',
    'currency',
    'telegraphAccessToken',
    'payments',
    'wishlistFilter',
    'version'
]);
const wishKeys = new Set([
    '_id',
    'userId',
    'title',
    'description',
    'link',
    'images',
    'priority',
    'price',
    'hidden',
    'removed',
    'done',
    'createdAt',
    'updatedAt'
]);
const giveKeys = new Set(['_id', 'userId', 'wishId']);
const droppedKeys = new Set(['__v', 'noticed', 'hideGreeting', 'language']);

type SourceCollection = keyof typeof sourceFileNames;
type ExportFormat = 'json-array' | 'ndjson';

interface MongoUserRecord {
    mongoId: string;
    telegramId: number;
    username: string | null;
    phone: string | null;
    currency: string | null;
    telegraphAccessToken: string | null;
    payments: string | null;
    wishlistFilter: number | null;
    version: string | null;
}

interface MongoWishRecord {
    mongoId: string;
    userMongoId: string | null;
    title: string;
    description: string | null;
    link: string | null;
    images: string[];
    priority: boolean;
    price: number;
    hidden: boolean;
    removed: boolean;
    done: boolean;
    createdAt: number;
    updatedAt: number;
}

interface MongoGiveRecord {
    mongoId: string;
    userMongoId: string;
    wishMongoId: string;
}

export interface UserRow {
    id: number;
    mongoId: string;
    telegramId: number;
    username: string | null;
    usernameSearchable: boolean;
    phone: string | null;
    phoneDigits: string | null;
    currency: string;
    telegraphAccessToken: string | null;
    payments: string | null;
    wishlistFilter: number | null;
    releaseVersion: string;
    createdAt: number;
    updatedAt: number;
}

export interface WishRow {
    id: number;
    mongoId: string;
    userId: number | null;
    title: string;
    description: string | null;
    link: string | null;
    images: string[];
    priority: boolean;
    hidden: boolean;
    removed: boolean;
    done: boolean;
    price: number;
    createdAt: number;
    updatedAt: number;
}

export interface GiveRow {
    id: number;
    mongoId: string;
    userId: number;
    wishId: number;
    createdAt: number;
}

export type SkippedGiveReason = 'missingUser' | 'missingWish' | 'removedWish';

export interface SkippedGive {
    mongoId: string;
    reason: SkippedGiveReason;
}

interface LoadedSourceFile {
    name: string;
    bytes: Uint8Array;
    sha256: string;
    blobSha: string | null;
    declaredByteLength: number;
}

type LoadedSourceFiles = Record<SourceCollection, LoadedSourceFile>;

interface SourceFileReport {
    name: string;
    format: ExportFormat;
    byteLength: number;
    declaredByteLength: number;
    sha256: string;
    blobSha: string | null;
    recordCount: number;
}

type SourceFilesReport = Record<SourceCollection, SourceFileReport>;

export type MongoImportSource =
    | {
          kind: 'directory';
          directory: string;
      }
    | {
          kind: 'github';
          repository?: string;
          ref: string;
          requireCommitSha?: boolean;
      };

type ImportSourceReport =
    | {
          kind: 'directory';
          directory: string;
          files: SourceFilesReport;
      }
    | {
          kind: 'github';
          repository: string;
          requestedRef: string;
          resolvedCommitSha: string;
          files: SourceFilesReport;
      };

export interface ImportAggregates {
    users: {
        total: number;
        usernameSearchable: number;
        withPhone: number;
        withPayments: number;
        withTelegraphToken: number;
        withWishlistFilter: number;
        releaseVersions: Record<string, number>;
    };
    wishes: {
        total: number;
        withoutUser: number;
        images: number;
        removed: number;
        done: number;
        hidden: number;
        priority: number;
        priceSum: number;
    };
    gives: {
        total: number;
    };
}

export interface ImportReport {
    source: ImportSourceReport;
    outputSqlPath: string;
    outputReportPath: string;
    sourceCounts: Record<SourceCollection, number>;
    transformedCounts: Record<SourceCollection, number>;
    skipped: {
        gives: SkippedGive[];
    };
    orphanWishes: {
        count: number;
        mongoIds: string[];
    };
    droppedKeys: Record<string, number>;
    invalidLinks: number;
    aggregates: ImportAggregates;
    validation: {
        validated: true;
    };
}

export interface PrepareMongoImportOptions {
    source: MongoImportSource;
    outputDirectory?: string;
    fetchImplementation?: typeof fetch;
    githubToken?: string;
}

interface ParsedSourceFile<T> {
    records: T[];
    report: SourceFileReport;
}

interface ParsedCollections {
    users: ParsedSourceFile<MongoUserRecord>;
    wishes: ParsedSourceFile<MongoWishRecord>;
    gives: ParsedSourceFile<MongoGiveRecord>;
}

interface ValidationContext {
    droppedKeyCounts: Map<string, number>;
    invalidLinks: number;
}

const normalizeImportedLink = (
    link: string | null,
    context: ValidationContext
) => {
    if (link === null) {
        return null;
    }

    const normalized = extractLink(link.trim());

    if (normalized === null) {
        context.invalidLinks += 1;
    }

    return normalized;
};

const readNonEmptyTitle = (value: unknown, location: string): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return failValidation(location, 'expected a non-empty string');
    }

    if (value.includes('\u0000')) {
        return failValidation(location, 'must not contain NUL characters');
    }

    return value;
};

const countDroppedKeys = (
    record: Record<string, unknown>,
    context: ValidationContext
) => {
    for (const key of Object.keys(record)) {
        if (droppedKeys.has(key)) {
            context.droppedKeyCounts.set(
                key,
                (context.droppedKeyCounts.get(key) ?? 0) + 1
            );
        }
    }
};

const allowedKeysWithDropped = (allowedKeys: ReadonlySet<string>) => {
    return new Set([...allowedKeys, ...droppedKeys]);
};

const userAllowedKeys = allowedKeysWithDropped(userKeys);
const wishAllowedKeys = allowedKeysWithDropped(wishKeys);
const giveAllowedKeys = allowedKeysWithDropped(giveKeys);

const validateUserRecord = (
    value: unknown,
    location: string,
    context: ValidationContext
): MongoUserRecord => {
    const record = readRecord(value, location);

    rejectUnknownKeys(record, userAllowedKeys, location);
    countDroppedKeys(record, context);

    const phone = readOptionalText(record.phone, `${location}.phone`, 64);

    if (phone !== null && !/\d/.test(phone)) {
        failValidation(`${location}.phone`, 'expected at least one digit');
    }

    const wishlistFilter =
        record.wishlistFilter === undefined || record.wishlistFilter === null
            ? null
            : readMongoInteger(
                  record.wishlistFilter,
                  `${location}.wishlistFilter`
              );

    if (wishlistFilter !== null && (wishlistFilter < 0 || wishlistFilter > 4)) {
        failValidation(
            `${location}.wishlistFilter`,
            'expected a known price filter between 0 and 4'
        );
    }

    return {
        mongoId: readMongoOid(record._id, `${location}._id`),
        telegramId: readMongoInteger(
            record.telegramId,
            `${location}.telegramId`,
            1
        ),
        username: readOptionalText(record.username, `${location}.username`, 64),
        phone,
        currency: readOptionalText(record.currency, `${location}.currency`, 16),
        telegraphAccessToken: readOptionalText(
            record.telegraphAccessToken,
            `${location}.telegraphAccessToken`,
            256
        ),
        payments: readOptionalText(
            record.payments,
            `${location}.payments`,
            4096
        ),
        wishlistFilter,
        version: readOptionalText(record.version, `${location}.version`, 128)
    };
};

const readImages = (value: unknown, location: string): string[] => {
    if (value === undefined || value === null) {
        return [];
    }

    if (!Array.isArray(value)) {
        return failValidation(location, 'expected an array');
    }

    if (value.length > maximumWishImages) {
        return failValidation(
            location,
            `expected at most ${maximumWishImages} images`
        );
    }

    return value.map((image, index) => {
        if (
            typeof image !== 'string' ||
            image.length === 0 ||
            image.length > 512 ||
            image.includes('\u0000')
        ) {
            return failValidation(
                `${location}[${index}]`,
                'expected a non-empty file id string'
            );
        }

        return image;
    });
};

const validateWishRecord = (
    value: unknown,
    location: string,
    context: ValidationContext
): MongoWishRecord => {
    const record = readRecord(value, location);

    rejectUnknownKeys(record, wishAllowedKeys, location);
    countDroppedKeys(record, context);

    const mongoId = readMongoOid(record._id, `${location}._id`);
    const objectIdTimestamp = objectIdTimestampMilliseconds(mongoId);
    const createdAt =
        record.createdAt === undefined || record.createdAt === null
            ? objectIdTimestamp
            : readMongoDate(record.createdAt, `${location}.createdAt`);
    const updatedAt =
        record.updatedAt === undefined || record.updatedAt === null
            ? createdAt
            : readMongoDate(record.updatedAt, `${location}.updatedAt`);

    return {
        mongoId,
        userMongoId: readOptionalMongoOid(record.userId, `${location}.userId`),
        title: readNonEmptyTitle(record.title, `${location}.title`),
        description: readOptionalText(
            record.description,
            `${location}.description`,
            16384
        ),
        link: normalizeImportedLink(
            readOptionalText(record.link, `${location}.link`, 16384),
            context
        ),
        images: readImages(record.images, `${location}.images`),
        priority: readMongoBoolean(
            record.priority,
            `${location}.priority`,
            false
        ),
        price:
            record.price === undefined || record.price === null
                ? 0
                : readMongoInteger(record.price, `${location}.price`, 0),
        hidden: readMongoBoolean(record.hidden, `${location}.hidden`, false),
        removed: readMongoBoolean(record.removed, `${location}.removed`, false),
        done: readMongoBoolean(record.done, `${location}.done`, false),
        createdAt,
        updatedAt
    };
};

const validateGiveRecord = (
    value: unknown,
    location: string,
    context: ValidationContext
): MongoGiveRecord => {
    const record = readRecord(value, location);

    rejectUnknownKeys(record, giveAllowedKeys, location);
    countDroppedKeys(record, context);

    return {
        mongoId: readMongoOid(record._id, `${location}._id`),
        userMongoId: readMongoOid(record.userId, `${location}.userId`),
        wishMongoId: readMongoOid(record.wishId, `${location}.wishId`)
    };
};

const parseJsonRecords = (content: string, fileName: string) => {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
        throw new Error(`Mongo export file ${fileName} is empty`);
    }

    if (trimmedContent.startsWith('[')) {
        let parsed: unknown;

        try {
            parsed = JSON.parse(trimmedContent) as unknown;
        } catch (error) {
            throw new Error(
                `Mongo export file ${fileName} contains malformed JSON: ${String(error)}`
            );
        }

        if (!Array.isArray(parsed)) {
            throw new Error(
                `Mongo export file ${fileName} must contain a JSON array`
            );
        }

        return {
            format: 'json-array' as const,
            records: parsed
        };
    }

    const records: unknown[] = [];
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]?.trim() ?? '';

        if (!line) {
            continue;
        }

        try {
            records.push(JSON.parse(line) as unknown);
        } catch (error) {
            throw new Error(
                `Mongo export file ${fileName} has malformed NDJSON at line ${index + 1}: ${String(error)}`
            );
        }
    }

    return {
        format: 'ndjson' as const,
        records
    };
};

const parseSourceFile = <T>(
    sourceFile: LoadedSourceFile,
    collection: SourceCollection,
    validate: (value: unknown, location: string) => T
): ParsedSourceFile<T> => {
    let content: string;

    try {
        content = new TextDecoder('utf-8', {
            fatal: true,
            ignoreBOM: false
        }).decode(sourceFile.bytes);
    } catch {
        throw new Error(
            `Mongo export file ${sourceFile.name} is not valid UTF-8`
        );
    }

    const parsed = parseJsonRecords(content, sourceFile.name);
    const records = parsed.records.map((record, index) => {
        return validate(record, `${collection}[${index}]`);
    });

    return {
        records,
        report: {
            name: sourceFile.name,
            format: parsed.format,
            byteLength: sourceFile.bytes.byteLength,
            declaredByteLength: sourceFile.declaredByteLength,
            sha256: sourceFile.sha256,
            blobSha: sourceFile.blobSha,
            recordCount: records.length
        }
    };
};

const hashBytes = (bytes: Uint8Array) => {
    return createHash('sha256').update(bytes).digest('hex');
};

const hashGitBlob = (bytes: Uint8Array) => {
    return createHash('sha1')
        .update(`blob ${bytes.byteLength}\0`)
        .update(bytes)
        .digest('hex');
};

const loadDirectoryFile = (
    directory: string,
    collection: SourceCollection
): LoadedSourceFile => {
    const candidateNames = sourceFileNames[collection];
    const matchingNames = candidateNames.filter(fileName => {
        const filePath = path.join(directory, fileName);

        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    });

    if (matchingNames.length !== 1) {
        throw new Error(
            matchingNames.length === 0
                ? `Missing ${collection} export; expected ${candidateNames.join(' or ')} in ${directory}`
                : `Ambiguous ${collection} export; keep only one of ${candidateNames.join(' or ')}`
        );
    }

    const name = matchingNames[0];

    if (!name) {
        throw new Error(`Failed to resolve ${collection} export file`);
    }

    const bytes = Uint8Array.from(fs.readFileSync(path.join(directory, name)));

    if (bytes.byteLength > maximumSourceFileBytes) {
        throw new Error(
            `Mongo export file ${name} exceeds the ${maximumSourceFileBytes}-byte safety limit`
        );
    }

    return {
        name,
        bytes,
        sha256: hashBytes(bytes),
        blobSha: null,
        declaredByteLength: bytes.byteLength
    };
};

const loadDirectorySource = (directory: string): LoadedSourceFiles => {
    const resolvedDirectory = path.resolve(directory);

    if (
        !fs.existsSync(resolvedDirectory) ||
        !fs.statSync(resolvedDirectory).isDirectory()
    ) {
        throw new Error(
            `Mongo export directory does not exist: ${resolvedDirectory}`
        );
    }

    return {
        users: loadDirectoryFile(resolvedDirectory, 'users'),
        wishes: loadDirectoryFile(resolvedDirectory, 'wishes'),
        gives: loadDirectoryFile(resolvedDirectory, 'gives')
    };
};

const validateGithubRepository = (repository: string) => {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
        throw new Error('GitHub repository must use the owner/name format');
    }

    return repository;
};

const containsAsciiControlCharacter = (value: string) => {
    for (const character of value) {
        if (character.charCodeAt(0) < 32) {
            return true;
        }
    }

    return false;
};

const validateGithubRef = (ref: string, requireCommitSha: boolean) => {
    const trimmedRef = ref.trim();

    if (
        !trimmedRef ||
        trimmedRef.length > 200 ||
        containsAsciiControlCharacter(trimmedRef)
    ) {
        throw new Error(
            'GitHub source ref must be a non-empty branch, tag, or SHA'
        );
    }

    if (requireCommitSha && !/^[0-9a-f]{40}$/i.test(trimmedRef)) {
        throw new Error(
            'Production Mongo import requires an immutable 40-character Git commit SHA'
        );
    }

    return trimmedRef;
};

export const createGithubCliTokenEnvironment = (
    source: Readonly<Record<string, string | undefined>>
) => {
    const environment: Record<string, string> = {};

    for (const [name, value] of Object.entries(source)) {
        if (value !== undefined && githubCliEnvironmentKeys.has(name)) {
            environment[name] = value;
        }
    }

    return environment;
};

export const getGithubCliTokenArguments = () => {
    return ['auth', 'token', '--hostname', 'github.com'];
};

const resolveGithubToken = (explicitToken?: string) => {
    const environmentToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const token = explicitToken || environmentToken;

    if (token) {
        const trimmedToken = token.trim();

        if (!trimmedToken || /\s/.test(trimmedToken)) {
            throw new Error('GitHub token contains invalid whitespace');
        }

        return trimmedToken;
    }

    const result = spawnSync('gh', getGithubCliTokenArguments(), {
        encoding: 'utf8',
        env: createGithubCliTokenEnvironment(
            process.env
        ) as unknown as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'ignore']
    });
    const ghToken = result.status === 0 ? result.stdout.trim() : '';

    if (!ghToken || /\s/.test(ghToken)) {
        throw new Error(
            'Private GitHub source requires GH_TOKEN, GITHUB_TOKEN, or an authenticated gh CLI'
        );
    }

    return ghToken;
};

const readLimitedResponse = async (
    response: Response,
    maximumBytes: number,
    description: string
) => {
    const contentLength = response.headers.get('Content-Length');

    if (contentLength) {
        const parsedLength = Number(contentLength);

        if (
            !Number.isSafeInteger(parsedLength) ||
            parsedLength > maximumBytes
        ) {
            throw new Error(
                `${description} exceeds the ${maximumBytes}-byte limit`
            );
        }
    }

    if (!response.body) {
        throw new Error(`${description} returned no response body`);
    }

    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    let receivedBytes = 0;

    while (true) {
        const result = await reader.read();

        if (result.done) {
            break;
        }

        receivedBytes += result.value.byteLength;

        if (receivedBytes > maximumBytes) {
            await reader.cancel();
            throw new Error(
                `${description} exceeds the ${maximumBytes}-byte limit`
            );
        }

        chunks.push(result.value);
    }

    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;

    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return bytes;
};

const fetchGithub = async (
    fetchImplementation: typeof fetch,
    url: string,
    token: string,
    maximumBytes: number,
    description: string,
    accept: string
) => {
    const parsedUrl = new URL(url);

    if (
        parsedUrl.origin !== githubApiOrigin ||
        parsedUrl.username ||
        parsedUrl.password
    ) {
        throw new Error(
            'Refusing to forward GitHub credentials outside api.github.com'
        );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, githubRequestTimeoutMilliseconds);

    try {
        const response = await fetchImplementation(url, {
            headers: {
                Accept: accept,
                Authorization: `Bearer ${token}`,
                'User-Agent': 'wishlist-mongo-to-d1-migration',
                'X-GitHub-Api-Version': '2026-03-10'
            },
            redirect: 'error',
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(
                `${description} failed with GitHub HTTP ${response.status}`
            );
        }

        return readLimitedResponse(response, maximumBytes, description);
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(
                `${description} timed out after ${githubRequestTimeoutMilliseconds}ms`
            );
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
};

const decodeJson = (bytes: Uint8Array, description: string): unknown => {
    try {
        const content = new TextDecoder('utf-8', {
            fatal: true,
            ignoreBOM: false
        }).decode(bytes);

        return JSON.parse(content) as unknown;
    } catch (error) {
        throw new Error(
            `${description} returned invalid JSON: ${String(error)}`
        );
    }
};

const loadGithubSource = async (
    source: Extract<MongoImportSource, { kind: 'github' }>,
    fetchImplementation: typeof fetch,
    explicitToken?: string
) => {
    const repository = validateGithubRepository(
        source.repository ?? defaultGithubRepository
    );

    if (source.requireCommitSha && repository !== defaultGithubRepository) {
        throw new Error(
            `Production Mongo import source must be ${defaultGithubRepository}`
        );
    }

    const requestedRef = validateGithubRef(
        source.ref,
        source.requireCommitSha ?? false
    );
    const token = resolveGithubToken(explicitToken);
    const encodedRepository = repository
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
    const commitBytes = await fetchGithub(
        fetchImplementation,
        `${githubApiOrigin}/repos/${encodedRepository}/commits/${encodeURIComponent(requestedRef)}`,
        token,
        1024 * 1024,
        `GitHub commit ${repository}@${requestedRef}`,
        'application/vnd.github+json'
    );
    const commitPayload = decodeJson(commitBytes, 'GitHub commit response');
    const commitRecord = readRecord(commitPayload, 'GitHub commit response');
    const resolvedCommitSha = commitRecord.sha;

    if (
        typeof resolvedCommitSha !== 'string' ||
        !/^[0-9a-f]{40}$/i.test(resolvedCommitSha)
    ) {
        throw new Error(
            'GitHub commit response did not contain a valid commit SHA'
        );
    }

    let totalSourceBytes = 0;

    const fetchSourceFile = async (
        collection: SourceCollection
    ): Promise<LoadedSourceFile> => {
        const name = sourceFileNames[collection][0];

        if (!name) {
            throw new Error(`No allowlisted file configured for ${collection}`);
        }

        const contentsUrl = `${githubApiOrigin}/repos/${encodedRepository}/contents/${encodeURIComponent(name)}?ref=${encodeURIComponent(resolvedCommitSha)}`;
        const metadataBytes = await fetchGithub(
            fetchImplementation,
            contentsUrl,
            token,
            maximumGithubMetadataBytes,
            `GitHub source metadata ${name}`,
            'application/vnd.github+json'
        );
        const metadata = readRecord(
            decodeJson(metadataBytes, `GitHub source metadata ${name}`),
            `GitHub source metadata ${name}`
        );
        const blobSha = metadata.sha;
        const declaredByteLength = metadata.size;

        if (metadata.name !== name || metadata.type !== 'file') {
            throw new Error(
                `GitHub source metadata for ${name} is not the expected file`
            );
        }

        if (typeof blobSha !== 'string' || !/^[0-9a-f]{40}$/i.test(blobSha)) {
            throw new Error(
                `GitHub source metadata for ${name} has an invalid blob SHA`
            );
        }

        if (
            !Number.isSafeInteger(declaredByteLength) ||
            (declaredByteLength as number) < 0 ||
            (declaredByteLength as number) > maximumSourceFileBytes ||
            totalSourceBytes + (declaredByteLength as number) >
                maximumTotalSourceBytes
        ) {
            throw new Error(
                `GitHub source metadata for ${name} has an unsafe file size`
            );
        }

        const bytes = await fetchGithub(
            fetchImplementation,
            contentsUrl,
            token,
            Math.min(
                maximumSourceFileBytes,
                maximumTotalSourceBytes - totalSourceBytes
            ),
            `GitHub source file ${name}`,
            'application/vnd.github.raw+json'
        );

        if (bytes.byteLength !== declaredByteLength) {
            throw new Error(
                `GitHub source file ${name} size ${bytes.byteLength} does not match metadata size ${declaredByteLength}`
            );
        }

        if (hashGitBlob(bytes) !== blobSha.toLowerCase()) {
            throw new Error(
                `GitHub source file ${name} does not match metadata blob SHA`
            );
        }

        totalSourceBytes += bytes.byteLength;

        return {
            name,
            bytes,
            sha256: hashBytes(bytes),
            blobSha: blobSha.toLowerCase(),
            declaredByteLength: declaredByteLength as number
        };
    };

    const usersFile = await fetchSourceFile('users');
    const wishesFile = await fetchSourceFile('wishes');
    const givesFile = await fetchSourceFile('gives');

    return {
        files: {
            users: usersFile,
            wishes: wishesFile,
            gives: givesFile
        },
        repository,
        requestedRef,
        resolvedCommitSha: resolvedCommitSha.toLowerCase()
    };
};

const parseCollections = (
    files: LoadedSourceFiles,
    context: ValidationContext
): ParsedCollections => {
    return {
        users: parseSourceFile(files.users, 'users', (value, location) => {
            return validateUserRecord(value, location, context);
        }),
        wishes: parseSourceFile(files.wishes, 'wishes', (value, location) => {
            return validateWishRecord(value, location, context);
        }),
        gives: parseSourceFile(files.gives, 'gives', (value, location) => {
            return validateGiveRecord(value, location, context);
        })
    };
};

const sortByMongoId = <T extends { mongoId: string }>(records: T[]) => {
    return [...records].sort((left, right) => {
        if (left.mongoId === right.mongoId) {
            return 0;
        }

        return left.mongoId < right.mongoId ? -1 : 1;
    });
};

const createUniqueMongoIdMap = <T extends { mongoId: string }>(
    records: T[],
    collection: SourceCollection
) => {
    const recordsByMongoId = new Map<string, T>();

    for (const record of records) {
        if (recordsByMongoId.has(record.mongoId)) {
            throw new Error(
                `Duplicate ${collection} Mongo ObjectId ${record.mongoId}`
            );
        }

        recordsByMongoId.set(record.mongoId, record);
    }

    return recordsByMongoId;
};

const assertUniqueValues = <T>(
    records: T[],
    describe: string,
    readValue: (record: T) => string | number | null
) => {
    const seenValues = new Set<string | number>();

    for (const record of records) {
        const value = readValue(record);

        if (value === null) {
            continue;
        }

        if (seenValues.has(value)) {
            throw new Error(`Duplicate ${describe} ${value}`);
        }

        seenValues.add(value);
    }
};

const stripNonDigits = (value: string) => value.replace(/\D/g, '');

const transformUsers = (records: MongoUserRecord[]): UserRow[] => {
    assertUniqueValues(records, 'Telegram user ID', record => {
        return record.telegramId;
    });
    assertUniqueValues(records, 'username (case-insensitive)', record => {
        return record.username === null ? null : record.username.toLowerCase();
    });
    assertUniqueValues(records, 'phone', record => record.phone);

    return sortByMongoId(records).map((record, index) => {
        const createdAt = objectIdTimestampMilliseconds(record.mongoId);

        return {
            id: index + 1,
            mongoId: record.mongoId,
            telegramId: record.telegramId,
            username: record.username,
            usernameSearchable: record.username !== null,
            phone: record.phone,
            phoneDigits:
                record.phone === null ? null : stripNonDigits(record.phone),
            currency: record.currency ?? defaultCurrency,
            telegraphAccessToken: record.telegraphAccessToken,
            payments: record.payments,
            wishlistFilter: record.wishlistFilter,
            releaseVersion: record.version ?? defaultReleaseVersion,
            createdAt,
            updatedAt: createdAt
        };
    });
};

const transformWishes = (
    records: MongoWishRecord[],
    userIdsByMongoId: Map<string, number>
): WishRow[] => {
    return sortByMongoId(records).map((record, index) => {
        return {
            id: index + 1,
            mongoId: record.mongoId,
            userId:
                record.userMongoId === null
                    ? null
                    : (userIdsByMongoId.get(record.userMongoId) ?? null),
            title: record.title,
            description: record.description,
            link: record.link,
            images: record.images,
            priority: record.priority,
            hidden: record.hidden,
            removed: record.removed,
            done: record.done,
            price: record.price,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    });
};

const classifyGive = (
    give: MongoGiveRecord,
    userIdsByMongoId: Map<string, number>,
    wishesByMongoId: Map<string, WishRow>
): SkippedGiveReason | null => {
    if (!userIdsByMongoId.has(give.userMongoId)) {
        return 'missingUser';
    }

    const wish = wishesByMongoId.get(give.wishMongoId);

    if (!wish) {
        return 'missingWish';
    }

    return wish.removed ? 'removedWish' : null;
};

const transformGives = (
    records: MongoGiveRecord[],
    userIdsByMongoId: Map<string, number>,
    wishRows: WishRow[]
) => {
    assertUniqueValues(records, 'give (user, wish) pair', record => {
        return `${record.userMongoId}:${record.wishMongoId}`;
    });

    const wishesByMongoId = new Map(
        wishRows.map(wish => {
            return [wish.mongoId, wish] as const;
        })
    );
    const skipped: SkippedGive[] = [];
    const giveRows: GiveRow[] = [];

    for (const record of sortByMongoId(records)) {
        const skipReason = classifyGive(
            record,
            userIdsByMongoId,
            wishesByMongoId
        );
        const userId = userIdsByMongoId.get(record.userMongoId);
        const wish = wishesByMongoId.get(record.wishMongoId);

        if (skipReason !== null || userId === undefined || !wish) {
            skipped.push({
                mongoId: record.mongoId,
                reason: skipReason ?? 'missingWish'
            });
            continue;
        }

        giveRows.push({
            id: giveRows.length + 1,
            mongoId: record.mongoId,
            userId,
            wishId: wish.id,
            createdAt: objectIdTimestampMilliseconds(record.mongoId)
        });
    }

    return { giveRows, skipped };
};

export const transformCollections = (collections: {
    users: MongoUserRecord[];
    wishes: MongoWishRecord[];
    gives: MongoGiveRecord[];
}) => {
    createUniqueMongoIdMap(collections.users, 'users');
    createUniqueMongoIdMap(collections.wishes, 'wishes');
    createUniqueMongoIdMap(collections.gives, 'gives');

    const userRows = transformUsers(collections.users);
    const userIdsByMongoId = new Map(
        userRows.map(user => {
            return [user.mongoId, user.id] as const;
        })
    );
    const wishRows = transformWishes(collections.wishes, userIdsByMongoId);
    const { giveRows, skipped } = transformGives(
        collections.gives,
        userIdsByMongoId,
        wishRows
    );

    return { userRows, wishRows, giveRows, skippedGives: skipped };
};

const countBy = <T>(rows: T[], predicate: (row: T) => boolean) => {
    return rows.filter(predicate).length;
};

export const summarizeAggregates = (
    userRows: UserRow[],
    wishRows: WishRow[],
    giveRows: GiveRow[]
): ImportAggregates => {
    const releaseVersions: Record<string, number> = {};

    for (const user of userRows) {
        releaseVersions[user.releaseVersion] =
            (releaseVersions[user.releaseVersion] ?? 0) + 1;
    }

    const priceSum = wishRows.reduce((sum, wish) => sum + wish.price, 0);

    if (!Number.isSafeInteger(priceSum)) {
        throw new Error('Sum of wish prices exceeds the safe integer range');
    }

    return {
        users: {
            total: userRows.length,
            usernameSearchable: countBy(userRows, user => {
                return user.usernameSearchable;
            }),
            withPhone: countBy(userRows, user => user.phone !== null),
            withPayments: countBy(userRows, user => user.payments !== null),
            withTelegraphToken: countBy(userRows, user => {
                return user.telegraphAccessToken !== null;
            }),
            withWishlistFilter: countBy(userRows, user => {
                return user.wishlistFilter !== null;
            }),
            releaseVersions
        },
        wishes: {
            total: wishRows.length,
            withoutUser: countBy(wishRows, wish => wish.userId === null),
            images: wishRows.reduce((sum, wish) => {
                return sum + wish.images.length;
            }, 0),
            removed: countBy(wishRows, wish => wish.removed),
            done: countBy(wishRows, wish => wish.done),
            hidden: countBy(wishRows, wish => wish.hidden),
            priority: countBy(wishRows, wish => wish.priority),
            priceSum
        },
        gives: {
            total: giveRows.length
        }
    };
};

const escapeSqlString = (value: string): string => value.replaceAll("'", "''");
const quoteString = (value: string): string => `'${escapeSqlString(value)}'`;

const quoteNullableString = (value: string | null): string => {
    return value === null ? 'NULL' : quoteString(value);
};

const quoteNullableNumber = (value: number | null): string => {
    return value === null ? 'NULL' : `${value}`;
};

const quoteBoolean = (value: boolean): string => {
    return value ? '1' : '0';
};

const formatUserTuple = (row: UserRow): string => {
    return `(${[
        row.id,
        quoteString(row.mongoId),
        row.telegramId,
        quoteNullableString(row.username),
        quoteBoolean(row.usernameSearchable),
        quoteNullableString(row.phone),
        quoteNullableString(row.phoneDigits),
        quoteString(row.currency),
        quoteNullableString(row.telegraphAccessToken),
        quoteNullableString(row.payments),
        quoteNullableNumber(row.wishlistFilter),
        quoteString(row.releaseVersion),
        row.createdAt,
        row.updatedAt
    ].join(', ')})`;
};

const formatWishTuple = (row: WishRow): string => {
    return `(${[
        row.id,
        quoteString(row.mongoId),
        quoteNullableNumber(row.userId),
        quoteString(row.title),
        quoteNullableString(row.description),
        quoteNullableString(row.link),
        quoteString(JSON.stringify(row.images)),
        quoteBoolean(row.priority),
        quoteBoolean(row.hidden),
        quoteBoolean(row.removed),
        quoteBoolean(row.done),
        row.price,
        row.createdAt,
        row.updatedAt
    ].join(', ')})`;
};

const formatGiveTuple = (row: GiveRow): string => {
    return `(${[
        row.id,
        quoteString(row.mongoId),
        row.userId,
        row.wishId,
        row.createdAt
    ].join(', ')})`;
};

const userColumns =
    '"id", "mongo_id", "telegram_id", "username", "username_searchable", "phone", "phone_digits", "currency", "telegraph_access_token", "payments", "wishlist_filter", "release_version", "created_at", "updated_at"';
const wishColumns =
    '"id", "mongo_id", "user_id", "title", "description", "link", "images", "priority", "hidden", "removed", "done", "price", "created_at", "updated_at"';
const giveColumns = '"id", "mongo_id", "user_id", "wish_id", "created_at"';

const byteLength = (value: string) => {
    return new TextEncoder().encode(value).byteLength;
};

const buildInsertStatements = (
    table: string,
    columns: string,
    tuples: string[]
): string[] => {
    const statements: string[] = [];
    const statementPrefix = `INSERT INTO "${table}" (${columns})\nVALUES `;
    let pendingTuples: string[] = [];

    const flush = () => {
        if (pendingTuples.length === 0) {
            return;
        }

        statements.push(`${statementPrefix}${pendingTuples.join(',\n')};`);
        pendingTuples = [];
    };

    for (const tuple of tuples) {
        const candidate = `${statementPrefix}${[...pendingTuples, tuple].join(',\n')};`;

        if (byteLength(candidate) > maximumD1StatementBytes) {
            if (pendingTuples.length === 0) {
                throw new Error(
                    `Generated D1 statement for ${table} exceeds the ${maximumD1StatementBytes}-byte safety limit`
                );
            }

            flush();
        }

        pendingTuples.push(tuple);

        if (pendingTuples.length === maximumRowsPerStatement) {
            flush();
        }
    }

    flush();

    return statements;
};

export const formatImportSql = (
    userRows: UserRow[],
    wishRows: WishRow[],
    giveRows: GiveRow[]
): string => {
    const sqlStatements = [
        'PRAGMA foreign_keys = ON;',
        ...buildInsertStatements(
            'users',
            userColumns,
            userRows.map(formatUserTuple)
        ),
        ...buildInsertStatements(
            'wishes',
            wishColumns,
            wishRows.map(formatWishTuple)
        ),
        ...buildInsertStatements(
            'gives',
            giveColumns,
            giveRows.map(formatGiveTuple)
        )
    ];

    return `${sqlStatements.join('\n\n')}\n`;
};

const getFilesReport = (collections: ParsedCollections): SourceFilesReport => {
    return {
        users: collections.users.report,
        wishes: collections.wishes.report,
        gives: collections.gives.report
    };
};

export const prepareMongoImport = async (
    options: PrepareMongoImportOptions
): Promise<ImportReport> => {
    const outputDirectory = path.resolve(
        options.outputDirectory ?? path.resolve(process.cwd(), '.backups')
    );
    const outputSqlPath = path.join(outputDirectory, 'mongo-to-d1.sql');
    const outputReportPath = path.join(
        outputDirectory,
        'mongo-to-d1.report.json'
    );

    fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
    fs.rmSync(outputSqlPath, { force: true });
    fs.rmSync(outputReportPath, { force: true });

    let files: LoadedSourceFiles;
    let sourceDetails:
        | { kind: 'directory'; directory: string }
        | {
              kind: 'github';
              repository: string;
              requestedRef: string;
              resolvedCommitSha: string;
          };

    if (options.source.kind === 'directory') {
        const directory = path.resolve(options.source.directory);
        files = loadDirectorySource(directory);
        sourceDetails = {
            kind: 'directory',
            directory
        };
    } else {
        const githubSource = await loadGithubSource(
            options.source,
            options.fetchImplementation ?? fetch,
            options.githubToken
        );
        files = githubSource.files;
        sourceDetails = {
            kind: 'github',
            repository: githubSource.repository,
            requestedRef: githubSource.requestedRef,
            resolvedCommitSha: githubSource.resolvedCommitSha
        };
    }

    const context: ValidationContext = {
        droppedKeyCounts: new Map(),
        invalidLinks: 0
    };
    const collections = parseCollections(files, context);
    const transformed = transformCollections({
        users: collections.users.records,
        wishes: collections.wishes.records,
        gives: collections.gives.records
    });
    const orphanWishes = transformed.wishRows.filter(wish => {
        return wish.userId === null;
    });
    const report: ImportReport = {
        source: {
            ...sourceDetails,
            files: getFilesReport(collections)
        },
        outputSqlPath,
        outputReportPath,
        sourceCounts: {
            users: collections.users.records.length,
            wishes: collections.wishes.records.length,
            gives: collections.gives.records.length
        },
        transformedCounts: {
            users: transformed.userRows.length,
            wishes: transformed.wishRows.length,
            gives: transformed.giveRows.length
        },
        skipped: {
            gives: transformed.skippedGives
        },
        orphanWishes: {
            count: orphanWishes.length,
            mongoIds: orphanWishes.map(wish => wish.mongoId)
        },
        droppedKeys: Object.fromEntries(
            [...context.droppedKeyCounts.entries()].sort(([left], [right]) => {
                return left.localeCompare(right);
            })
        ),
        invalidLinks: context.invalidLinks,
        aggregates: summarizeAggregates(
            transformed.userRows,
            transformed.wishRows,
            transformed.giveRows
        ),
        validation: {
            validated: true
        }
    };

    fs.writeFileSync(
        outputSqlPath,
        formatImportSql(
            transformed.userRows,
            transformed.wishRows,
            transformed.giveRows
        ),
        { encoding: 'utf8', mode: 0o600 }
    );
    fs.writeFileSync(outputReportPath, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
    });

    return report;
};

export const getDefaultGithubRepository = () => defaultGithubRepository;
