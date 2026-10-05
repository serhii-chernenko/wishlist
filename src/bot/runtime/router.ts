import type { Message } from 'telegraf/types';

import type {
    BotRequest,
    CallbackAction,
    CallbackActionType,
    CallbackHandler,
    CallbackTable,
    PendingInput,
    PendingInputKind,
    ScreenExports,
    ScreenId,
    ScreenModule
} from './types';
import { resolveLateAlbumInput } from './album';
import { clearPendingInput } from './context';
import {
    getBareLink,
    getMessageText,
    isLinkImportAvailable,
    offerLinkImport
} from './link-offer';
import { getMessageContact } from '../utils/telegram';

export const PENDING_INPUT_SCREENS = {
    wishTitleNew: 'wishAdd',
    wishField: 'wishEdit',
    findQuery: 'findList',
    feedback: 'feedback',
    payments: 'payments',
    deliveryAddress: 'delivery',
    contact: 'auth',
    listImportUrl: 'listImport'
} as const satisfies Record<PendingInputKind, ScreenId>;

export const APP_CONTACT_PENDING_TTL_MS = 10 * 60 * 1000;

export const REGISTERED_ONLY_SCREENS: ReadonlySet<ScreenId> = new Set([
    'wishlist',
    'wishAdd',
    'wishEdit',
    'wishRemove',
    'findList',
    'thirdWishlist',
    'giveList',
    'payments',
    'settings',
    'currency',
    'delivery',
    'disclosure',
    'wishPriority',
    'wishImages',
    'listImport'
]);

const GUEST_CALLBACK_TYPES: ReadonlySet<CallbackActionType> = new Set([
    'navigate',
    'authType',
    'language',
    'releasesPage',
    'noop',
    'outdated'
]);

const ROUTER_OWNED_CALLBACK_TYPES: ReadonlySet<CallbackActionType> = new Set([
    'navigate',
    'noop',
    'outdated'
]);

export const KEYBOARD_PRESERVING_CALLBACK_TYPES: ReadonlySet<CallbackActionType> =
    new Set([
        'thirdGive',
        'thirdTake',
        'giveOwnerList',
        'giveRemove',
        'giveRemoveConfirm',
        'giveRemoveKeep',
        'listImportVisibility',
        'noop'
    ]);

export const TOAST_CALLBACK_TYPES: ReadonlySet<CallbackActionType> = new Set([
    'thirdGive',
    'thirdTake',
    'giveOwnerList',
    'giveRemove',
    'giveRemoveConfirm',
    'outdated'
]);

export const mergeCallbackTables = (
    modules: readonly Pick<ScreenExports, 'callbacks'>[]
): CallbackTable => {
    const merged: Partial<Record<CallbackActionType, unknown>> = {};

    for (const { callbacks } of modules) {
        for (const [type, handler] of Object.entries(callbacks)) {
            const actionType = type as CallbackActionType;

            if (ROUTER_OWNED_CALLBACK_TYPES.has(actionType)) {
                throw new Error(
                    `Callback type "${actionType}" is handled by the router`
                );
            }

            if (merged[actionType] !== undefined) {
                throw new Error(
                    `Duplicate callback handler for "${actionType}"`
                );
            }

            if (handler !== undefined) {
                merged[actionType] = handler;
            }
        }
    }

    return merged as CallbackTable;
};

const indexScreens = (modules: readonly ScreenExports[]) => {
    const screens = new Map<ScreenId, ScreenModule<never>>();

    for (const { screen } of modules) {
        if (screens.has(screen.id)) {
            throw new Error(`Duplicate screen module "${screen.id}"`);
        }

        screens.set(screen.id, screen);
    }

    return screens;
};

const isStaleAppContact = (pending: PendingInput | null, message: Message) => {
    if (pending?.kind !== 'contact' || pending.via !== 'app') {
        return false;
    }

    const expired =
        pending.createdAt === undefined ||
        Date.now() - pending.createdAt > APP_CONTACT_PENDING_TTL_MS;

    return expired || getMessageContact(message) === null;
};

export interface Router {
    renderScreen(req: BotRequest, id: ScreenId): Promise<void>;
    dispatchCallback(req: BotRequest, action: CallbackAction): Promise<void>;
    dispatchInput(req: BotRequest, message: Message): Promise<void>;
    hasScreen(id: ScreenId): boolean;
}

export const createRouter = (modules: readonly ScreenExports[]): Router => {
    const screens = indexScreens(modules);
    const callbacks = mergeCallbackTables(modules);

    const getScreen = (id: ScreenId) => {
        const screen = screens.get(id);

        if (!screen) {
            throw new Error(`Screen "${id}" is not registered`);
        }

        return screen as ScreenModule<undefined>;
    };

    const renderScreen = async (req: BotRequest, id: ScreenId) => {
        const target =
            REGISTERED_ONLY_SCREENS.has(id) && req.user === null ? 'home' : id;

        await getScreen(target).render(req, undefined);
    };

    const renderOutdated = async (req: BotRequest) => {
        await req.send.toast(req.LL.errors.outdatedButton());
        await renderScreen(req, 'home');
    };

    const dispatchCallback = async (
        req: BotRequest,
        action: CallbackAction
    ) => {
        if (action.type === 'noop') {
            return;
        }

        clearPendingInput(req);

        if (action.type === 'outdated') {
            await renderOutdated(req);
            return;
        }

        if (req.user === null && !GUEST_CALLBACK_TYPES.has(action.type)) {
            await renderOutdated(req);
            return;
        }

        if (action.type === 'navigate') {
            await renderScreen(req, action.screen);
            return;
        }

        const handler = callbacks[action.type] as
            | CallbackHandler<typeof action>
            | undefined;

        if (!handler) {
            await renderOutdated(req);
            return;
        }

        await handler(req, action);
    };

    const dispatchInput = async (req: BotRequest, message: Message) => {
        if (isStaleAppContact(req.session.pendingInput, message)) {
            clearPendingInput(req);
        }

        const pending =
            req.session.pendingInput ??
            resolveLateAlbumInput(req.session, message);

        if (pending === null) {
            const link = getBareLink(getMessageText(message));

            if (
                link !== null &&
                req.user !== null &&
                isLinkImportAvailable(req)
            ) {
                await offerLinkImport(req, link);
                return;
            }

            await renderScreen(req, 'home');
            return;
        }

        const screenId = PENDING_INPUT_SCREENS[pending.kind];
        const screen = screens.get(screenId);
        const needsUser = REGISTERED_ONLY_SCREENS.has(screenId);

        if (!screen?.onInput || (needsUser && req.user === null)) {
            clearPendingInput(req);
            await renderScreen(req, 'home');
            return;
        }

        await screen.onInput(req, pending, message);
    };

    return {
        renderScreen,
        dispatchCallback,
        dispatchInput,
        hasScreen(id) {
            return screens.has(id);
        }
    };
};
