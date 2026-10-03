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
import { useLL, useNav, useSession } from '../state/context';
import { useBottomButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { Icon, type IconNode } from '../ui/icon';
import { AppLogo } from '../ui/logo';
import { ScreenLayout } from '../ui/screen';

const STRING_PATH = 'M0 56 C1 30 20 6 44 8 S72 34 92 22 S110 2 120 8';
const STEP_KEYS = ['create', 'share', 'give'] as const;

export type MenuScreen = Extract<
    ScreenId,
    | 'wishes'
    | 'gives'
    | 'find'
    | 'share'
    | 'visibility'
    | 'payments'
    | 'language'
    | 'feedback'
    | 'stats'
    | 'donate'
    | 'releases'
    | 'about'
>;

/** The gift-tag hero with its punched hole and string; the screen h1 lives in the layout header, so this copy is decorative. */
export const HomeHero = ({
    title,
    children
}: {
    title: string;
    children?: Child;
}) => {
    return (
        <section class='hero home-hero'>
            <svg class='hero-string' viewBox='0 0 112 64' aria-hidden='true'>
                <path d={STRING_PATH} />
            </svg>
            <AppLogo class='hero-logo' />
            <p class='hero-title' aria-hidden='true'>
                <span class='hero-name'>{title}</span>
            </p>
            {children}
        </section>
    );
};

export interface MenuEntry {
    screen: MenuScreen;
    icon: IconNode;
    tone?: 'heart' | 'box';
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
                                    {LL.nav[entry.screen]()}
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
    { screen: 'stats', icon: ChartColumn },
    { screen: 'donate', icon: HandHeart },
    { screen: 'feedback', icon: MessageSquare },
    { screen: 'about', icon: Info }
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
    const { me } = useSession();

    useEffect(() => {
        if (me.registered) {
            nav.reset([{ screen: 'home' }]);
        }
    }, [me.registered]);

    return <OnboardingView id='onboarding' />;
};
