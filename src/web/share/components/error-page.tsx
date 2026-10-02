import { getTranslator } from '../../../bot/i18n';
import type { SharePageLanguage } from '../public-id';

export type SharePageErrorKind = 'notFound' | 'gone';

export const getErrorPageTexts = (
    language: SharePageLanguage,
    kind: SharePageErrorKind
) => {
    const LL = getTranslator(language);

    return kind === 'gone'
        ? {
              title: LL.web.gone.title(),
              description: LL.web.gone.description()
          }
        : {
              title: LL.web.notFound.title(),
              description: LL.web.notFound.description()
          };
};

export const ErrorPage = ({
    language,
    kind,
    botUrl
}: {
    language: SharePageLanguage;
    kind: SharePageErrorKind;
    botUrl: string;
}) => {
    const LL = getTranslator(language);
    const { title, description } = getErrorPageTexts(language, kind);

    return (
        <main class='card card-border my-10 bg-base-100'>
            <div class='card-body items-start gap-4 p-6 sm:p-8'>
                <h1 class='text-3xl leading-tight font-extrabold text-balance'>
                    {title}
                </h1>
                <p>{description}</p>
                <a
                    class='btn btn-primary'
                    href={botUrl}
                    rel='noopener noreferrer'
                >
                    {LL.web.notFound.cta()}
                </a>
            </div>
        </main>
    );
};
