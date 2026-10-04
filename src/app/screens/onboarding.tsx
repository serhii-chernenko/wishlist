import type { Child } from 'hono/jsx';
import { useEffect } from 'hono/jsx/dom';
import {
    ChartColumn,
    ChevronRight,
    HandHeart,
    Info,
    Languages,
    MessageSquare
} from 'lucide';

import type { Route, ScreenId, ScreenProps } from '../nav/routes';
import type { AppTranslator } from '../i18n/i18n';
import { routesAfterRegistration } from '../logic/nav';
import { useApp, useLL, useNav, useSession } from '../state/context';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { Icon, type IconNode } from '../ui/icon';
import { HeroTag } from '../ui/hero-tag';
import { ScreenLayout } from '../ui/screen';
import { ThemeQuickToggle } from '../ui/theme-toggle';

const STEP_KEYS = ['create', 'share', 'give'] as const;

export type MenuScreen = Extract<
    ScreenId,
    | 'wishes'
    | 'gives'
    | 'find'
    | 'share'
    | 'visibility'
    | 'payments'
    | 'currency'
    | 'delivery'
    | 'language'
    | 'feedback'
    | 'stats'
    | 'donate'
    | 'releases'
    | 'about'
>;

/** The Home and onboarding hero: the screen h1 lives in the layout header, so the big title here is decorative. */
export const HomeHero = ({
    title,
    children
}: {
    title: string;
    children?: Child;
}) => {
    return (
        <HeroTag
            class='home-hero'
            heading={<span class='hero-name'>{title}</span>}
            action={<ThemeQuickToggle />}
        >
            {children}
        </HeroTag>
    );
};

export interface MenuEntry {
    screen: MenuScreen;
    icon: IconNode;
    tone?: 'heart' | 'box';
    label?: (LL: AppTranslator) => string;
}

/** A bot-like menu section: full-width rows with an icon and a chevron, or compact two-up cells for secondary screens. */
export const MenuSection = ({
    id,
    title,
    entries,
    layout = 'rows',
    primary = false
}: {
    id: string;
    title?: string;
    entries: readonly MenuEntry[];
    layout?: 'rows' | 'pairs';
    primary?: boolean;
}) => {
    const LL = useLL();
    const nav = useNav();
    const headingId = `${id}-title`;
    const listClass = [
        'menu-list',
        layout === 'pairs' ? 'menu-list-pairs' : '',
        primary ? 'menu-list-primary' : ''
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <section
            class='menu-group'
            {...(title !== undefined && { 'aria-labelledby': headingId })}
        >
            {title === undefined ? null : (
                <h2 id={headingId} class='menu-group-title'>
                    {title}
                </h2>
            )}
            <ul class={listClass}>
                {entries.map(entry => {
                    return (
                        <li key={entry.screen}>
                            <button
                                type='button'
                                class='menu-row'
                                onClick={() => {
                                    haptics.selection();
                                    nav.push({ screen: entry.screen } as Route);
                                }}
                            >
                                <span
                                    class={`menu-icon menu-icon-${entry.tone ?? 'plain'}`}
                                >
                                    <Icon icon={entry.icon} />
                                </span>
                                <span class='menu-row-label'>
                                    {entry.label === undefined
                                        ? LL.nav[entry.screen]()
                                        : entry.label(LL)}
                                </span>
                                {layout === 'rows' ? (
                                    <Icon
                                        icon={ChevronRight}
                                        class='menu-row-chevron'
                                    />
                                ) : null}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

const GUEST_SETTINGS: readonly MenuEntry[] = [
    { screen: 'language', icon: Languages }
];

const GUEST_ABOUT: readonly MenuEntry[] = [
    { screen: 'stats', icon: ChartColumn, label: LL => LL.home.pairs.stats() },
    { screen: 'donate', icon: HandHeart, label: LL => LL.home.pairs.donate() },
    {
        screen: 'feedback',
        icon: MessageSquare,
        label: LL => LL.home.pairs.feedback()
    },
    { screen: 'about', icon: Info, label: LL => LL.home.pairs.about() }
];

/** What a guest sees at the root: the pitch, the three steps and the screens that work without a list. */
export const OnboardingView = ({ id }: { id: 'home' | 'onboarding' }) => {
    const LL = useLL();
    const nav = useNav();
    const guest = LL.home.guest;

    useBottomButton({
        text: guest.cta(),
        onClick: () => {
            nav.push({ screen: 'visibility' });
        }
    });

    return (
        <ScreenLayout id={id} title={guest.title()}>
            <HomeHero title={guest.title()}>
                <p class='hero-meta'>{guest.lead()}</p>
                <p class='hero-note'>{guest.note()}</p>
            </HomeHero>
            <section class='home-steps' aria-labelledby={`${id}-steps`}>
                <h2 id={`${id}-steps`} class='section-title'>
                    {guest.stepsTitle()}
                </h2>
                <ol class='steps'>
                    {STEP_KEYS.map(key => {
                        return (
                            <li key={key} class='step'>
                                <h3 class='step-title'>
                                    {guest.steps[key].title()}
                                </h3>
                                <p class='step-text'>
                                    {guest.steps[key].text()}
                                </p>
                            </li>
                        );
                    })}
                </ol>
            </section>
            <MenuSection
                id={`${id}-settings`}
                title={LL.home.groups.settings()}
                entries={GUEST_SETTINGS}
            />
            <MenuSection
                id={`${id}-about`}
                title={LL.home.groups.about()}
                entries={GUEST_ABOUT}
                layout='pairs'
            />
        </ScreenLayout>
    );
};

export const OnboardingScreen = (_props: ScreenProps<'onboarding'>) => {
    const nav = useNav();
    const { launch } = useApp();
    const { me } = useSession();

    useEffect(() => {
        if (me.registered) {
            nav.reset(routesAfterRegistration(launch.startParam));
        }
    }, [me.registered]);

    return <OnboardingView id='onboarding' />;
};
