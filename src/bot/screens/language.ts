import type { TranslationFunctions } from '../../i18n/i18n-types';
import {
    callbackButton,
    homeButton,
    singleColumnKeyboard
} from '../content/keyboards';
import { type AppLocale, resolveAppLocale } from '../i18n';
import { deriveRequest } from '../runtime/context';
import type {
    BotRequest,
    CallbackTable,
    LanguageChoice,
    ScreenModule
} from '../runtime/types';
import { getStoredLanguageChoice } from '../services/user-service';
import { escapeHtml } from '../utils/strings';
import { screen as homeScreen } from './home';

const LANGUAGE_ORDER_BY_LOCALE: Record<AppLocale, readonly AppLocale[]> = {
    uk: ['uk', 'en', 'pl'],
    en: ['en', 'uk', 'pl'],
    pl: ['pl', 'en', 'uk']
};

export const getLanguageChoices = (
    locale: AppLocale
): readonly LanguageChoice[] => {
    return [...LANGUAGE_ORDER_BY_LOCALE[locale], 'auto'];
};

export const getLanguageName = (
    LL: TranslationFunctions,
    choice: LanguageChoice
) => {
    return LL.language.names[choice]();
};

const render = async (req: BotRequest) => {
    const { LL } = req;
    const current = getStoredLanguageChoice(req.user, req.sessionLanguage);

    await req.send.text(
        [
            `<b>${LL.language.title()}</b>`,
            LL.language.description(),
            LL.language.current(escapeHtml(getLanguageName(LL, current)))
        ].join('\n\n'),
        singleColumnKeyboard([
            ...getLanguageChoices(req.locale).map(choice => {
                return callbackButton(LL.language.options[choice](), {
                    type: 'language',
                    choice
                });
            }),
            homeButton(LL)
        ])
    );
};

export const applyLanguageChoice = async (
    req: BotRequest,
    choice: LanguageChoice
) => {
    const updatedUser = await req.services.users.setLanguage({
        actor: req.actor,
        user: req.user,
        choice
    });
    const storedLanguage = choice === 'auto' ? null : choice;
    const nextLocale = resolveAppLocale(
        storedLanguage,
        req.actor.language_code
    );
    const nextReq = deriveRequest(req, {
        locale: nextLocale,
        user: updatedUser,
        sessionLanguage: req.user ? req.sessionLanguage : storedLanguage
    });

    req.telemetry.botActionCompleted({
        action: 'language_changed',
        result: choice
    });
    await nextReq.send.text(
        nextReq.LL.language.success(
            escapeHtml(getLanguageName(nextReq.LL, choice))
        )
    );
    await homeScreen.render(nextReq, undefined);
};

export const screen: ScreenModule = {
    id: 'language',
    render
};

export const callbacks: CallbackTable = {
    async language(req, action) {
        await applyLanguageChoice(req, action.choice);
    }
};
