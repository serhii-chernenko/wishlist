import type { Context } from 'telegraf';
import type { InlineKeyboardMarkup } from 'telegraf/types';

import { BotBlockedError, getErrorType } from '../errors';
import {
    getVisibleHtmlLength,
    htmlToPlainText,
    truncateText
} from '../utils/strings';
import {
    getTelegramRetryAfterSeconds,
    isTelegramBadRequest,
    isTelegramForbidden
} from '../utils/telegram-errors';
import { defaultSleep, type Sleep } from './defer';
import type {
    ReplyMarkup,
    Sender,
    WishMessage,
    WishlistBotTelemetry
} from './types';

export const TELEGRAM_CAPTION_LIMIT = 1024;

export const TELEGRAM_MESSAGE_LIMIT = 4096;

export const CALLBACK_TOAST_LIMIT = 200;

export const MAX_RETRY_AFTER_SECONDS = 5;

export const MAX_SEND_RETRIES = 3;

/**
 * Retries a Telegram call on 429 when `retry_after` is at most 5 seconds,
 * up to 3 times; every other failure is rethrown unchanged.
 */
export const sendWithRetry = async <T>(
    operation: () => Promise<T>,
    sleep: Sleep = defaultSleep
): Promise<T> => {
    let retries = 0;

    while (true) {
        try {
            return await operation();
        } catch (error) {
            const retryAfter = getTelegramRetryAfterSeconds(error);

            if (
                retryAfter === null ||
                retryAfter > MAX_RETRY_AFTER_SECONDS ||
                retries >= MAX_SEND_RETRIES
            ) {
                throw error;
            }

            retries += 1;
            await sleep(retryAfter * 1000);
        }
    }
};

const swallowBadRequest = async (operation: () => Promise<unknown>) => {
    try {
        await operation();
    } catch (error) {
        if (!isTelegramBadRequest(error)) {
            throw error;
        }
    }
};

const withReplyMarkup = (keyboard: ReplyMarkup | undefined) => {
    return keyboard ? { reply_markup: keyboard } : {};
};

export interface RuntimeSender extends Sender {
    answerCallback(): Promise<void>;
    isCallbackAnswered(): boolean;
}

export interface SenderDependencies {
    ctx: Context;
    chatId: number;
    sleep?: Sleep | undefined;
    telemetry?: WishlistBotTelemetry | undefined;
    onForbidden(): Promise<void>;
}

type WishMediaOutcome = 'complete' | 'needsText';

export const createSender = (deps: SenderDependencies): RuntimeSender => {
    const { ctx, chatId } = deps;
    const sleep = deps.sleep ?? defaultSleep;
    const isCallback = ctx.callbackQuery !== undefined;
    let callbackAnswered = false;

    const deliver = async <T>(operation: () => Promise<T>): Promise<T> => {
        try {
            return await sendWithRetry(operation, sleep);
        } catch (error) {
            if (isTelegramForbidden(error)) {
                await deps.onForbidden();
                throw new BotBlockedError(chatId);
            }

            throw error;
        }
    };

    const sendText = async (html: string, keyboard?: ReplyMarkup) => {
        await deliver(() => {
            return ctx.telegram.sendMessage(chatId, html, {
                parse_mode: 'HTML',
                ...withReplyMarkup(keyboard)
            });
        });
    };

    const sendWishMedia = async (
        item: WishMessage,
        keyboard: InlineKeyboardMarkup | undefined
    ): Promise<WishMediaOutcome> => {
        const [firstImage] = item.images;

        if (firstImage === undefined) {
            return 'needsText';
        }

        try {
            if (item.images.length > 1) {
                await deliver(() => {
                    return ctx.telegram.sendMediaGroup(
                        chatId,
                        item.images.map(media => {
                            return { type: 'photo' as const, media };
                        })
                    );
                });

                return 'needsText';
            }

            if (getVisibleHtmlLength(item.html) <= TELEGRAM_CAPTION_LIMIT) {
                await deliver(() => {
                    return ctx.telegram.sendPhoto(chatId, firstImage, {
                        caption: item.html,
                        parse_mode: 'HTML',
                        ...withReplyMarkup(keyboard)
                    });
                });

                return 'complete';
            }

            await deliver(() => {
                return ctx.telegram.sendPhoto(chatId, firstImage);
            });

            return 'needsText';
        } catch (error) {
            if (!isTelegramBadRequest(error)) {
                throw error;
            }

            deps.telemetry?.internalFailure({
                event: 'wish_media_failed',
                errorType: getErrorType(error)
            });

            return 'needsText';
        }
    };

    const answerCallback = async (text?: string) => {
        if (!isCallback || callbackAnswered) {
            return;
        }

        callbackAnswered = true;

        await swallowBadRequest(() => {
            return sendWithRetry(() => {
                return text === undefined
                    ? ctx.answerCbQuery()
                    : ctx.answerCbQuery(text);
            }, sleep);
        });
    };

    const editCallbackKeyboard = async (
        keyboard: InlineKeyboardMarkup | undefined
    ) => {
        if (!isCallback || !ctx.callbackQuery?.message) {
            return;
        }

        await swallowBadRequest(() => {
            return sendWithRetry(() => {
                return ctx.editMessageReplyMarkup(keyboard);
            }, sleep);
        });
    };

    return {
        text: sendText,
        async wish(item, keyboard) {
            const outcome = await sendWishMedia(item, keyboard);

            if (outcome === 'needsText') {
                await sendText(item.html, keyboard);
            }
        },
        async toast(text) {
            if (isCallback && !callbackAnswered) {
                await answerCallback(
                    truncateText(htmlToPlainText(text), CALLBACK_TOAST_LIMIT)
                );
                return;
            }

            await sendText(text);
        },
        removeKeyboard() {
            return editCallbackKeyboard(undefined);
        },
        replaceKeyboard(keyboard) {
            return editCallbackKeyboard(keyboard);
        },
        async deleteIncoming() {
            const incoming = ctx.message;

            if (!incoming) {
                return;
            }

            await swallowBadRequest(() => {
                return sendWithRetry(() => {
                    return ctx.telegram.deleteMessage(
                        chatId,
                        incoming.message_id
                    );
                }, sleep);
            });
        },
        answerCallback() {
            return answerCallback();
        },
        isCallbackAnswered() {
            return callbackAnswered;
        }
    };
};
