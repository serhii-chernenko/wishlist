import { useEffect, useState } from 'hono/jsx/dom';

import { createStore, useLatest, type Store } from '../state/store';
import { callSafely, getLaunchContext, supportsNative } from './sdk';
import { BOTTOM_BUTTON_COLORS } from './theme';
import type { WebAppBottomButton, WebAppHeaderButton } from './types';

export interface BottomButtonConfig {
    text: string;
    onClick: () => void;
    disabled?: boolean;
    progress?: boolean;
}

export type BottomButtonState = Omit<BottomButtonConfig, 'onClick'> & {
    owner: number;
};

export const bottomButtonStore: Store<BottomButtonState | null> =
    createStore<BottomButtonState | null>(null);

const bottomButtonHandlers = new Map<number, () => void>();

let nextOwner = 1;

const allocateOwner = () => {
    const owner = nextOwner;

    nextOwner += 1;

    return owner;
};

export const triggerBottomButton = () => {
    const state = bottomButtonStore.get();

    if (state !== null && !state.disabled && !state.progress) {
        bottomButtonHandlers.get(state.owner)?.();
    }
};

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

const sameState = (
    left: BottomButtonState | null,
    right: BottomButtonState | null
) => {
    return (
        left === right ||
        (left !== null &&
            right !== null &&
            left.owner === right.owner &&
            left.text === right.text &&
            Boolean(left.disabled) === Boolean(right.disabled) &&
            Boolean(left.progress) === Boolean(right.progress))
    );
};

/** Owns the Telegram BottomButton (or its in-page fallback) while the calling screen is mounted; pass null to hide it. */
export const useBottomButton = (config: BottomButtonConfig | null) => {
    const [owner] = useState(allocateOwner);
    const handler = useLatest(config?.onClick);

    useEffect(() => {
        bottomButtonHandlers.set(owner, () => {
            handler.current?.();
        });

        return () => {
            bottomButtonHandlers.delete(owner);
            bottomButtonStore.set(current => {
                return current?.owner === owner ? null : current;
            });
        };
    }, []);

    useEffect(() => {
        const next: BottomButtonState | null =
            config === null
                ? null
                : {
                      owner,
                      text: config.text,
                      ...(config.disabled !== undefined && {
                          disabled: config.disabled
                      }),
                      ...(config.progress !== undefined && {
                          progress: config.progress
                      })
                  };

        bottomButtonStore.set(current => {
            if (next === null) {
                return current?.owner === owner ? null : current;
            }

            return sameState(current, next) ? current : next;
        });
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
