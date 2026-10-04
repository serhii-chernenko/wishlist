import { buildHomeUrl, SHARE_PAGE_LANGUAGES } from './public-id';

const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const X_DEFAULT_HREFLANG = 'x-default';

const alternateLink = (hreflang: string, href: string) => {
    return `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`;
};

export const buildSitemap = (origin: string) => {
    const alternates = [
        ...SHARE_PAGE_LANGUAGES.map(language => {
            return alternateLink(language, buildHomeUrl(origin, language));
        }),
        alternateLink(X_DEFAULT_HREFLANG, buildHomeUrl(origin))
    ].join('');
    const entries = SHARE_PAGE_LANGUAGES.map(language => {
        return `<url><loc>${buildHomeUrl(origin, language)}</loc>${alternates}</url>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}" xmlns:xhtml="${XHTML_NAMESPACE}">${entries}</urlset>\n`;
};
