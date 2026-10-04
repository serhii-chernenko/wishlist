import {
    ChartColumn,
    Coins,
    Eye,
    Gift,
    HandHeart,
    Heart,
    Info,
    Languages,
    MessageSquare,
    Search,
    Share2,
    Sparkles,
    Truck,
    Wallet
} from 'lucide';

import { newWishRoute } from '../logic/nav';
import type { ScreenProps } from '../nav/routes';
import { useLL, useNav, useSession } from '../state/context';
import { useBottomButton, useSettingsButton } from '../telegram/buttons';
import { ScreenLayout } from '../ui/screen';
import {
    HomeHero,
    MenuSection,
    OnboardingView,
    type MenuEntry
} from './onboarding';

const PRIMARY_MENU: readonly MenuEntry[] = [
    { screen: 'wishes', icon: Heart, tone: 'heart' },
    { screen: 'gives', icon: Gift, tone: 'box' },
    { screen: 'find', icon: Search },
    { screen: 'share', icon: Share2 }
];

const SETTINGS_MENU: readonly MenuEntry[] = [
    { screen: 'visibility', icon: Eye },
    { screen: 'payments', icon: Wallet },
    { screen: 'currency', icon: Coins },
    { screen: 'delivery', icon: Truck },
    { screen: 'language', icon: Languages }
];

const ABOUT_MENU: readonly MenuEntry[] = [
    { screen: 'stats', icon: ChartColumn, label: LL => LL.home.pairs.stats() },
    { screen: 'donate', icon: HandHeart, label: LL => LL.home.pairs.donate() },
    {
        screen: 'feedback',
        icon: MessageSquare,
        label: LL => LL.home.pairs.feedback()
    },
    {
        screen: 'releases',
        icon: Sparkles,
        label: LL => LL.home.pairs.releases()
    },
    { screen: 'about', icon: Info, label: LL => LL.home.pairs.about() }
];

const UserHome = () => {
    const LL = useLL();
    const nav = useNav();
    const { counts, me, config } = useSession();

    useBottomButton({
        text: LL.home.addWish(),
        onClick: () => {
            nav.push(newWishRoute(config.linkImportEnabled));
        }
    });
    useSettingsButton(() => {
        nav.push({ screen: 'settings' });
    });

    return (
        <ScreenLayout id='home' title={LL.home.heroTitle()}>
            <HomeHero title={LL.home.heroTitle()}>
                {me.telegramUsername === null ? null : (
                    <p class='hero-user'>@{me.telegramUsername}</p>
                )}
                <ul class='hero-stats'>
                    <li class='hero-stat hero-stat-wishes'>
                        {LL.home.wishesCount({ count: counts?.wishes ?? 0 })}
                    </li>
                    <li class='hero-stat hero-stat-gives'>
                        {LL.home.givesCount({ count: counts?.gives ?? 0 })}
                    </li>
                </ul>
            </HomeHero>
            <nav aria-label={LL.a11y.mainNavigation()}>
                <MenuSection id='home-main' entries={PRIMARY_MENU} primary />
            </nav>
            <MenuSection
                id='home-settings'
                title={LL.home.groups.settings()}
                entries={SETTINGS_MENU}
            />
            <MenuSection
                id='home-about'
                title={LL.home.groups.about()}
                entries={ABOUT_MENU}
                layout='pairs'
            />
        </ScreenLayout>
    );
};

export const HomeScreen = (_props: ScreenProps<'home'>) => {
    const { me } = useSession();

    return me.registered ? <UserHome /> : <OnboardingView id='home' />;
};
