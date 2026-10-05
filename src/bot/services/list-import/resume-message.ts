import type { TelegramApi } from '../../../api/telegram-api';
import type { ListImportRecord, UserRecord } from '../../../db/repositories';
import type { ListImportStatusDto } from '../../../shared/app-api';
import { encodeCallbackData } from '../../callback-data';
import { getTranslator, resolveAppLocale } from '../../i18n';

const HTML_PARSE_MODE = 'HTML';

const renderText = (
    user: Pick<UserRecord, 'language' | 'telegramLanguageCode'>,
    status: ListImportStatusDto
) => {
    const t = getTranslator(
        resolveAppLocale(user.language, user.telegramLanguageCode)
    ).listImport;

    if (status.state === 'failed') {
        return t.failed({ created: status.created });
    }

    const lines = [t.done.summary({ created: status.created })];

    if (status.createdGifted > 0) {
        lines.push(t.done.gifted({ gifted: status.createdGifted }));
    }

    if (status.photosPending > 0) {
        lines.push(t.done.photosLeft({ count: status.photosPending }));
    }

    return lines.join('\n');
};

/**
 * Rewrites the bot's progress message once a commit that the cron or a kick
 * resumed has finished, because the bot request that started it is gone.
 * Only bot imports with a stored message are touched, and every Telegram
 * error (an edited-away message, a blocked bot) is ignored.
 */
export const editResumedProgressMessage = async (
    telegram: TelegramApi | undefined,
    job: Pick<ListImportRecord, 'id' | 'channel' | 'chatMessageId'>,
    user: Pick<UserRecord, 'telegramId' | 'language' | 'telegramLanguageCode'>,
    status: ListImportStatusDto
) => {
    if (
        telegram === undefined ||
        job.channel !== 'bot' ||
        job.chatMessageId === null
    ) {
        return;
    }

    const t = getTranslator(
        resolveAppLocale(user.language, user.telegramLanguageCode)
    ).listImport;

    try {
        await telegram.editMessageText(
            user.telegramId,
            job.chatMessageId,
            renderText(user, status),
            {
                parse_mode: HTML_PARSE_MODE,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: t.refresh(),
                                callback_data: encodeCallbackData({
                                    type: 'listImportRefresh',
                                    jobId: job.id
                                })
                            }
                        ]
                    ]
                }
            }
        );
    } catch {
        return;
    }
};
