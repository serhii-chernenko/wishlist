import type { Context } from 'telegraf';
import type {
    ForceReply,
    InlineKeyboardMarkup,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    User
} from 'telegraf/types';

import type {
    Repositories as DbRepositories,
    UserRecord as DbUserRecord
} from '../../db/repositories';
import type { TranslationFunctions } from '../../i18n/i18n-types';
import type { WorkerBindings } from '../../worker/env';
import type { AppLocale, LanguageChoice as I18nLanguageChoice } from '../i18n';
import type { StatsService } from '../services/stats-service';
import type { UserService } from '../services/user-service';

export type UserRecord = DbUserRecord;

export type Repositories = DbRepositories;

export type ScreenId =
    | 'home'
    | 'privacy'
    | 'auth'
    | 'wishlist'
    | 'wishAdd'
    | 'wishEdit'
    | 'wishRemove'
    | 'findList'
    | 'thirdWishlist'
    | 'giveList'
    | 'feedback'
    | 'stats'
    | 'donate'
    | 'payments'
    | 'language'
    | 'releases';

export type NavigationScreenId = Extract<
    ScreenId,
    | 'home'
    | 'privacy'
    | 'auth'
    | 'wishlist'
    | 'wishAdd'
    | 'giveList'
    | 'findList'
    | 'feedback'
    | 'stats'
    | 'donate'
    | 'payments'
    | 'language'
    | 'releases'
>;

export type WishField = 'title' | 'description' | 'images' | 'link' | 'price';

export type WishFilter = 0 | 1 | 2 | 3 | 4;

export type AuthType = 'username' | 'phone' | 'both';

export type LanguageChoice = I18nLanguageChoice;

export type PendingInput =
    | { kind: 'wishTitleNew' }
    | { kind: 'wishField'; wishId: number; field: WishField }
    | { kind: 'findQuery' }
    | { kind: 'feedback' }
    | { kind: 'payments' }
    | { kind: 'contact'; authType: 'phone' | 'both'; via?: 'app' };

export type PendingInputKind = PendingInput['kind'];

export interface FindState {
    targetUserId: number;
    query: string;
    filter: WishFilter | null;
}

export interface AlbumState {
    mediaGroupId: string;
    wishId: number;
}

export interface SessionState {
    v: 1;
    pendingInput: PendingInput | null;
    find: FindState | null;
    album?: AlbumState;
}

export type CallbackAction =
    | { type: 'navigate'; screen: NavigationScreenId }
    | { type: 'wishlistPage'; offset: number }
    | { type: 'wishlistClean' }
    | { type: 'wishlistCleanConfirm' }
    | { type: 'wishlistShare' }
    | { type: 'wishlistSharePublish' }
    | { type: 'wishlistShareStop' }
    | { type: 'wishlistShareStopConfirm' }
    | { type: 'wishlistShareRotate' }
    | { type: 'wishlistShareRotateConfirm' }
    | { type: 'wishlistShareUsername' }
    | { type: 'wishlistFilterMenu' }
    | { type: 'wishlistFilter'; filter: WishFilter | null }
    | { type: 'wishEdit'; wishId: number }
    | { type: 'wishRemove'; wishId: number }
    | { type: 'wishRemoveConfirm'; wishId: number; done: boolean }
    | { type: 'wishTogglePriority'; wishId: number }
    | { type: 'wishToggleVisibility'; wishId: number }
    | { type: 'wishFieldPrompt'; wishId: number; field: WishField }
    | { type: 'wishBack'; wishId: number }
    | { type: 'wishAdd' }
    | { type: 'thirdPage'; ownerId: number; offset: number }
    | { type: 'thirdGive'; wishId: number }
    | { type: 'thirdTake'; wishId: number }
    | { type: 'thirdFilterMenu'; ownerId: number }
    | { type: 'thirdFilter'; ownerId: number; filter: WishFilter | null }
    | { type: 'giveListPage'; offset: number }
    | { type: 'giveRemove'; wishId: number }
    | { type: 'giveListClean' }
    | { type: 'giveListCleanConfirm' }
    | { type: 'authType'; authType: AuthType }
    | { type: 'paymentsRemove' }
    | { type: 'language'; choice: LanguageChoice }
    | { type: 'noop' }
    | { type: 'outdated' };

export type CallbackActionType = CallbackAction['type'];

export type CallbackActionOf<T extends CallbackActionType> = Extract<
    CallbackAction,
    { type: T }
>;

export type ReplyMarkup =
    | InlineKeyboardMarkup
    | ReplyKeyboardMarkup
    | ReplyKeyboardRemove
    | ForceReply;

export interface WishMessage {
    html: string;
    images: readonly string[];
}

export interface Sender {
    text(html: string, keyboard?: ReplyMarkup): Promise<void>;
    wish(item: WishMessage, keyboard?: InlineKeyboardMarkup): Promise<void>;
    toast(text: string): Promise<void>;
    removeKeyboard(): Promise<void>;
    replaceKeyboard(keyboard: InlineKeyboardMarkup): Promise<void>;
    deleteIncoming(): Promise<void>;
}

export type BotActionName =
    | 'user_registered'
    | 'visibility_changed'
    | 'wish_created'
    | 'wish_updated'
    | 'wish_removed'
    | 'wishlist_cleaned'
    | 'wishlist_shared'
    | 'wishlist_share_stopped'
    | 'wishlist_share_rotated'
    | 'wishlist_share_username_toggled'
    | 'wishlist_filtered'
    | 'wishlist_searched'
    | 'give_added'
    | 'give_removed'
    | 'give_list_cleaned'
    | 'payments_updated'
    | 'payments_removed'
    | 'feedback_sent'
    | 'language_changed';

export type InternalFailureEvent =
    | 'generic_error_reply_failed'
    | 'telegraf_middleware_failed'
    | 'wish_media_failed'
    | 'deferred_render_failed'
    | 'share_failed'
    | 'feedback_delivery_failed';

export type WishlistSharedResult =
    | 'published'
    | 'existing'
    | 'empty'
    | 'failed';

export type WishlistShareChangeResult = 'success' | 'failed';

export type WishlistShareUsernameResult = 'on' | 'off' | 'failed';

export interface WishlistBotTelemetry {
    botActionCompleted(input: {
        action: BotActionName;
        result?: string;
        field?: string;
    }): void;
    internalFailure(input: {
        event: InternalFailureEvent;
        errorType: string;
    }): void;
}

export interface BotServices {
    users: UserService;
    stats: StatsService;
}

export interface BotRequest {
    ctx: Context;
    env: WorkerBindings;
    locale: AppLocale;
    LL: TranslationFunctions;
    actor: User;
    user: UserRecord | null;
    sessionLanguage: AppLocale | null;
    publicOrigin?: string;
    session: SessionState;
    isAdmin: boolean;
    repos: Repositories;
    services: BotServices;
    telemetry: WishlistBotTelemetry;
    send: Sender;
    defer(task: () => Promise<void>, delayMs: number): void;
    setSession(next: SessionState): void;
}

export interface ScreenModule<P = undefined> {
    id: ScreenId;
    render(req: BotRequest, params: P): Promise<void>;
    onInput?(
        req: BotRequest,
        input: PendingInput,
        message: Message
    ): Promise<void>;
}

export type CallbackHandler<A extends CallbackAction = CallbackAction> = (
    req: BotRequest,
    action: A
) => Promise<void>;

export type CallbackTable = {
    [T in CallbackActionType]?: CallbackHandler<CallbackActionOf<T>>;
};

export interface ScreenExports {
    screen: ScreenModule<never>;
    callbacks: CallbackTable;
}
