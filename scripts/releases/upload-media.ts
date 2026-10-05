import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    createTelegramApi,
    TelegramApiError,
    type MediaGroupPhoto,
    type SentPhotoMessage,
    type TelegramApi
} from '../../src/api/telegram-api';
import {
    findReleaseMediaProblems,
    RELEASE_MEDIA_MAX_ITEMS,
    RELEASE_MEDIA_MIN_ITEMS
} from '../../src/bot/content/release-media';
import {
    loadOptionalEnvFile,
    type AppEnvTarget
} from '../cloudflare/runtime-env';

export const RELEASE_MEDIA_CONFIG_FILE = 'releases.media.json';
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

const USAGE = `Usage: pnpm releases:media:upload <version> <file...> [--target=production|preview|local] (${RELEASE_MEDIA_MIN_ITEMS} to ${RELEASE_MEDIA_MAX_ITEMS} photos)`;
const TARGET_FLAG_PREFIX = '--target=';
const CONFIG_TARGET = 'production' satisfies AppEnvTarget;
const CREDENTIAL_KEYS = ['BOT_TOKEN', 'ADMIN_ID'] as const;
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const photoContentTypes: Readonly<Record<string, string>> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
};

const readPhotoContentType = (file: string) => {
    return photoContentTypes[path.extname(file).toLowerCase()];
};

export interface UploadArguments {
    version: string;
    files: string[];
    target: AppEnvTarget;
}

const parseTarget = (value: string): AppEnvTarget => {
    if (value === 'production' || value === 'preview' || value === 'local') {
        return value;
    }

    throw new Error(`Unknown target "${value}". ${USAGE}`);
};

export const parseUploadArguments = (
    argv: readonly string[]
): UploadArguments => {
    let target: AppEnvTarget = CONFIG_TARGET;
    const positional: string[] = [];

    for (const argument of argv) {
        if (argument.startsWith(TARGET_FLAG_PREFIX)) {
            target = parseTarget(argument.slice(TARGET_FLAG_PREFIX.length));
        } else if (argument.startsWith('--')) {
            throw new Error(`Unknown option "${argument}". ${USAGE}`);
        } else {
            positional.push(argument);
        }
    }

    const [version, ...files] = positional;

    if (!version || !releaseVersionPattern.test(version)) {
        throw new Error(
            `The first argument must be a release version. ${USAGE}`
        );
    }

    if (
        files.length < RELEASE_MEDIA_MIN_ITEMS ||
        files.length > RELEASE_MEDIA_MAX_ITEMS
    ) {
        throw new Error(
            `Expected ${RELEASE_MEDIA_MIN_ITEMS} to ${RELEASE_MEDIA_MAX_ITEMS} photos, got ${files.length}. ${USAGE}`
        );
    }

    for (const file of files) {
        if (!readPhotoContentType(file)) {
            throw new Error(
                `Unsupported photo type: ${file}. Use .jpg, .jpeg, .png or .webp`
            );
        }
    }

    return { version, files, target };
};

export const loadPhotos = async (
    files: readonly string[],
    readFile: (file: string) => Promise<Uint8Array> = fs.readFile
): Promise<MediaGroupPhoto[]> => {
    return Promise.all(
        files.map(async file => {
            const bytes = await readFile(file);

            if (bytes.byteLength > PHOTO_MAX_BYTES) {
                throw new Error(`Photo is larger than 10 MB: ${file}`);
            }

            return {
                photo: new Blob([bytes], {
                    type: readPhotoContentType(file) ?? ''
                }),
                filename: path.basename(file)
            };
        })
    );
};

export const pickLargestFileId = (message: SentPhotoMessage) => {
    const [largest] = [...message.photo].sort((left, right) => {
        return (
            right.width * right.height - left.width * left.height ||
            (right.file_size ?? 0) - (left.file_size ?? 0)
        );
    });

    if (!largest) {
        throw new Error('Telegram returned a message without photo sizes');
    }

    return largest.file_id;
};

