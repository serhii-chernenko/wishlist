import { useEffect } from 'hono/jsx/dom';

import { callSafely, getLaunchContext, supports, supportsNative } from './sdk';

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

export const expandApp = () => {
    const { webApp } = getLaunchContext();

    callSafely(() => {
        webApp?.expand();
    });
};

export const markAppReady = () => {
    const { webApp } = getLaunchContext();

    requestAnimationFrame(() => {
        callSafely(() => {
            webApp?.ready();
        });
    });
};

/** Calls `onActive` when Telegram re-activates the app (Bot API 8.0), the page becomes visible again, or the network returns. */
export const watchActivation = (onActive: () => void) => {
    const { webApp } = getLaunchContext();
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            onActive();
        }
    };
    const usesActivated = webApp !== null && supports(webApp, 'activated');

    if (usesActivated) {
        webApp.onEvent('activated', onActive);
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', onActive);

    return () => {
        if (usesActivated) {
            webApp.offEvent('activated', onActive);
        }

        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('online', onActive);
    };
};

const revealFocusedField = () => {
    const active = document.activeElement;

    if (active instanceof HTMLElement && active.matches(EDITABLE_SELECTOR)) {
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
};

/** Keeps the focused field visible when the iOS keyboard resizes the viewport. */
export const watchViewport = () => {
    const { webApp } = getLaunchContext();
    const handleViewport = (event: { isStateStable: boolean }) => {
        if (event.isStateStable) {
            revealFocusedField();
        }
    };

    webApp?.onEvent('viewportChanged', handleViewport);
    window.visualViewport?.addEventListener('resize', revealFocusedField);

    return () => {
        webApp?.offEvent('viewportChanged', handleViewport);
        window.visualViewport?.removeEventListener(
            'resize',
            revealFocusedField
        );
    };
};

export const useClosingConfirmation = (enabled: boolean) => {
    useEffect(() => {
        const { webApp } = getLaunchContext();

        if (
            !enabled ||
            webApp === null ||
            !supportsNative('closingConfirmation')
        ) {
            return;
        }

        callSafely(() => {
            webApp.enableClosingConfirmation();
        });

        return () => {
            callSafely(() => {
                webApp.disableClosingConfirmation();
            });
        };
    }, [enabled]);
};

export const useVerticalSwipesLock = (locked: boolean) => {
    useEffect(() => {
        const { webApp } = getLaunchContext();

        if (!locked || webApp === null || !supportsNative('verticalSwipes')) {
            return;
        }

        callSafely(() => {
            webApp.disableVerticalSwipes?.();
        });

        return () => {
            callSafely(() => {
                webApp.enableVerticalSwipes?.();
            });
        };
    }, [locked]);
};
