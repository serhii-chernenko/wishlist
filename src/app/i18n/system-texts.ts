import type { AppDictionary, AppLocale } from '../../shared/app-api';

export type SystemNoticeKind =
    | 'outside'
    | 'expired'
    | 'unavailable'
    | 'previewOnly'
    | 'unsupported'
    | 'bootError';

export type SystemNoticeTexts = { title: string; text: string; cta: string };

export const SYSTEM_TEXTS = {
    uk: {
        outside: {
            title: 'Відкрий у Телеграмі',
            text: 'Цей застосунок працює всередині Телеграму. Відкрий його через бота, щоб побачити свій лист бажань.',
            cta: 'Відкрити в Телеграмі'
        },
        expired: {
            title: 'Сесія застаріла',
            text: 'Застосунок був відкритий надто довго. Закрий його й відкрий знову.',
            cta: 'Закрити застосунок'
        },
        unavailable: {
            title: 'Застосунок тимчасово недоступний',
            text: 'Ми вже працюємо над цим. Поки що все можна зробити в чаті з ботом.',
            cta: 'Відкрити бота'
        },
        previewOnly: {
            title: 'Тестова версія',
            text: 'Ця версія застосунку відкрита лише для автора. Скористайся основним ботом.',
            cta: 'Відкрити бота'
        },
        unsupported: {
            title: 'Потрібно оновити Телеграм',
            text: 'Твоя версія Телеграму не підтримує цей застосунок. Онови Телеграм або користуйся ботом у чаті.',
            cta: 'Відкрити бота'
        },
        bootError: {
            title: 'Не вдалося запустити застосунок',
            text: 'Спробуй відкрити його ще раз. Якщо не допоможе, бот у чаті працює як завжди.',
            cta: 'Спробувати ще раз'
        }
    },
    en: {
        outside: {
            title: 'Open in Telegram',
            text: 'This app works inside Telegram. Open it from the bot to see your wish list.',
            cta: 'Open in Telegram'
        },
        expired: {
            title: 'Session expired',
            text: 'The app has been open for too long. Close it and open it again.',
            cta: 'Close the app'
        },
        unavailable: {
            title: 'The app is temporarily unavailable',
            text: 'We are already on it. Meanwhile, you can do everything in the chat with the bot.',
            cta: 'Open the bot'
        },
        previewOnly: {
            title: 'Test version',
            text: 'This version of the app is open to the author only. Please use the main bot.',
            cta: 'Open the bot'
        },
        unsupported: {
            title: 'Telegram needs an update',
            text: 'Your Telegram version does not support this app. Update Telegram or use the bot in the chat.',
            cta: 'Open the bot'
        },
        bootError: {
            title: 'The app could not start',
            text: 'Try opening it again. If that does not help, the bot in the chat works as usual.',
            cta: 'Try again'
        }
    },
    pl: {
        outside: {
            title: 'Otwórz w Telegramie',
            text: 'Ta aplikacja działa wewnątrz Telegrama. Otwórz ją przez bota, aby zobaczyć swoją listę życzeń.',
            cta: 'Otwórz w Telegramie'
        },
        expired: {
            title: 'Sesja wygasła',
            text: 'Aplikacja była otwarta zbyt długo. Zamknij ją i otwórz ponownie.',
            cta: 'Zamknij aplikację'
        },
        unavailable: {
            title: 'Aplikacja jest chwilowo niedostępna',
            text: 'Już nad tym pracujemy. Tymczasem wszystko możesz zrobić w czacie z botem.',
            cta: 'Otwórz bota'
        },
        previewOnly: {
            title: 'Wersja testowa',
            text: 'Ta wersja aplikacji jest dostępna tylko dla autora. Skorzystaj z głównego bota.',
            cta: 'Otwórz bota'
        },
        unsupported: {
            title: 'Zaktualizuj Telegrama',
            text: 'Twoja wersja Telegrama nie obsługuje tej aplikacji. Zaktualizuj Telegrama albo korzystaj z bota w czacie.',
            cta: 'Otwórz bota'
        },
        bootError: {
            title: 'Nie udało się uruchomić aplikacji',
            text: 'Spróbuj otworzyć ją ponownie. Jeśli to nie pomoże, bot w czacie działa jak zwykle.',
            cta: 'Spróbuj ponownie'
        }
    }
} as const satisfies Record<
    AppLocale,
    Record<SystemNoticeKind, SystemNoticeTexts>
> &
    Record<AppLocale, Pick<AppDictionary, SystemNoticeKind>>;

export const resolveSystemLocale = (
    languageCode: string | null | undefined
): AppLocale => {
    const code = languageCode?.trim().toLowerCase();

    if (!code || code.startsWith('uk')) {
        return 'uk';
    }

    return code.startsWith('pl') ? 'pl' : 'en';
};

export const getSystemTexts = (
    locale: AppLocale,
    kind: SystemNoticeKind
): SystemNoticeTexts => {
    return SYSTEM_TEXTS[locale][kind];
};
