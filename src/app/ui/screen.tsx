import type { Child } from 'hono/jsx';

import type { ScreenId } from '../logic/nav';
import { useLL, useNav } from '../state/context';
import { isNativeBackButton, isNativeHomeButton } from '../telegram/buttons';
import { haptics } from '../telegram/haptics';
import { useStickyHeader } from './sticky-header';

export interface ScreenLayoutProps {
    id: ScreenId;
    title: string;
    lead?: Child;
    summary?: Child;
    toolbar?: Child;
    sticky?: boolean;
    busy?: boolean;
    actions?: Child;
    children?: Child;
}

const HomeLink = () => {
    const nav = useNav();
    const LL = useLL();

    return (
        <div class='screen-home'>
            <button
                type='button'
                class='btn btn-link btn-accent text-button'
                onClick={() => {
                    haptics.selection();
                    void nav.home();
                }}
            >
                {LL.common.toHome()}
            </button>
        </div>
    );
};

/** Every screen renders inside this: one `main` landmark, one focusable `h1`, `data-screen` and `aria-busy` for the smoke harness. A `sticky` header collapses to a compact bar while scrolled; `lead` and `summary` hide then. */
export const ScreenLayout = ({
    id,
    title,
    lead,
    summary,
    toolbar,
    sticky = false,
    busy = false,
    actions,
    children
}: ScreenLayoutProps) => {
    const nav = useNav();
    const LL = useLL();
    const titleId = `${id}-title`;
    const deeperThanRoot = nav.canGoBack();
    const showBack = deeperThanRoot && !isNativeBackButton();
    const showHome = deeperThanRoot && !isNativeHomeButton();
    const stickyRefs = useStickyHeader(sticky);

    const headerContent = (
        <>
            {showBack ? (
                <button
                    type='button'
                    class='btn btn-link btn-accent back-link'
                    onClick={() => {
                        void nav.back();
                    }}
                >
                    {LL.common.back()}
                </button>
            ) : null}
            <div class='screen-heading'>
                <h1 id={titleId} class='screen-title' tabindex={-1}>
                    {title}
                </h1>
                {actions === undefined ? null : (
                    <div class='screen-actions'>{actions}</div>
                )}
            </div>
            {lead === undefined ? null : <p class='screen-lead'>{lead}</p>}
            {summary === undefined ? null : (
                <div class='screen-summary'>{summary}</div>
            )}
            {toolbar === undefined ? null : (
                <div class='screen-toolbar'>{toolbar}</div>
            )}
        </>
    );

    return (
        <main
            class='screen'
            data-screen={id}
            aria-busy={String(busy)}
            aria-labelledby={titleId}
        >
            {sticky ? (
                <div
                    class='sticky-sentinel'
                    ref={stickyRefs.sentinel}
                    aria-hidden='true'
                />
            ) : null}
            {sticky ? (
                <header
                    class='screen-header screen-header-sticky'
                    ref={stickyRefs.header}
                >
                    <div class='screen-header-bar' ref={stickyRefs.bar}>
                        {headerContent}
                    </div>
                </header>
            ) : (
                <header class='screen-header'>{headerContent}</header>
            )}
            {children}
            {showHome ? <HomeLink /> : null}
        </main>
    );
};
