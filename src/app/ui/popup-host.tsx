import { useEffect, useRef } from 'hono/jsx/dom';

import { useStore } from '../state/store';
import { popupStore, type PopupButtonKind } from '../telegram/popups';

const ACTION_CLASSES = {
    default: 'btn btn-primary',
    destructive: 'btn btn-error',
    cancel: 'btn'
} as const satisfies Record<PopupButtonKind, string>;

/** In-page stand-in for `WebApp.showPopup` outside the native Telegram shell. */
export const PopupHost = () => {
    const popup = useStore(popupStore);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (popup === null) {
            return;
        }

        const previous = document.activeElement;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                popup.resolve(null);
            }
        };

        dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
        document.addEventListener('keydown', handleKey);

        return () => {
            document.removeEventListener('keydown', handleKey);

            if (previous instanceof HTMLElement && previous.isConnected) {
                previous.focus({ preventScroll: true });
            }
        };
    }, [popup]);

    if (popup === null) {
        return null;
    }

    return (
        <div class='popup-backdrop'>
            <div
                ref={dialogRef}
                class='popup'
                role='alertdialog'
                aria-modal='true'
                aria-labelledby={
                    popup.title === undefined ? undefined : 'popup-title'
                }
                aria-describedby='popup-message'
            >
                {popup.title === undefined ? null : (
                    <h2 id='popup-title' class='popup-title'>
                        {popup.title}
                    </h2>
                )}
                <p id='popup-message' class='popup-message'>
                    {popup.message}
                </p>
                <div class='popup-actions'>
                    {popup.actions.map(action => {
                        return (
                            <button
                                key={action.id}
                                type='button'
                                class={ACTION_CLASSES[action.kind ?? 'default']}
                                onClick={() => {
                                    popup.resolve(action.id);
                                }}
                            >
                                {action.text}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
