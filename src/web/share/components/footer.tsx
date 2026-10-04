import type { SupportLink } from '../../../bot/content/support-links';
import { getTranslator, type AppLocale } from '../../../bot/i18n';
import { TEXT_LINK_CLASS } from './link-classes';
import { HERO_LOGO_ID_PREFIX } from './hero';
import { LogoReference } from './logo';

export const EXTERNAL_LINK_REL = 'noopener noreferrer';
const LEADING_EMOJI = /^[\p{Extended_Pictographic}️‍\s]+/u;

/** Call to action that reuses the hero logo every page draws above it. */
export const BotCallToAction = ({
    botUrl,
    label
}: {
    botUrl: string;
    label: string;
}) => {
    return (
        <a class='cta' href={botUrl} rel={EXTERNAL_LINK_REL}>
            <LogoReference idPrefix={HERO_LOGO_ID_PREFIX} class='cta-logo' />
            <span>{label}</span>
        </a>
    );
};

export const SupportSection = ({
    language,
    supportLinks
}: {
    language: AppLocale;
    supportLinks: readonly SupportLink[];
}) => {
    const LL = getTranslator(language);

    if (supportLinks.length === 0) {
        return null;
    }

    return (
        <section class='support'>
            <h2 class='support-title'>{LL.web.footer.support()}</h2>
            <ul>
                {supportLinks.map(link => {
                    return (
                        <li>
                            <a
                                class='chip'
                                href={link.url}
                                rel={EXTERNAL_LINK_REL}
                                target='_blank'
                            >
                                {link.title.replace(LEADING_EMOJI, '')}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export const PageFooter = ({
    language,
    botUrl,
    githubUrl,
    supportLinks
}: {
    language: AppLocale;
    botUrl: string;
    githubUrl: string;
    supportLinks: readonly SupportLink[];
}) => {
    const LL = getTranslator(language);

    return (
        <footer class='page-footer'>
            <BotCallToAction botUrl={botUrl} label={LL.web.footer.cta()} />
            <SupportSection language={language} supportLinks={supportLinks} />
            <p>
                <a
                    class={TEXT_LINK_CLASS}
                    href={githubUrl}
                    rel={EXTERNAL_LINK_REL}
                    target='_blank'
                >
                    {LL.web.footer.openSource()}
                </a>
            </p>
        </footer>
    );
};
