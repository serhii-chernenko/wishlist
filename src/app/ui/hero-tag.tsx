import type { Child } from 'hono/jsx';

import { AppLogo } from './logo';

const STRING_PATH = 'M0 56 C1 30 20 6 44 8 S72 34 92 22 S110 2 120 8';

/** The gift-tag hero shared with the web pages: string, punched hole, logo, then the title; `action` sits in the logo row. */
export const HeroTag = ({
    heading,
    headingLevel = 'decorative',
    action,
    class: className,
    children
}: {
    heading: Child;
    headingLevel?: 'h1' | 'decorative';
    action?: Child;
    class?: string;
    children?: Child;
}) => {
    return (
        <section class={className === undefined ? 'hero' : `hero ${className}`}>
            <svg class='hero-string' viewBox='0 0 112 64' aria-hidden='true'>
                <path d={STRING_PATH} />
            </svg>
            <AppLogo class='hero-logo' />
            {action}
            {headingLevel === 'h1' ? (
                <h1 class='hero-title' tabindex={-1}>
                    {heading}
                </h1>
            ) : (
                <p class='hero-title' aria-hidden='true'>
                    {heading}
                </p>
            )}
            {children}
        </section>
    );
};
