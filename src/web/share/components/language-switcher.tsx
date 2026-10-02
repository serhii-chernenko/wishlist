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
        <nav
            class='mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm'
            aria-label={LL.web.language.label()}
        >
            <span>{LL.web.language.label()}:</span>
            <div class='join'>
                {SHARE_PAGE_LANGUAGES.map(option => {
                    return option === language ? (
                        <span
                            class='btn btn-sm btn-primary join-item cursor-default'
                            aria-current='page'
                            lang={option}
                        >
                            {LANGUAGE_ENDONYMS[option]}
                        </span>
                    ) : (
                        <a
                            class='btn btn-sm join-item border-base-300'
                            href={buildSharePath(publicId, option)}
                            hreflang={option}
                            lang={option}
                        >
                            {LANGUAGE_ENDONYMS[option]}
                        </a>
                    );
                })}
            </div>
        </nav>
    );
};
