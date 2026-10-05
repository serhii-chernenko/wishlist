import { failureMessage } from '../i18n/messages';
import type { AppTranslator } from '../i18n/i18n';
import {
    DESTRUCTIVE_COUNTDOWN_SECONDS,
    runUndoable,
    type UndoHandle
} from '../logic/countdown';
import type { AppFailure } from '../logic/errors';
import type {
    ToastAction,
    Toaster,
    ToastTone,
    UndoToastRequest
} from '../state/context';
import { createStore, toFailure, useStore, type Store } from '../state/store';
import { haptics } from '../telegram/haptics';

interface ToastUndo {
    handle: UndoHandle;
    seconds: number;
}

export interface ToastItem {
    id: number;
    message: string;
    tone: ToastTone;
    action?: ToastAction;
    undo?: ToastUndo;
}

export const TOAST_DURATION_MS = 4000;
const MAX_VISIBLE_TOASTS = 3;

export const toastStore: Store<ToastItem[]> = createStore<ToastItem[]>([]);

interface Announcement {
    id: number;
    text: string;
}

const announcementStore: Store<Announcement | null> =
    createStore<Announcement | null>(null);

let nextToastId = 1;

const takeToastId = () => {
    const id = nextToastId;

    nextToastId += 1;

    return id;
};

const pushToast = (item: ToastItem) => {
    toastStore.set(items => {
        const next = [...items, item];
        const firstVisible = next.length - MAX_VISIBLE_TOASTS;

        return next.filter((candidate, index) => {
            return candidate.undo !== undefined || index >= firstVisible;
        });
    });
};

/** Reads a message out through the toast live region without showing a toast. */
export const announce = (text: string) => {
    announcementStore.set({ id: takeToastId(), text });
};

const dismissToast = (id: number) => {
    toastStore.set(items => items.filter(item => item.id !== id));
};

const setUndoSeconds = (id: number, seconds: number) => {
    toastStore.set(items => {
        return items.map(item => {
            return item.id === id && item.undo !== undefined
                ? { ...item, undo: { ...item.undo, seconds } }
                : item;
        });
    });
};

export const createToaster = (getLL: () => AppTranslator): Toaster => {
    const show = (
        message: string,
        tone: ToastTone = 'info',
        action?: ToastAction
    ) => {
        const id = takeToastId();

        pushToast({
            id,
            message,
            tone,
            ...(action !== undefined && { action })
        });
        setTimeout(() => {
            dismissToast(id);
        }, TOAST_DURATION_MS);
    };

    const failure = (reason: AppFailure) => {
        haptics.error();
        show(failureMessage(getLL(), reason), 'error');
    };

    const undoable = (request: UndoToastRequest) => {
        const id = takeToastId();
        const handle = runUndoable(
            {
                apply: request.apply,
                restore: request.restore,
                commit: request.commit,
                committed() {
                    dismissToast(id);
                    haptics.success();
                    request.committed?.();
                },
                failed(error) {
                    dismissToast(id);

                    if (request.failed === undefined) {
                        failure(toFailure(error));
                    } else {
                        request.failed(error);
                    }
                }
            },
            {
                onTick: seconds => {
                    setUndoSeconds(id, seconds);
                }
            }
        );

        haptics.warning();
        pushToast({
            id,
            message: request.message,
            tone: 'success',
            action: {
                label: getLL().common.undo(),
                onSelect: () => {
                    if (handle.undo()) {
                        haptics.selection();
                    }
                }
            },
            undo: { handle, seconds: DESTRUCTIVE_COUNTDOWN_SECONDS }
        });
    };

    return { show, failure, undoable };
};

const ToastActionButton = ({
    action,
    seconds,
    onSelect
}: {
    action: ToastAction;
    seconds: number | null;
    onSelect: () => void;
}) => {
    return (
        <button type='button' class='toast-action' onClick={onSelect}>
            {action.label}
            {seconds === null ? null : (
                <span class='countdown-count' aria-hidden='true'>
                    {seconds}
                </span>
            )}
        </button>
    );
};

export const ToastHost = ({ closeLabel }: { closeLabel: string }) => {
    const items = useStore(toastStore);
    const announcement = useStore(announcementStore);

    return (
        <div
            class='toast-host'
            role='status'
            aria-live='polite'
            aria-atomic='false'
        >
            {announcement === null ? null : (
                <p key={announcement.id} class='sr-only'>
                    {announcement.text}
                </p>
            )}
            {items.map(item => {
                const { undo } = item;

                return (
                    <div
                        key={item.id}
                        class={
                            undo === undefined
                                ? `toast-item toast-${item.tone}`
                                : `toast-item toast-${item.tone} toast-countdown`
                        }
                    >
                        <p class='toast-text'>{item.message}</p>
                        {item.action === undefined ? null : (
                            <ToastActionButton
                                action={item.action}
                                seconds={undo?.seconds ?? null}
                                onSelect={() => {
                                    dismissToast(item.id);
                                    item.action?.onSelect();
                                }}
                            />
                        )}
                        <button
                            type='button'
                            class='toast-close'
                            aria-label={closeLabel}
                            onClick={() => {
                                dismissToast(item.id);
                                undo?.handle.flush();
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
