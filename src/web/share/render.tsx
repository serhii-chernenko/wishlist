import { getTranslator } from '../../bot/i18n';
import { ErrorPage, getErrorPageTexts } from './components/error-page';
import type { SharePageErrorKind } from './components/error-page';
import { PageLayout, SITE_NAME } from './components/layout';
import type { PageAlternates } from './components/layout';
import { SharePage } from './components/share-page';
import {
    buildShareUrl,
    SHARE_PAGE_LANGUAGES,
    type SharePageLanguage
} from './public-id';
import type { SharePageModel } from './view-model';

const DOCTYPE = '<!DOCTYPE html>';
const OG_IMAGE_PATH = '/og-image.png';

const buildAlternates = (model: SharePageModel): PageAlternates => {
    const urlByLanguage = Object.fromEntries(
        SHARE_PAGE_LANGUAGES.map(language => {
            return [
                language,
                buildShareUrl(model.origin, model.publicId, language)
            ];
        })
    ) as Record<SharePageLanguage, string>;

    return {
        canonicalUrl: urlByLanguage[model.language],
        defaultUrl: buildShareUrl(model.origin, model.publicId),
        urlByLanguage,
        imageUrl: new URL(OG_IMAGE_PATH, model.origin).toString()
    };
};

export const renderSharePage = (model: SharePageModel) => {
    const LL = getTranslator(model.language);
    const ownerName = model.displayName ?? SITE_NAME;
    const title =
        model.displayName === null
            ? LL.title()
            : LL.share.title({ name: model.displayName });
    const description = LL.web.meta.description({
        name: ownerName,
        count: model.visibleCount
    });
    const document = (
        <PageLayout
            language={model.language}
            title={title}
            description={description}
            indexable={model.indexable}
            alternates={buildAlternates(model)}
            assetVersion={model.assetVersion}
        >
            <SharePage model={model} />
        </PageLayout>
    );

    return `${DOCTYPE}${document.toString()}`;
};

export const renderErrorPage = (
    language: SharePageLanguage,
    kind: SharePageErrorKind,
    botUrl: string,
    assetVersion: string
) => {
    const { title, description } = getErrorPageTexts(language, kind);
    const document = (
        <PageLayout
            language={language}
            title={title}
            description={description}
            indexable={false}
            assetVersion={assetVersion}
        >
            <ErrorPage language={language} kind={kind} botUrl={botUrl} />
        </PageLayout>
    );

    return `${DOCTYPE}${document.toString()}`;
};