export interface UploadReleaseMediaOptions {
    api: Pick<TelegramApi, 'sendMediaGroup' | 'deleteMessage'>;
    chatId: string;
    photos: readonly MediaGroupPhoto[];
    log?: (message: string) => void;
}

export const uploadReleaseMedia = async (
    options: UploadReleaseMediaOptions
) => {
    const { api, chatId, photos, log = console.log } = options;
    const messages = await api.sendMediaGroup(chatId, photos, {
        disable_notification: true
    });

    if (messages.length !== photos.length) {
        throw new Error(
            `Telegram returned ${messages.length} messages for ${photos.length} photos`
        );
    }

    const fileIds = messages.map(pickLargestFileId);
    let undeleted = 0;

    for (const message of messages) {
        try {
            await api.deleteMessage(chatId, message.message_id);
        } catch {
            undeleted += 1;
        }
    }

    if (undeleted > 0) {
        log(
            `Could not delete ${undeleted} uploaded message(s) from the admin chat; delete them by hand.`
        );
    }

    return fileIds;
};

export const mergeReleaseMedia = (
    currentConfigText: string | null,
    version: string,
    fileIds: readonly string[]
) => {
    const current: unknown =
        currentConfigText === null ? {} : JSON.parse(currentConfigText);
    const currentProblems = findReleaseMediaProblems(current);

    if (currentProblems.length > 0) {
        throw new Error(
            `${RELEASE_MEDIA_CONFIG_FILE} is invalid: ${currentProblems.join('; ')}`
        );
    }

    const next = {
        ...(current as Record<string, readonly string[]>),
        [version]: [...fileIds]
    };

    return `${JSON.stringify(next, null, 4)}\n`;
};

const readOptionalFile = async (file: string) => {
    try {
        return await fs.readFile(file, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw error;
    }
};

export const resolveUploadCredentials = (
    target: AppEnvTarget,
    environment: Record<string, string | undefined> = process.env,
    loadEnvFile: (target: AppEnvTarget) => unknown = loadOptionalEnvFile
) => {
    if (CREDENTIAL_KEYS.some(key => !environment[key])) {
        loadEnvFile(target);
    }

    const missing = CREDENTIAL_KEYS.filter(key => !environment[key]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}`
        );
    }

    return {
        botToken: environment.BOT_TOKEN as string,
        chatId: environment.ADMIN_ID as string
    };
};

const describeError = (error: unknown) => {
    if (error instanceof TelegramApiError) {
        return `${error.message}: ${error.response.description}`;
    }

    return error instanceof Error ? error.message : String(error);
};

const run = async () => {
    const { version, files, target } = parseUploadArguments(
        process.argv.slice(2)
    );
    const photos = await loadPhotos(files);
    const { botToken, chatId } = resolveUploadCredentials(target);
    const fileIds = await uploadReleaseMedia({
        api: createTelegramApi({ botToken }),
        chatId,
        photos
    });
    if (target !== CONFIG_TARGET) {
        console.log(
            `File ids of the ${target} bot (not saved; ${RELEASE_MEDIA_CONFIG_FILE} holds production file ids only):`
        );
        console.log(fileIds.join('\n'));
        return;
    }

    const configPath = path.resolve(RELEASE_MEDIA_CONFIG_FILE);

    await fs.writeFile(
        configPath,
        mergeReleaseMedia(await readOptionalFile(configPath), version, fileIds)
    );
    console.log(
        `Saved ${fileIds.length} file ids for ${version} to ${RELEASE_MEDIA_CONFIG_FILE}`
    );
};

const scriptPath = process.argv[1];

if (
    scriptPath &&
    import.meta.url === pathToFileURL(path.resolve(scriptPath)).href
) {
    run().catch((error: unknown) => {
        console.error(describeError(error));
        process.exit(1);
    });
}
