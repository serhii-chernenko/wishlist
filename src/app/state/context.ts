import { createContext, useContext } from 'hono/jsx/dom';

import type {
    AppLocale,
    BootstrapDto,
    ClientEventInput,
    ClientEventKind,
    ClientScreen,
    LanguageResultDto,
    MeDto
} from '../../shared/app-api';
import type { ApiClient } from '../api/client';
import type { AppTranslator } from '../i18n/i18n';
import type { AppFailure } from '../logic/errors';
import type { Route, ScreenId } from '../logic/nav';
import type { LaunchContext } from '../telegram/sdk';
import {
    useResource,
    useStore,
    type ResourceCache,
    type ResourceHandle,
    type ResourceLoader,
    type Store
} from './store';

export interface Session {
    me: MeDto;
    counts: BootstrapDto['counts'];
    config: BootstrapDto['config'];
    locale: AppLocale;
    LL: AppTranslator;
}

export type ClientEventDetails = Pick<ClientEventInput, 'field' | 'code'>;

export interface Navigator {
    push(route: Route): void;
    replace(route: Route): void;
    reset(routes: readonly Route[]): void;
    popTo(screen: ScreenId): void;
    back(): Promise<boolean>;
    canGoBack(): boolean;
    setDirty(entryKey: number, dirty: boolean): void;
}

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastAction {
    label: string;
    onSelect: () => void;
}

export interface Toaster {
    show(message: string, tone?: ToastTone, action?: ToastAction): void;
    failure(failure: AppFailure): void;
}

export interface AppServices {
    launch: LaunchContext;
    api: ApiClient;
    session: Store<Session>;
    cache: ResourceCache;
    revalidation: Store<number>;
    online: Store<boolean>;
    nav: Navigator;
    toast: Toaster;
    revalidate(): void;
    applyLanguage(result: LanguageResultDto): void;
    updateMe(me: MeDto): void;
    reloadSession(): Promise<void>;
    reportEvent(
        kind: ClientEventKind,
        screen: ClientScreen,
        details?: ClientEventDetails
    ): void;
}

export const AppContext = createContext<AppServices | null>(null);

export const EntryContext = createContext<number>(0);

export const useApp = (): AppServices => {
    const services = useContext(AppContext);

    if (services === null) {
        throw new Error('useApp must be used inside the app root');
    }

    return services;
};

export const useSession = (): Session => {
    return useStore(useApp().session);
};

export const useLL = (): AppTranslator => {
    return useSession().LL;
};

export const useNav = (): Navigator => {
    return useApp().nav;
};

export const useToast = (): Toaster => {
    return useApp().toast;
};

export const useEntryKey = (): number => {
    return useContext(EntryContext);
};

/** Cached, revalidating data for a screen; `key` should start with the screen id so invalidation by prefix works. */
export const useAppResource = <Value>(
    key: string | null,
    loader: ResourceLoader<Value>,
    staleMs?: number
): ResourceHandle<Value> => {
    const { cache, revalidation } = useApp();

    return useResource(key, loader, {
        cache,
        revalidation,
        ...(staleMs !== undefined && { staleMs })
    });
};
