import type { SupportLink } from '../../../bot/content/support-links';
import { getTranslator, type AppLocale } from '../../../bot/i18n';
import { TEXT_LINK_CLASS } from './link-classes';
import { LogoMark } from './logo';

const EXTERNAL_LINK_REL = 'noopener noreferrer';
const LEADING_EMOJI = /^[\p{Extended_Pictographic}️‍\s]+/u;

export const BotCallToAction = ({
    botUrl,
    label
}: {
    botUrl: string;
    label: string;
}) => {
    return (
        <a class='cta' href={botUrl} rel={EXTERNAL_LINK_REL}>
            <LogoMark idPrefix='wl-cta' class='cta-logo' />
            <span>{label}</span>
        </a>
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
            {supportLinks.length > 0 ? (
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
            ) : null}
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
