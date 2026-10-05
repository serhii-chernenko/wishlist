import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Telegram } from 'telegraf';

import { getLatestReleaseVersion } from '../../src/bot/content/releases';
import { getAvailableLanguageCodes, type AppLocale } from '../../src/bot/i18n';
import {
    createReleaseAnnouncementSender,
    sendReleaseAnnouncementCopy
} from '../../src/worker/queues/release-announcement-delivery';
import type { AppEnvTarget } from '../cloudflare/runtime-env';
import { resolveUploadCredentials } from './upload-media';

const USAGE =
    'Usage: pnpm releases:send:test [--version X.Y.Z] [--locale uk|en|pl] [--target=production|preview|local]';
const TARGET_FLAG_PREFIX = '--target=';
const VERSION_FLAG = '--version';
const LOCALE_FLAG = '--locale';
const DEFAULT_TARGET = 'production' satisfies AppEnvTarget;
const DEFAULT_LOCALE = 'uk' satisfies AppLocale;
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface SendTestArguments {
    version: string;
    locale: AppLocale;
    target: AppEnvTarget;
}

const parseTarget = (value: string): AppEnvTarget => {
    if (value === 'production' || value === 'preview' || value === 'local') {
        return value;
    }

    throw new Error(`Unknown target "${value}". ${USAGE}`);
};

const parseLocale = (value: string): AppLocale => {
    const locale = getAvailableLanguageCodes().find(code => {
        return code === value;
    });

    if (!locale) {
        throw new Error(`Unknown locale "${value}". ${USAGE}`);
    }

    return locale;
};

const parseVersion = (value: string) => {
    if (!releaseVersionPattern.test(value)) {
        throw new Error(`Invalid release version "${value}". ${USAGE}`);
    }

    return value;
};

const splitValueFlag = (argument: string, flag: string) => {
    return argument.startsWith(`${flag}=`)
        ? argument.slice(flag.length + 1)
        : null;
};

export const parseSendTestArguments = (
    argv: readonly string[],
    latestVersion: string = getLatestReleaseVersion()
): SendTestArguments => {
    let version = latestVersion;
    let locale: AppLocale = DEFAULT_LOCALE;
    let target: AppEnvTarget = DEFAULT_TARGET;

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index] as string;
        const versionValue = splitValueFlag(argument, VERSION_FLAG);
        const localeValue = splitValueFlag(argument, LOCALE_FLAG);

        if (argument.startsWith(TARGET_FLAG_PREFIX)) {
            target = parseTarget(argument.slice(TARGET_FLAG_PREFIX.length));
        } else if (argument === VERSION_FLAG || versionValue !== null) {
            index += argument === VERSION_FLAG ? 1 : 0;
            version = parseVersion(versionValue ?? argv[index] ?? '');
        } else if (argument === LOCALE_FLAG || localeValue !== null) {
            index += argument === LOCALE_FLAG ? 1 : 0;
            locale = parseLocale(localeValue ?? argv[index] ?? '');
        } else {
            throw new Error(`Unknown argument "${argument}". ${USAGE}`);
        }
    }

    return { version, locale, target };
};

const redact = (message: string, secret: string) => {
    return secret ? message.split(secret).join('[redacted]') : message;
};

const run = async () => {
    const { version, locale, target } = parseSendTestArguments(
        process.argv.slice(2)
    );
    const { botToken, chatId } = resolveUploadCredentials(target);

    try {
        const { albumPhotos } = await sendReleaseAnnouncementCopy({
            sender: createReleaseAnnouncementSender(new Telegram(botToken)),
            chatId,
            releaseVersion: version,
            locale
        });

        console.log(
            `Sent the ${version} announcement (${locale}, ${target} bot) to the admin chat${albumPhotos > 0 ? ` with a ${albumPhotos}-photo album` : ' without an album'}.`
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(redact(message, botToken));
    }
};

const scriptPath = process.argv[1];

if (
    scriptPath &&
    import.meta.url === pathToFileURL(path.resolve(scriptPath)).href
) {
    run().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
