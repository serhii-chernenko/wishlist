import type { AppLocale, BootstrapDto } from '../shared/app-api';
import type { ApiClient } from './api/client';
import { createTranslator } from './i18n/i18n';
import type { SystemScreenId } from './logic/errors';
import { resolveInitialRoutes } from './logic/nav-persistence';
import { createTelemetryGate } from './logic/telemetry';
import { persistNavigation, readStoredNav } from './nav/persistence';
import { createNavigator, Router, type NavigatorHandle } from './nav/router';
import { BootErrorScreen } from './screens/boot-error';
import { OutsideTelegramScreen } from './screens/outside-telegram';
import { SessionExpiredScreen } from './screens/session-expired';
import { UnavailableScreen } from './screens/unavailable';
import {
    AppContext,
    useLL,
    type AppServices,
    type Session
} from './state/context';
import {
    createResourceCache,
    createStore,
    useStore,
    type Store
} from './state/store';
import type { LaunchContext } from './telegram/sdk';
import { BottomBarFallback } from './ui/bottom-bar';
import { OfflineBanner } from './ui/offline-banner';
import { PopupHost } from './ui/popup-host';
import { createToaster, ToastHost } from './ui/toast';

export type RootPhase =
    | { kind: 'loading' }
    | { kind: 'ready'; services: AppServices; navigation: NavigatorHandle }
    | { kind: 'system'; screen: SystemScreenId | 'unsupported' }
    | { kind: 'bootError' };

export const toSession = (bootstrap: BootstrapDto): Session => {
    return {
        me: bootstrap.me,
        counts: bootstrap.counts,
        config: bootstrap.config,
        locale: bootstrap.me.locale,
        LL: createTranslator(bootstrap.me.locale, bootstrap.messages)
    };
};

export const setDocumentLanguage = (locale: AppLocale) => {
    document.documentElement.lang = locale;
};

export interface AppServicesInput {
    launch: LaunchContext;
    api: ApiClient;
    bootstrap: BootstrapDto;
    online: Store<boolean>;
    loadBootstrap: () => Promise<BootstrapDto>;
}

export const createAppServices = ({
    launch,
    api,
    bootstrap,
    online,
    loadBootstrap
}: AppServicesInput) => {
    const session = createStore(toSession(bootstrap));
    const revalidation = createStore(0);
    const telemetryGate = createTelemetryGate();
    const navigation = createNavigator(
        resolveInitialRoutes({
            stored: readStoredNav(),
            initData: launch.initData,
            startParam: launch.startParam,
            registered: bootstrap.me.registered
        }),
        session
    );
    const updateSession = (next: (current: Session) => Session) => {
        session.set(next);
        setDocumentLanguage(session.get().locale);
    };

    const services: AppServices = {
        launch,
        api,
        session,
        cache: createResourceCache(),
        revalidation,
        online,
        nav: navigation.navigator,
        toast: createToaster(() => session.get().LL),
        revalidate() {
            revalidation.set(tick => tick + 1);
        },
        applyLanguage(result) {
            updateSession(current => {
                return {
                    ...current,
                    me: result.me,
                    locale: result.me.locale,
                    LL: createTranslator(result.me.locale, result.messages)
                };
            });
            services.revalidate();
        },
        updateMe(me) {
            updateSession(current => ({ ...current, me }));
        },
        async reloadSession() {
            const next = toSession(await loadBootstrap());

            updateSession(() => next);
        },
        reportEvent(kind, screen, details = {}) {
            if (!telemetryGate.allow({ kind, screen }, Date.now())) {
                return;
            }

            api.request('reportClientEvent', {
                body: { kind, screen, ...details },
                keepalive: true
            }).catch(() => undefined);
        }
    };

    persistNavigation(navigation.state, launch.initData);
    setDocumentLanguage(bootstrap.me.locale);

    return { services, navigation };
};

const ToastRegion = () => {
    const LL = useLL();

    return <ToastHost closeLabel={LL.a11y.closeToast()} />;
};

export const App = ({
    services,
    navigation
}: {
    services: AppServices;
    navigation: NavigatorHandle;
}) => {
    return (
        <AppContext.Provider value={services}>
            <OfflineBanner />
            <Router handle={navigation} />
            <BottomBarFallback />
            <ToastRegion />
            <PopupHost />
        </AppContext.Provider>
    );
};

const BootSkeleton = () => {
    return (
        <div class='screen' aria-busy='true'>
            <div class='boot' aria-hidden='true'>
                <div class='card card-border boot-tag boot-tag-hero' />
                <div class='card card-border boot-tag' />
                <div class='card card-border boot-tag' />
            </div>
        </div>
    );
};

export interface RootProps {
    phase: Store<RootPhase>;
    getLocale: () => AppLocale;
    botUrl: () => string;
    onRetry: () => void;
}

const SystemScreen = ({
    screen,
    locale,
    botUrl
}: {
    screen: SystemScreenId | 'unsupported';
    locale: AppLocale;
    botUrl: string;
}) => {
    if (screen === 'outsideTelegram') {
        return <OutsideTelegramScreen locale={locale} botUrl={botUrl} />;
    }

    if (screen === 'sessionExpired') {
        return <SessionExpiredScreen locale={locale} />;
    }

    return <UnavailableScreen locale={locale} botUrl={botUrl} kind={screen} />;
};

export const Root = ({ phase, getLocale, botUrl, onRetry }: RootProps) => {
    const current = useStore(phase);

    if (current.kind === 'ready') {
        return (
            <App services={current.services} navigation={current.navigation} />
        );
    }

    if (current.kind === 'system') {
        return (
            <SystemScreen
                screen={current.screen}
                locale={getLocale()}
                botUrl={botUrl()}
            />
        );
    }

    if (current.kind === 'bootError') {
        return <BootErrorScreen locale={getLocale()} onRetry={onRetry} />;
    }

    return <BootSkeleton />;
};
