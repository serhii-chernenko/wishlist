import { callSafely, getLaunchContext, supportsNative } from './sdk';

const TELEGRAM_LINK_PATTERN = /^https:\/\/t\.me\//;
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

const openInBrowser = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
};

export const isSafeExternalUrl = (url: string) => {
    try {
        return EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
    } catch {
        return false;
    }
};

export const openLink = (url: string) => {
    if (!isSafeExternalUrl(url)) {
        return;
    }

    const { webApp, native } = getLaunchContext();

    if (native && webApp !== null) {
        callSafely(() => {
            webApp.openLink(url);
        });

        return;
    }

    openInBrowser(url);
};

export const openTelegramLink = (url: string) => {
    const { webApp, native } = getLaunchContext();

    if (native && webApp !== null && TELEGRAM_LINK_PATTERN.test(url)) {
        callSafely(() => {
            webApp.openTelegramLink(url);
        });

        return;
    }

    openLink(url);
};

export const buildShareUrl = (url: string, text: string) => {
    const query = new URLSearchParams({ url, text });

    return `https://t.me/share/url?${query.toString()}`;
};

export const closeApp = () => {
    const { webApp } = getLaunchContext();

    if (webApp === null) {
        window.close();

        return;
    }

    callSafely(() => {
        webApp.close();
    });
};

export const requestWriteAccess = () => {
    const { webApp } = getLaunchContext();

    return new Promise<boolean>(resolve => {
        if (webApp === null || !supportsNative('writeAccess')) {
            resolve(false);

            return;
        }

        callSafely(() => {
            webApp.requestWriteAccess?.(allowed => {
                resolve(allowed);
            });
        });
    });
};

export type ContactRequestResult = 'sent' | 'cancelled' | 'unsupported';

export const requestContact = () => {
    const { webApp } = getLaunchContext();

    return new Promise<ContactRequestResult>(resolve => {
        if (webApp === null || !supportsNative('contact')) {
            resolve('unsupported');

            return;
        }

        callSafely(() => {
            webApp.requestContact?.(sent => {
                resolve(sent ? 'sent' : 'cancelled');
            });
        });
    });
};
