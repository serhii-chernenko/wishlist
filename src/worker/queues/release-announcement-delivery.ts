import {
    getReleases,
    renderReleaseAnnouncement
} from '../../bot/content/releases';
import { getReleaseMedia } from '../../bot/content/release-media';
import type { AppLocale } from '../../bot/i18n';

export type ReleaseAnnouncementChatId = number | string;

export const RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS = {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true }
} as const;

export interface ReleaseAnnouncementTelegram {
    sendPhoto(
        chatId: ReleaseAnnouncementChatId,
        photo: string
    ): Promise<unknown>;
    sendMediaGroup(
        chatId: ReleaseAnnouncementChatId,
        media: { type: 'photo'; media: string }[]
    ): Promise<unknown>;
    sendMessage(
        chatId: ReleaseAnnouncementChatId,
        text: string,
        extra: typeof RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS
    ): Promise<unknown>;
}

export interface ReleaseAnnouncementSender {
    sendReleaseMedia: (
        chatId: ReleaseAnnouncementChatId,
        fileIds: readonly string[]
    ) => Promise<void>;
    sendMessage: (
        chatId: ReleaseAnnouncementChatId,
        html: string
    ) => Promise<void>;
}

export const renderReleaseAnnouncementText = (
    releaseVersion: string,
    locale: AppLocale
) => {
    const release = getReleases().find(candidate => {
        return candidate.version === releaseVersion;
    });

    return release ? renderReleaseAnnouncement(release, locale) : null;
};

export const createReleaseAnnouncementSender = (
    telegram: ReleaseAnnouncementTelegram
): ReleaseAnnouncementSender => {
    return {
        async sendReleaseMedia(chatId, fileIds) {
            const [singleFileId] = fileIds;

            if (fileIds.length === 1 && singleFileId !== undefined) {
                await telegram.sendPhoto(chatId, singleFileId);
                return;
            }

            await telegram.sendMediaGroup(
                chatId,
                fileIds.map(fileId => {
                    return { type: 'photo', media: fileId };
                })
            );
        },
        async sendMessage(chatId, html) {
            await telegram.sendMessage(
                chatId,
                html,
                RELEASE_ANNOUNCEMENT_MESSAGE_OPTIONS
            );
        }
    };
};

export interface SendReleaseAnnouncementCopyOptions {
    sender: ReleaseAnnouncementSender;
    chatId: ReleaseAnnouncementChatId;
    releaseVersion: string;
    locale: AppLocale;
    getMedia?: (releaseVersion: string) => readonly string[];
}

export interface ReleaseAnnouncementCopyResult {
    mediaPhotos: number;
}

export const sendReleaseAnnouncementCopy = async (
    options: SendReleaseAnnouncementCopyOptions
): Promise<ReleaseAnnouncementCopyResult> => {
    const {
        sender,
        chatId,
        releaseVersion,
        locale,
        getMedia = getReleaseMedia
    } = options;
    const text = renderReleaseAnnouncementText(releaseVersion, locale);

    if (text === null) {
        throw new Error(`No release notes found for ${releaseVersion}`);
    }

    const fileIds = getMedia(releaseVersion);

    if (fileIds.length > 0) {
        await sender.sendReleaseMedia(chatId, fileIds);
    }

    await sender.sendMessage(chatId, text);

    return { mediaPhotos: fileIds.length };
};
