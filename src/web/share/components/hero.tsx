import type { Child } from 'hono/jsx';

import { LogoMark } from './logo';

export const HERO_LOGO_ID_PREFIX = 'wl-hero';

const STRING_PATH = 'M0 56 C1 30 20 6 44 8 S72 34 92 22 S110 2 120 8';

export const HeroTag = ({
    heading,
    children
}: {
    heading: Child;
    children?: Child;
}) => {
    return (
        <header class='hero'>
            <svg class='hero-string' viewBox='0 0 112 64' aria-hidden='true'>
                <path d={STRING_PATH} />
            </svg>
            <LogoMark idPrefix={HERO_LOGO_ID_PREFIX} class='hero-logo' />
            <h1 class='hero-title'>{heading}</h1>
            {children}
        </header>
    );
};
