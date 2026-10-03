import type { Child } from 'hono/jsx';

import { SHARE_PAGE_LANGUAGES, type SharePageLanguage } from '../public-id';

export const SITE_NAME = 'Wishlist';

export const STYLESHEET_PATH = '/styles/share.css';

export const FONT_PRELOAD_PATH =
    '/fonts/unbounded-cyrillic-wght-normal.woff2?v=5.3.0';

const LIGHT_THEME_COLOR = '#f1e3fb';
const DARK_THEME_COLOR = '#1a1220';

export const OPEN_GRAPH_LOCALES = {
    uk: 'uk_UA',
    en: 'en_GB',
    pl: 'pl_PL'
} as const satisfies Record<SharePageLanguage, string>;

export interface PageAlternates {
    canonicalUrl: string;
    defaultUrl: string;
    urlByLanguage: Readonly<Record<SharePageLanguage, string>>;
    imageUrl: string;
}

export interface PageLayoutProps {
    language: SharePageLanguage;
    title: string;
    description: string;
    indexable: boolean;
    alternates?: PageAlternates;
    structuredData?: Readonly<Record<string, unknown>>;
    assetVersion: string;
    children?: Child;
}

const SCRIPT_BREAKING_CHARACTERS = /[<>&\u2028\u2029]/g;

const escapeJsonForHtml = (value: unknown) => {
    return JSON.stringify(value).replace(
        SCRIPT_BREAKING_CHARACTERS,
        character => {
            return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
        }
    );
};

const StructuredData = ({
    data
}: {
    data: Readonly<Record<string, unknown>>;
}) => {
    return (
        <script
            type='application/ld+json'
            dangerouslySetInnerHTML={{ __html: escapeJsonForHtml(data) }}
        />
    );
};

const PageHead = ({
    language,
    title,
    description,
    indexable,
    alternates,
    structuredData,
    assetVersion
}: Omit<PageLayoutProps, 'children'>) => {
    return (
        <head>
            <meta charset='utf-8' />
            <meta
                name='viewport'
                content='width=device-width, initial-scale=1'
            />
            <meta name='color-scheme' content='light dark' />
            <meta
                name='theme-color'
                content={LIGHT_THEME_COLOR}
                media='(prefers-color-scheme: light)'
            />
            <meta
                name='theme-color'
                content={DARK_THEME_COLOR}
                media='(prefers-color-scheme: dark)'
            />
            <title>{title}</title>
            <meta name='description' content={description} />
            <meta
                name='robots'
                content={indexable ? 'index, follow' : 'noindex'}
            />
            <link rel='icon' href='/favicon.ico' sizes='16x16 32x32 48x48' />
            <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
            <link
                rel='icon'
                href='/favicon-32.png'
                type='image/png'
                sizes='32x32'
            />
            <link rel='apple-touch-icon' href='/apple-touch-icon.png' />
            {alternates ? (
                <PageSocialMeta
                    language={language}
                    title={title}
                    description={description}
                    alternates={alternates}
                />
            ) : null}
            {structuredData ? <StructuredData data={structuredData} /> : null}
            <link
                rel='preload'
                href={FONT_PRELOAD_PATH}
                as='font'
                type='font/woff2'
                crossorigin='anonymous'
            />
            <link
                rel='stylesheet'
                href={`${STYLESHEET_PATH}?v=${encodeURIComponent(assetVersion)}`}
            />
        </head>
    );
};

const PageSocialMeta = ({
    language,
    title,
    description,
    alternates
}: {
    language: SharePageLanguage;
    title: string;
    description: string;
    alternates: PageAlternates;
}) => {
    return (
        <>
            <link rel='canonical' href={alternates.canonicalUrl} />
            {SHARE_PAGE_LANGUAGES.map(alternateLanguage => {
                return (
                    <link
                        rel='alternate'
                        hreflang={alternateLanguage}
                        href={alternates.urlByLanguage[alternateLanguage]}
                    />
                );
            })}
            <link
                rel='alternate'
                hreflang='x-default'
                href={alternates.defaultUrl}
            />
            <meta property='og:type' content='website' />
            <meta property='og:site_name' content={SITE_NAME} />
            <meta property='og:title' content={title} />
            <meta property='og:description' content={description} />
            <meta property='og:url' content={alternates.canonicalUrl} />
            <meta property='og:image' content={alternates.imageUrl} />
            <meta property='og:locale' content={OPEN_GRAPH_LOCALES[language]} />
            {SHARE_PAGE_LANGUAGES.filter(alternateLanguage => {
                return alternateLanguage !== language;
            }).map(alternateLanguage => {
                return (
                    <meta
                        property='og:locale:alternate'
                        content={OPEN_GRAPH_LOCALES[alternateLanguage]}
                    />
                );
            })}
            <meta name='twitter:card' content='summary_large_image' />
            <meta name='twitter:title' content={title} />
            <meta name='twitter:description' content={description} />
            <meta name='twitter:image' content={alternates.imageUrl} />
        </>
    );
};

export const PageLayout = (props: PageLayoutProps) => {
    return (
        <html lang={props.language}>
            <PageHead
                language={props.language}
                title={props.title}
                description={props.description}
                indexable={props.indexable}
                assetVersion={props.assetVersion}
                {...(props.alternates && { alternates: props.alternates })}
                {...(props.structuredData && {
                    structuredData: props.structuredData
                })}
            />
            <body>
                <div class='shell'>{props.children}</div>
            </body>
        </html>
    );
};
