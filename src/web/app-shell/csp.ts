export const APP_SHELL_CSP = [
    "default-src 'none'",
    "script-src 'self' https://telegram.org",
    "connect-src 'self'",
    "img-src 'self' blob: data:",
    "style-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    'frame-ancestors https://web.telegram.org'
].join('; ');

export const APP_REDIRECT_CSP =
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const APP_SHELL_SECURITY_HEADERS = {
    'Content-Security-Policy': APP_SHELL_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=()',
    'X-Robots-Tag': 'noindex'
} as const;

export const APP_REDIRECT_SECURITY_HEADERS = {
    'Content-Security-Policy': APP_REDIRECT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex'
} as const;
