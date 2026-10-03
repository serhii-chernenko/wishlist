import type { SystemNoticeTexts } from '../i18n/system-texts';

export interface SystemNoticeProps {
    screen: string;
    texts: SystemNoticeTexts;
    href?: string;
    onAction?: () => void;
}

/** Full-screen notice that works before (or without) the bootstrap dictionary. */
export const SystemNotice = ({
    screen,
    texts,
    href,
    onAction
}: SystemNoticeProps) => {
    return (
        <main class='screen' data-screen={screen} aria-busy='false'>
            <section class='hero system-hero'>
                <h1 class='hero-title' tabindex={-1}>
                    <span class='hero-name'>{texts.title}</span>
                </h1>
                <p class='hero-meta'>{texts.text}</p>
                {href === undefined ? (
                    <button
                        type='button'
                        class='cta hero-action'
                        onClick={() => {
                            onAction?.();
                        }}
                    >
                        {texts.cta}
                    </button>
                ) : (
                    <a
                        class='cta hero-action'
                        href={href}
                        rel='noopener noreferrer'
                        onClick={(event: MouseEvent) => {
                            if (onAction !== undefined) {
                                event.preventDefault();
                                onAction();
                            }
                        }}
                    >
                        {texts.cta}
                    </a>
                )}
            </section>
        </main>
    );
};
