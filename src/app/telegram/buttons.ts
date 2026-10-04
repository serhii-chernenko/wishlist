import { useEffect, useState } from 'hono/jsx/dom';

import {
    createBottomButtonRegistry,
    type BottomButtonConfig,
    type BottomButtonState
} from '../logic/bottom-button';
import { createStore, useLatest, type Store } from '../state/store';
import { callSafely, getLaunchContext, supportsNative } from './sdk';
import { BOTTOM_BUTTON_COLORS } from './theme';
import type { WebAppBottomButton, WebAppHeaderButton } from './types';

export type { BottomButtonConfig, BottomButtonState };

export const bottomButtonStore: Store<BottomButtonState | null> =
    createStore<BottomButtonState | null>(null);

const bottomButtonRegistry = createBottomButtonRegistry(bottomButtonStore);

export const triggerBottomButton = bottomButtonRegistry.trigger;

const getNativeBottomButton = (): WebAppBottomButton | null => {
    const { webApp, native } = getLaunchContext();

    return native && webApp !== null
        ? (webApp.BottomButton ?? webApp.MainButton)
        : null;
};

const applyNativeBottomButton = (state: BottomButtonState | null) => {
    const button = getNativeBottomButton();

    if (button === null) {
        return;
    }

    callSafely(() => {
        if (state === null) {
            button.hideProgress();
            button.hide();

            return;
        }

        button.setParams({
            text: state.text,
            color: BOTTOM_BUTTON_COLORS.color,
            text_color: BOTTOM_BUTTON_COLORS.textColor,
            is_active: !state.disabled,
            is_visible: true
        });

        if (state.progress) {
            button.showProgress(false);
        } else {
            button.hideProgress();
        }
    });
};

export const isNativeBottomButton = () => {
    return getNativeBottomButton() !== null;
};

export const connectBottomButton = () => {
    const button = getNativeBottomButton();

    if (button === null) {
        return () => undefined;
    }

    callSafely(() => {
        button.onClick(triggerBottomButton);
    });

    const unsubscribe = bottomButtonStore.subscribe(() => {
        applyNativeBottomButton(bottomButtonStore.get());
    });

    applyNativeBottomButton(bottomButtonStore.get());

    return () => {
        unsubscribe();
        callSafely(() => {
            button.offClick(triggerBottomButton);
        });
    };
};

/** Owns the Telegram BottomButton (or its in-page fallback) while the calling screen is mounted; pass null to hide it. */
export const useBottomButton = (config: BottomButtonConfig | null) => {
    const [owner] = useState(bottomButtonRegistry.allocateOwner);
    const handler = useLatest(config?.onClick);

    useEffect(() => {
        return bottomButtonRegistry.register(owner, () => {
            handler.current?.();
        });
    }, []);

    useEffect(() => {
        bottomButtonRegistry.publish(owner, config);
    });
};

const getNativeHeaderButton = (
    kind: 'backButton' | 'settingsButton'
): WebAppHeaderButton | null => {
    const { webApp } = getLaunchContext();

    if (webApp === null || !supportsNative(kind)) {
        return null;
    }

    return kind === 'backButton'
        ? webApp.BackButton
        : (webApp.SettingsButton ?? null);
};

export const isNativeBackButton = () => {
    return getNativeHeaderButton('backButton') !== null;
};

const bindHeaderButton = (
    kind: 'backButton' | 'settingsButton',
    visible: boolean,
    onClick: () => void
) => {
    const button = getNativeHeaderButton(kind);

    if (button === null) {
        return () => undefined;
    }

    callSafely(() => {
        button.onClick(onClick);

        if (visible) {
            button.show();
        } else {
            button.hide();
        }
    });

    return () => {
        callSafely(() => {
            button.offClick(onClick);
        });
    };
};

/** Shows the native BackButton while `visible`; the in-page fallback is rendered by the router. */
export const useBackButton = (visible: boolean, onBack: () => void) => {
    const handler = useLatest(onBack);

    useEffect(() => {
        return bindHeaderButton('backButton', visible, () => {
            handler.current();
        });
    }, [visible]);
};

export const useSettingsButton = (onOpen: (() => void) | null) => {
    const handler = useLatest(onOpen);
    const visible = onOpen !== null;

    useEffect(() => {
        return bindHeaderButton('settingsButton', visible, () => {
            handler.current?.();
        });
    }, [visible]);
};
