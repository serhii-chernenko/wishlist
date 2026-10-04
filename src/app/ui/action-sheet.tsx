import type { Child } from 'hono/jsx';
import { useEffect, useRef } from 'hono/jsx/dom';

import { pushDismissibleLayer } from '../state/layers';
import { useLatest } from '../state/store';

const SWIPE_DISMISS_DISTANCE_PX = 64;
const SHEET_TITLE_ID = 'action-sheet-title';

export interface ActionSheetProps {
    title: string;
    subtitle?: string;
    closeLabel: string;
    onClose: () => void;
    children?: Child;
}

/** A modal bottom sheet that closes on a backdrop tap, Escape, a downward swipe and the Telegram back button. */
export const ActionSheet = ({
    title,
    subtitle,
    closeLabel,
    onClose,
    children
}: ActionSheetProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const swipeStartY = useRef<number | null>(null);
    const close = useLatest(onClose);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previous = document.activeElement;
        const removeLayer = pushDismissibleLayer(() => {
            close.current();
        });

        if (dialog !== null && !dialog.open) {
            dialog.showModal();
        }

        return () => {
            removeLayer();
            dialog?.close();

            if (previous instanceof HTMLElement && previous.isConnected) {
                previous.focus({ preventScroll: true });
            }
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            class='action-sheet'
            aria-labelledby={SHEET_TITLE_ID}
            onCancel={(event: Event) => {
                event.preventDefault();
                close.current();
            }}
            onClick={(event: MouseEvent) => {
                if (event.target === dialogRef.current) {
                    close.current();
                }
            }}
        >
            <div
                class='action-sheet-panel'
                onPointerDown={(event: PointerEvent) => {
                    swipeStartY.current = event.clientY;
                }}
                onPointerCancel={() => {
                    swipeStartY.current = null;
                }}
                onPointerUp={(event: PointerEvent) => {
                    const startY = swipeStartY.current;

                    swipeStartY.current = null;

                    if (
                        startY !== null &&
                        event.clientY - startY >= SWIPE_DISMISS_DISTANCE_PX
                    ) {
                        close.current();
                    }
                }}
            >
                <span class='action-sheet-handle' aria-hidden='true' />
                <header class='action-sheet-header'>
                    <div class='action-sheet-heading'>
                        <h2 id={SHEET_TITLE_ID} class='action-sheet-title'>
                            {title}
                        </h2>
                        {subtitle === undefined ? null : (
                            <p class='action-sheet-subtitle'>{subtitle}</p>
                        )}
                    </div>
                    <button
                        type='button'
                        class='action-sheet-close'
                        aria-label={closeLabel}
                        onClick={() => {
                            close.current();
                        }}
                    >
                        <span aria-hidden='true'>×</span>
                    </button>
                </header>
                {children}
            </div>
        </dialog>
    );
};
