import type {
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove
} from 'telegraf/types';

import type { TranslationFunctions } from '../../i18n/i18n-types';
import { buildAppUrl } from '../../shared/app-links';
import {
    encodeCallbackData,
    type EncodableCallbackAction
} from '../callback-data';
import type { BotRequest, NavigationScreenId } from '../runtime/types';
import { resolvePublicOrigin } from '../services/share-service';

/**
 * Keyboard helpers return raw Bot API markup objects (not Telegraf `Markup`
 * wrappers) because `Sender` accepts raw `reply_markup` values.
 */
export const callbackButton = (
    text: string,
    action: EncodableCallbackAction
): InlineKeyboardButton.CallbackButton => {
    return { text, callback_data: encodeCallbackData(action) };
};

export const urlButton = (
    text: string,
    url: string
): InlineKeyboardButton.UrlButton => {
    return { text, url };
};

export const webAppButton = (
    text: string,
    url: string
): InlineKeyboardButton.WebAppButton => {
    return { text, web_app: { url } };
};

export const isMiniAppEnabled = (req: Pick<BotRequest, 'env'>) => {
    return req.env.MINI_APP_ENABLED === 'true';
};

export const appEntryButton = (
    req: Pick<BotRequest, 'env' | 'publicOrigin' | 'LL'>,
    start?: string
): InlineKeyboardButton.WebAppButton | null => {
    if (!isMiniAppEnabled(req)) {
        return null;
    }

    const origin = resolvePublicOrigin(
        req.publicOrigin,
        req.env.BOT_ENVIRONMENT
    );

    return webAppButton(req.LL.actions.openApp(), buildAppUrl(origin, start));
};

export const navigationButton = (
    text: string,
    screen: NavigationScreenId
): InlineKeyboardButton.CallbackButton => {
    return callbackButton(text, { type: 'navigate', screen });
};

export const homeButton = (LL: TranslationFunctions) => {
    return navigationButton(LL.actions.home(), 'home');
};

export const inlineKeyboard = (
    rows: readonly (readonly InlineKeyboardButton[])[]
): InlineKeyboardMarkup => {
    return {
        inline_keyboard: rows
            .filter(row => {
                return row.length > 0;
            })
            .map(row => {
                return [...row];
            })
    };
};

export const singleColumnKeyboard = (
    buttons: readonly (InlineKeyboardButton | null | undefined)[]
): InlineKeyboardMarkup => {
    return inlineKeyboard(
        buttons
            .filter((button): button is InlineKeyboardButton => {
                return Boolean(button);
            })
            .map(button => {
                return [button];
            })
    );
};

export const homeKeyboard = (LL: TranslationFunctions) => {
    return singleColumnKeyboard([homeButton(LL)]);
};

export const optionalUrlButton = (
    text: string,
    url: string | null | undefined
) => {
    return url ? urlButton(text, url) : null;
};

export const removeReplyKeyboard = (): ReplyKeyboardRemove => {
    return { remove_keyboard: true };
};

export const replyKeyboard = (
    buttons: readonly KeyboardButton[]
): ReplyKeyboardMarkup => {
    return {
        keyboard: buttons.map(button => {
            return [button];
        }),
        one_time_keyboard: true,
        resize_keyboard: true
    };
};

export const contactRequestKeyboard = (text: string) => {
    return replyKeyboard([{ text, request_contact: true }]);
};

export const removeValueKeyboard = (LL: TranslationFunctions) => {
    return replyKeyboard([{ text: LL.actions.remove() }]);
};
