import {
    isEnterToDismiss,
    shouldDismissKeyboard
} from '../logic/keyboard-dismiss';
import { callSafely, getLaunchContext, supportsNative } from './sdk';

const EDITABLE_SELECTOR =
    'input:not([type="radio"], [type="checkbox"], [type="button"], [type="submit"]), textarea, select, [contenteditable]:not([contenteditable="false"])';
const INTERACTIVE_SELECTOR =
    'button, a[href], label, summary, input, select, textarea, [role="button"], [role="switch"], [role="radio"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';

const isInside = (target: EventTarget | null, selector: string) => {
    return target instanceof Element && target.closest(selector) !== null;
};

export const dismissKeyboard = () => {
    const { webApp } = getLaunchContext();
    const active = document.activeElement;

    if (active instanceof HTMLElement && active.matches(EDITABLE_SELECTOR)) {
        active.blur();
    }

    if (supportsNative('hideKeyboard')) {
        callSafely(() => {
            webApp?.hideKeyboard?.();
        });
    }
};

export const dismissKeyboardOnEnter = (event: KeyboardEvent) => {
    if (
        isEnterToDismiss({
            key: event.key,
            isComposing: event.isComposing
        })
    ) {
        setTimeout(dismissKeyboard, 0);
    }
};

/** Dismisses the on-screen keyboard when a tap lands outside any field or control; `pointerup` is used because a scroll gesture ends in `pointercancel` and must keep the keyboard. */
export const watchKeyboardDismissal = () => {
    const handleTap = (event: PointerEvent) => {
        const active = document.activeElement;
        const shouldDismiss = shouldDismissKeyboard({
            activeFieldIsEditable:
                active instanceof HTMLElement &&
                active.matches(EDITABLE_SELECTOR),
            targetIsInsideEditable: isInside(event.target, EDITABLE_SELECTOR),
            targetIsInsideInteractive: isInside(
                event.target,
                INTERACTIVE_SELECTOR
            )
        });

        if (shouldDismiss) {
            dismissKeyboard();
        }
    };

    document.addEventListener('pointerup', handleTap, { passive: true });

    return () => {
        document.removeEventListener('pointerup', handleTap);
    };
};
