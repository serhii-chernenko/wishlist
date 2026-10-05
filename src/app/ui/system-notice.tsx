import type { SystemNoticeTexts } from '../i18n/system-texts';
import { HeroTag } from './hero-tag';

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
            <HeroTag
                class='system-hero'
                headingLevel='h1'
                heading={<span class='hero-name'>{texts.title}</span>}
            >
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
            </HeroTag>
        </main>
    );
};
