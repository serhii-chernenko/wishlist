import type { Context } from 'hono';

import type { WorkerApp } from '../../worker/app';
import type { WorkerBindings } from '../../worker/env';
import { matchAcceptLanguage } from '../share/accept-language';
import { etagMatches, getDeployId } from '../share/fingerprint';
import type { SharePageLanguage } from '../share/public-id';
import {
    APP_REDIRECT_SECURITY_HEADERS,
    APP_SHELL_SECURITY_HEADERS
} from './csp';
import { renderAppShell, renderAppUnavailable } from './render';

type AppShellContext = Context<{ Bindings: WorkerBindings }>;

const APP_PATH = '/app';
const APP_TRAILING_SLASH_PATH = '/app/';
const DEFAULT_LANGUAGE: SharePageLanguage = 'uk';
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const ETAG_BYTES = 16;
const REDIRECT_MAX_AGE_SECONDS = 86_400;

const bytesToHex = (bytes: Uint8Array) => {
    return Array.from(bytes, byte => {
        return byte.toString(16).padStart(2, '0');
    }).join('');
};

const computeShellFingerprint = async (
    deployId: string,
    enabled: boolean,
    language: SharePageLanguage | null
) => {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
            JSON.stringify(['app-shell', deployId, enabled, language])
        )
    );

    return bytesToHex(new Uint8Array(digest).slice(0, ETAG_BYTES));
};

const buildShellHeaders = (fingerprint: string) => {
    return new Headers({
        ...APP_SHELL_SECURITY_HEADERS,
        'Cache-Control': 'no-cache',
        ETag: `"${fingerprint}"`
    });
};

const serveAppShell = async (c: AppShellContext) => {
    const enabled = c.env.MINI_APP_ENABLED === 'true';
    const deployId = getDeployId(c.env);
    const language = enabled
        ? null
        : (matchAcceptLanguage(c.req.header('Accept-Language')) ??
          DEFAULT_LANGUAGE);
    const fingerprint = await computeShellFingerprint(
        deployId,
        enabled,
        language
    );
    const headers = buildShellHeaders(fingerprint);

    if (language !== null) {
        headers.set('Content-Language', language);
        headers.set('Vary', 'Accept-Language');
    }

    if (etagMatches(c.req.header('If-None-Match'), fingerprint)) {
        return new Response(null, { status: 304, headers });
    }

    headers.set('Content-Type', HTML_CONTENT_TYPE);

    const html =
        language === null
            ? renderAppShell({
                  assetVersion: deployId,
                  botUrl: c.env.WISHLIST_TG_URL,
                  environment: c.env.BOT_ENVIRONMENT
              })
            : renderAppUnavailable({
                  language,
                  assetVersion: deployId,
                  botUrl: c.env.WISHLIST_TG_URL
              });

    return new Response(html, { status: 200, headers });
};

const redirectToShell = (c: AppShellContext) => {
    return new Response(null, {
        status: 301,
        headers: new Headers({
            ...APP_REDIRECT_SECURITY_HEADERS,
            Location: `${APP_PATH}${new URL(c.req.url).search}`,
            'Cache-Control': `public, max-age=${REDIRECT_MAX_AGE_SECONDS}`
        })
    });
};

export const registerAppShellRoutes = (app: WorkerApp) => {
    app.get(APP_PATH, serveAppShell);
    app.get(APP_TRAILING_SLASH_PATH, redirectToShell);
};
