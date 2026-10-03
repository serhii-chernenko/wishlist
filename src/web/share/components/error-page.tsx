import { getTranslator } from '../../../bot/i18n';
import type { SharePageLanguage } from '../public-id';
import { BotCallToAction } from './footer';
import { HeroTag } from './hero';
import { ThemeSwitcher } from './theme-switcher';
import type { WebTheme } from '../../theme';

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
    botUrl,
    theme,
    back
}: {
    language: SharePageLanguage;
    kind: SharePageErrorKind;
    botUrl: string;
    theme: WebTheme;
    back: string;
}) => {
    const LL = getTranslator(language);
    const { title, description } = getErrorPageTexts(language, kind);

    return (
        <>
            <div class='top-bar'>
                <ThemeSwitcher language={language} theme={theme} back={back} />
            </div>
            <main>
                <HeroTag heading={<span class='hero-name'>{title}</span>}>
                    <p class='hero-meta'>{description}</p>
                </HeroTag>
                <p class='error-actions'>
                    <BotCallToAction
                        botUrl={botUrl}
                        label={LL.web.notFound.cta()}
                    />
                </p>
            </main>
        </>
    );
};
