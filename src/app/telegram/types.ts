export type ColorScheme = 'light' | 'dark';

export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

export type HapticNotificationType = 'error' | 'success' | 'warning';

export interface SafeAreaInset {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface WebAppUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
}

export interface WebAppInitDataUnsafe {
    user?: WebAppUser;
    start_param?: string;
    auth_date?: number;
}

export interface PopupButton {
    id?: string;
    type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
    text?: string;
}

export interface PopupParams {
    title?: string;
    message: string;
    buttons?: PopupButton[];
}

export interface BottomButtonParams {
    text?: string;
    color?: string;
    text_color?: string;
    is_active?: boolean;
    is_visible?: boolean;
    has_shine_effect?: boolean;
}

export interface WebAppBottomButton {
    text: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setParams(params: BottomButtonParams): WebAppBottomButton;
    onClick(callback: () => void): WebAppBottomButton;
    offClick(callback: () => void): WebAppBottomButton;
    show(): WebAppBottomButton;
    hide(): WebAppBottomButton;
    enable(): WebAppBottomButton;
    disable(): WebAppBottomButton;
    showProgress(leaveActive?: boolean): WebAppBottomButton;
    hideProgress(): WebAppBottomButton;
}

export interface WebAppHeaderButton {
    isVisible: boolean;
    onClick(callback: () => void): WebAppHeaderButton;
    offClick(callback: () => void): WebAppHeaderButton;
    show(): WebAppHeaderButton;
    hide(): WebAppHeaderButton;
}

export interface WebAppHapticFeedback {
    impactOccurred(style: HapticImpactStyle): WebAppHapticFeedback;
    notificationOccurred(type: HapticNotificationType): WebAppHapticFeedback;
    selectionChanged(): WebAppHapticFeedback;
}

export interface WebAppEventMap {
    themeChanged: () => void;
    viewportChanged: (event: { isStateStable: boolean }) => void;
    safeAreaChanged: () => void;
    contentSafeAreaChanged: () => void;
    activated: () => void;
    deactivated: () => void;
}

export type WebAppEventType = keyof WebAppEventMap;

export interface RequestContactResult {
    status: 'sent' | 'cancelled';
}

export interface WebApp {
    initData: string;
    initDataUnsafe: WebAppInitDataUnsafe;
    version: string;
    platform: string;
    colorScheme: ColorScheme;
    isActive?: boolean;
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    safeAreaInset?: SafeAreaInset;
    contentSafeAreaInset?: SafeAreaInset;
    BackButton: WebAppHeaderButton;
    MainButton: WebAppBottomButton;
    BottomButton?: WebAppBottomButton;
    SettingsButton?: WebAppHeaderButton;
    HapticFeedback: WebAppHapticFeedback;
    isVersionAtLeast(version: string): boolean;
    setHeaderColor(color: string): void;
    setBackgroundColor(color: string): void;
    setBottomBarColor?(color: string): void;
    enableClosingConfirmation(): void;
    disableClosingConfirmation(): void;
    enableVerticalSwipes?(): void;
    disableVerticalSwipes?(): void;
    onEvent<Type extends WebAppEventType>(
        type: Type,
        handler: WebAppEventMap[Type]
    ): void;
    offEvent<Type extends WebAppEventType>(
        type: Type,
        handler: WebAppEventMap[Type]
    ): void;
    ready(): void;
    expand(): void;
    close(): void;
    openLink(url: string, options?: { try_instant_view?: boolean }): void;
    openTelegramLink(url: string): void;
    showPopup(params: PopupParams, callback?: (buttonId: string) => void): void;
    showAlert(message: string, callback?: () => void): void;
    showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
    requestWriteAccess?(callback?: (allowed: boolean) => void): void;
    requestContact?(
        callback?: (sent: boolean, result?: RequestContactResult) => void
    ): void;
}

declare global {
    interface Window {
        Telegram?: { WebApp?: WebApp };
    }
}
