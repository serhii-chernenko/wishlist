import { getTranslator } from '../../../bot/i18n';
import {
    buildSharePath,
    SHARE_PAGE_LANGUAGES,
    type SharePageLanguage
} from '../public-id';

export const LANGUAGE_ENDONYMS = {
    uk: 'Українська',
    en: 'English',
    pl: 'Polski'
} as const satisfies Record<SharePageLanguage, string>;

export const LanguageSwitcher = ({
    language,
    publicId
}: {
    language: SharePageLanguage;
    publicId: string;
}) => {
    const LL = getTranslator(language);

    return (
        <nav class='switcher' aria-label={LL.web.language.label()}>
            <span>{LL.web.language.label()}:</span>
            <ul>
                {SHARE_PAGE_LANGUAGES.map(option => {
                    return (
                        <li>
                            {option === language ? (
                                <span aria-current='page' lang={option}>
                                    {LANGUAGE_ENDONYMS[option]}
                                </span>
                            ) : (
                                <a
                                    href={buildSharePath(publicId, option)}
                                    hreflang={option}
                                    lang={option}
                                >
                                    {LANGUAGE_ENDONYMS[option]}
                                </a>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
