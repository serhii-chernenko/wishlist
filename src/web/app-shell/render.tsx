import { HeroTag } from '../share/components/hero';
import type { SharePageLanguage } from '../share/public-id';
import { FONT_PRELOAD_PATH } from '../share/components/layout';

export const APP_STYLESHEET_PATH = '/app/app.css';
export const APP_SCRIPT_PATH = '/app/app.js';
export const TELEGRAM_SDK_URL = 'https://telegram.org/js/telegram-web-app.js';

const DOCTYPE = '<!DOCTYPE html>';
const APP_TITLE = 'Wishlist';
const DEFAULT_THEME = 'wishlist';
const LIGHT_THEME_COLOR = '#f1e3fb';
const SKELETON_TAG_COUNT = 3;

const NOSCRIPT_TEXTS = {
    uk: 'Для роботи застосунку потрібен JavaScript. Увімкніть його або відкрийте бота в Телеграмі.',
    en: 'The app needs JavaScript. Turn it on or open the bot in Telegram.',
    pl: 'Aplikacja wymaga JavaScriptu. Włącz go albo otwórz bota w Telegramie.'
} as const satisfies Record<SharePageLanguage, string>;

const UNAVAILABLE_TEXTS = {
    uk: {
        title: 'Застосунок тимчасово недоступний',
        text: 'Ми скоро повернемо його. Лист бажань усе ще працює в чаті з ботом.',
        action: 'Відкрити бота'
    },
    en: {
        title: 'The app is temporarily unavailable',
        text: 'We will bring it back soon. Your wish list still works in the bot chat.',
        action: 'Open the bot'
    },
    pl: {
        title: 'Aplikacja jest tymczasowo niedostępna',
        text: 'Wkrótce ją przywrócimy. Twoja lista życzeń nadal działa w czacie z botem.',
        action: 'Otwórz bota'
    }
} as const satisfies Record<
    SharePageLanguage,
    { title: string; text: string; action: string }
>;

const NOSCRIPT_LANGUAGES = ['uk', 'en', 'pl'] as const;

export interface AppShellModel {
    assetVersion: string;
    botUrl: string;
    environment: string;
}

export interface AppUnavailableModel {
    language: SharePageLanguage;
    assetVersion: string;
    botUrl: string;
}

const buildVersionedPath = (path: string, assetVersion: string) => {
    return `${path}?v=${encodeURIComponent(assetVersion)}`;
};

const AppHead = ({ assetVersion }: { assetVersion: string }) => {
    return (
        <head>
            <meta charset='utf-8' />
            <meta
                name='viewport'
                content='width=device-width, initial-scale=1, viewport-fit=cover'
            />
            <meta name='theme-color' content={LIGHT_THEME_COLOR} />
            <meta name='robots' content='noindex' />
            <title>{APP_TITLE}</title>
            <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
            <link rel='apple-touch-icon' href='/apple-touch-icon.png' />
            <link
                rel='preload'
                href={FONT_PRELOAD_PATH}
                as='font'
                type='font/woff2'
                crossorigin='anonymous'
            />
            <link
                rel='stylesheet'
                href={buildVersionedPath(APP_STYLESHEET_PATH, assetVersion)}
            />
        </head>
    );
};

const BootSkeleton = () => {
    return (
        <div class='screen'>
            <div class='boot' aria-hidden='true'>
                <div class='boot-tag boot-tag-hero' />
                {Array.from({ length: SKELETON_TAG_COUNT }, () => {
                    return <div class='boot-tag' />;
                })}
            </div>
        </div>
    );
};

const NoScriptNotice = () => {
    return (
        <noscript>
            <div class='screen'>
                {NOSCRIPT_LANGUAGES.map(language => {
                    return <p lang={language}>{NOSCRIPT_TEXTS[language]}</p>;
                })}
            </div>
        </noscript>
    );
};

const AppShell = ({ assetVersion, botUrl, environment }: AppShellModel) => {
    return (
        <html lang='uk' data-theme={DEFAULT_THEME}>
            <AppHead assetVersion={assetVersion} />
            <body>
                <div
                    id='root'
                    data-bot-url={botUrl}
                    data-env={environment}
                    data-version={assetVersion}
                >
                    <BootSkeleton />
                    <NoScriptNotice />
                </div>
                <script src={TELEGRAM_SDK_URL} />
                <script
                    type='module'
                    src={buildVersionedPath(APP_SCRIPT_PATH, assetVersion)}
                />
            </body>
        </html>
    );
};

const AppUnavailable = ({
    language,
    assetVersion,
    botUrl
}: AppUnavailableModel) => {
    const texts = UNAVAILABLE_TEXTS[language];

    return (
        <html lang={language} data-theme={DEFAULT_THEME}>
            <AppHead assetVersion={assetVersion} />
            <body>
                <main class='screen'>
                    <HeroTag
                        heading={<span class='hero-name'>{texts.title}</span>}
                    >
                        <p class='hero-meta'>{texts.text}</p>
                        <a
                            class='cta hero-action'
                            href={botUrl}
                            rel='noopener noreferrer'
                        >
                            {texts.action}
                        </a>
                    </HeroTag>
                </main>
            </body>
        </html>
    );
};

export const renderAppShell = (model: AppShellModel) => {
    return `${DOCTYPE}${(<AppShell {...model} />).toString()}`;
};

export const renderAppUnavailable = (model: AppUnavailableModel) => {
    return `${DOCTYPE}${(<AppUnavailable {...model} />).toString()}`;
};
