import type { SupportLink } from '../../../bot/content/support-links';
import { getTranslator, type AppLocale } from '../../../bot/i18n';
import { TEXT_LINK_CLASS } from './link-classes';

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
        <footer class='footer footer-vertical mt-10 rounded-box border border-base-300 bg-base-100 p-5 text-base-content sm:p-6'>
            <a
                class='btn btn-primary h-auto min-h-10 max-w-full py-2 text-start'
                href={botUrl}
                rel={EXTERNAL_LINK_REL}
            >
                {LL.web.footer.cta()}
            </a>
            {supportLinks.length > 0 ? (
                <section class='grid gap-3'>
                    <h2 class='text-base font-bold'>
                        {LL.web.footer.support()}
                    </h2>
                    <ul class='flex flex-wrap gap-2'>
                        {supportLinks.map(link => {
                            return (
                                <li>
                                    <a
                                        class='btn btn-sm border-base-300'
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
