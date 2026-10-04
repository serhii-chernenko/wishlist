import type { Child } from 'hono/jsx';

import type { ScreenId } from '../logic/nav';
import { useLL, useNav } from '../state/context';
import { isNativeBackButton } from '../telegram/buttons';

export interface ScreenLayoutProps {
    id: ScreenId;
    title: string;
    lead?: Child;
    busy?: boolean;
    actions?: Child;
    children?: Child;
}

/** Every screen renders inside this: one `main` landmark, one focusable `h1`, `data-screen` and `aria-busy` for the smoke harness. */
export const ScreenLayout = ({
    id,
    title,
    lead,
    busy = false,
    actions,
    children
}: ScreenLayoutProps) => {
    const nav = useNav();
    const LL = useLL();
    const titleId = `${id}-title`;
    const showBack = nav.canGoBack() && !isNativeBackButton();

    return (
        <main
            class='screen'
            data-screen={id}
            aria-busy={String(busy)}
            aria-labelledby={titleId}
        >
            <header class='screen-header'>
                {showBack ? (
                    <button
                        type='button'
                        class='back-link'
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
                    {actions}
                </div>
                {lead === undefined ? null : <p class='screen-lead'>{lead}</p>}
            </header>
            {children}
        </main>
    );
};
