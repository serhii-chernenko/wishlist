import { failureMessage } from '../i18n/messages';
import type { AppTranslator } from '../i18n/i18n';
import type { AppFailure } from '../logic/errors';
import type { Toaster, ToastTone } from '../state/context';
import { createStore, useStore, type Store } from '../state/store';
import { haptics } from '../telegram/haptics';

export interface ToastItem {
    id: number;
    message: string;
    tone: ToastTone;
}

export const TOAST_DURATION_MS = 4000;
const MAX_VISIBLE_TOASTS = 3;

export const toastStore: Store<ToastItem[]> = createStore<ToastItem[]>([]);

let nextToastId = 1;

const dismissToast = (id: number) => {
    toastStore.set(items => items.filter(item => item.id !== id));
};

export const createToaster = (getLL: () => AppTranslator): Toaster => {
    const show = (message: string, tone: ToastTone = 'info') => {
        const id = nextToastId;

        nextToastId += 1;
        toastStore.set(items => {
            return [...items, { id, message, tone }].slice(-MAX_VISIBLE_TOASTS);
        });
        setTimeout(() => {
            dismissToast(id);
        }, TOAST_DURATION_MS);
    };

    return {
        show,
        failure(failure: AppFailure) {
            haptics.error();
            show(failureMessage(getLL(), failure), 'error');
        }
    };
};

export const ToastHost = ({ closeLabel }: { closeLabel: string }) => {
    const items = useStore(toastStore);

    return (
        <div
            class='toast-host'
            role='status'
            aria-live='polite'
            aria-atomic='false'
        >
            {items.map(item => {
                return (
                    <div key={item.id} class={`toast-item toast-${item.tone}`}>
                        <p class='toast-text'>{item.message}</p>
                        <button
                            type='button'
                            class='toast-close'
                            aria-label={closeLabel}
                            onClick={() => {
                                dismissToast(item.id);
                            }}
                        >
                            <span aria-hidden='true'>×</span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
};
