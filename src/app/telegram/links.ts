import { settleNativeCall } from '../logic/native-call';
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
    return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
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

    return settleNativeCall<boolean>(settle => {
        if (
            webApp?.requestWriteAccess === undefined ||
            !supportsNative('writeAccess')
        ) {
            return false;
        }

        webApp.requestWriteAccess(allowed => {
            settle(allowed);
        });

        return true;
    }, false);
};

export type ContactRequestResult = 'sent' | 'cancelled' | 'unsupported';

export const requestContact = () => {
    const { webApp } = getLaunchContext();

    return settleNativeCall<ContactRequestResult>(settle => {
        if (
            webApp?.requestContact === undefined ||
            !supportsNative('contact')
        ) {
            return false;
        }

        webApp.requestContact(sent => {
            settle(sent ? 'sent' : 'cancelled');
        });

        return true;
    }, 'unsupported');
};
