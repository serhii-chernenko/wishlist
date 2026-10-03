import { createStore, type Store } from '../state/store';
import { callSafely, getLaunchContext, supportsNative } from './sdk';

export type PopupButtonKind = 'default' | 'destructive' | 'cancel';

export interface PopupAction {
    id: string;
    text: string;
    kind?: PopupButtonKind;
}

export interface PopupRequest {
    title?: string;
    message: string;
    actions: PopupAction[];
}

export interface PendingPopup extends PopupRequest {
    resolve: (actionId: string | null) => void;
}

export const POPUP_TITLE_MAX_LENGTH = 64;
export const POPUP_MESSAGE_MAX_LENGTH = 256;
export const POPUP_MAX_ACTIONS = 3;

export const popupStore: Store<PendingPopup | null> =
    createStore<PendingPopup | null>(null);

const truncate = (value: string, max: number) => {
    const characters = Array.from(value);

    return characters.length <= max
        ? value
        : `${characters.slice(0, max - 1).join('')}…`;
};

const showNativePopup = (request: PopupRequest) => {
    const { webApp } = getLaunchContext();

    return new Promise<string | null>(resolve => {
        callSafely(() => {
            webApp?.showPopup(
                {
                    ...(request.title !== undefined && {
                        title: truncate(request.title, POPUP_TITLE_MAX_LENGTH)
                    }),
                    message: truncate(
                        request.message,
                        POPUP_MESSAGE_MAX_LENGTH
                    ),
                    buttons: request.actions
                        .slice(0, POPUP_MAX_ACTIONS)
                        .map(action => {
                            return {
                                id: action.id,
                                type: action.kind ?? 'default',
                                text: action.text
                            };
                        })
                },
                buttonId => {
                    resolve(buttonId === '' ? null : buttonId);
                }
            );
        });
    });
};

const showInPagePopup = (request: PopupRequest) => {
    return new Promise<string | null>(resolve => {
        popupStore.get()?.resolve(null);
        popupStore.set({
            ...request,
            resolve: actionId => {
                popupStore.set(null);
                resolve(actionId);
            }
        });
    });
};

/** Resolves with the chosen action id, or null when the popup is dismissed or a cancel action is chosen. */
export const showPopup = async (request: PopupRequest) => {
    const actionId = supportsNative('popup')
        ? await showNativePopup(request)
        : await showInPagePopup(request);
    const action = request.actions.find(candidate => {
        return candidate.id === actionId;
    });

    return action === undefined || action.kind === 'cancel' ? null : action.id;
};

export interface ConfirmRequest {
    title?: string;
    message: string;
    confirmText: string;
    cancelText: string;
    destructive?: boolean;
}

const CONFIRM_ACTION_ID = 'confirm';
const CANCEL_ACTION_ID = 'cancel';

export const confirmAction = async (request: ConfirmRequest) => {
    const result = await showPopup({
        ...(request.title !== undefined && { title: request.title }),
        message: request.message,
        actions: [
            {
                id: CONFIRM_ACTION_ID,
                text: request.confirmText,
                kind: request.destructive ? 'destructive' : 'default'
            },
            { id: CANCEL_ACTION_ID, text: request.cancelText, kind: 'cancel' }
        ]
    });

    return result === CONFIRM_ACTION_ID;
};
