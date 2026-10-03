import type { ScreenProps } from '../nav/routes';
import type { Route } from '../nav/routes';
import { useLL, useNav, useSession } from '../state/context';
import { useBottomButton, useSettingsButton } from '../telegram/buttons';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

const PLACEHOLDER_LINKS = [
    'wishes',
    'gives',
    'find',
    'share',
    'settings',
    'visibility',
    'payments',
    'language',
    'feedback',
    'stats',
    'donate',
    'releases',
    'about'
] as const;

export const HomeScreen = (_props: ScreenProps<'home'>) => {
    const LL = useLL();
    const nav = useNav();
    const { counts } = useSession();
    const open = (route: Route) => {
        nav.push(route);
    };

    useBottomButton({
        text: LL.home.addWish(),
        onClick: () => {
            open({ screen: 'wishEditor', wishId: null });
        }
    });
    useSettingsButton(() => {
        open({ screen: 'settings' });
    });

    return (
        <ScreenLayout id='home' title={LL.home.title()}>
            <Tag>
                <p class='state-text'>
                    {LL.home.wishesCount({ count: counts?.wishes ?? 0 })}
                </p>
            </Tag>
            <nav class='placeholder-nav' aria-label={LL.a11y.mainNavigation()}>
                {PLACEHOLDER_LINKS.map(screen => {
                    return (
                        <button
                            key={screen}
                            type='button'
                            class='chip'
                            onClick={() => {
                                open({ screen });
                            }}
                        >
                            {LL.nav[screen]()}
                        </button>
                    );
                })}
            </nav>
        </ScreenLayout>
    );
};
