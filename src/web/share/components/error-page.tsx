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
        <main class='message'>
            <h1>{title}</h1>
            <p>{description}</p>
            <a class='button' href={botUrl} rel='noopener noreferrer'>
                {LL.web.notFound.cta()}
            </a>
        </main>
    );
};
