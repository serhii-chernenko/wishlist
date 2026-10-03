import { getTranslator } from '../../../bot/i18n';
import { SHARE_PAGE_LANGUAGES, type SharePageLanguage } from '../public-id';

export const LANGUAGE_ENDONYMS = {
    uk: 'Українська',
    en: 'English',
    pl: 'Polski'
} as const satisfies Record<SharePageLanguage, string>;

export const LANGUAGE_SHORT_LABELS = {
    uk: 'UA',
    en: 'EN',
    pl: 'PL'
} as const satisfies Record<SharePageLanguage, string>;

export const LanguageSwitcher = ({
    language,
    pathFor
}: {
    language: SharePageLanguage;
    pathFor: (language: SharePageLanguage) => string;
}) => {
    const LL = getTranslator(language);

    return (
        <nav class='lang-switch' aria-label={LL.web.language.label()}>
            <ul>
                {SHARE_PAGE_LANGUAGES.map(option => {
                    return (
                        <li>
                            {option === language ? (
                                <span
                                    aria-current='page'
                                    aria-label={`${LANGUAGE_ENDONYMS[option]} (${LANGUAGE_SHORT_LABELS[option]})`}
                                    lang={option}
                                >
                                    {LANGUAGE_SHORT_LABELS[option]}
                                </span>
                            ) : (
                                <a
                                    href={pathFor(option)}
                                    hreflang={option}
                                    lang={option}
                                    aria-label={`${LANGUAGE_ENDONYMS[option]} (${LANGUAGE_SHORT_LABELS[option]})`}
                                >
                                    {LANGUAGE_SHORT_LABELS[option]}
                                </a>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
