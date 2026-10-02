import type { SupportLink } from '../../../bot/content/support-links';
import { getTranslator, type AppLocale } from '../../../bot/i18n';

const EXTERNAL_LINK_REL = 'noopener noreferrer';

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
        <footer class='footer'>
            <a class='button' href={botUrl} rel={EXTERNAL_LINK_REL}>
                {LL.web.footer.cta()}
            </a>
            {supportLinks.length > 0 ? (
                <section>
                    <h2>{LL.web.footer.support()}</h2>
                    <ul class='support'>
                        {supportLinks.map(link => {
                            return (
                                <li>
                                    <a
                                        href={link.url}
                                        rel={EXTERNAL_LINK_REL}
                                        target='_blank'
                                    >
                                        {link.title}
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ) : null}
            <p class='source'>
                <a href={githubUrl} rel={EXTERNAL_LINK_REL} target='_blank'>
                    {LL.web.footer.openSource()}
                </a>
            </p>
        </footer>
    );
};
