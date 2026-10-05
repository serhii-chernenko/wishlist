import type { WebTheme } from '../theme';
import { getTranslator } from '../../bot/i18n';
import { ErrorPage, getErrorPageTexts } from './components/error-page';
import type { SharePageErrorKind } from './components/error-page';
import { HomePage } from './components/home-page';
import { PageLayout, SITE_NAME } from './components/layout';
import type { PageAlternates } from './components/layout';
import { SharePage } from './components/share-page';
import {
    buildHomeUrl,
    buildShareUrl,
    SHARE_PAGE_LANGUAGES,
    type SharePageLanguage
} from './public-id';
import type { HomePageModel, SharePageModel } from './view-model';

const DOCTYPE = '<!DOCTYPE html>';
const OG_IMAGE_PATH = '/og-image.png';
const AUTHOR_NAME = 'Serhii Chernenko';
const APPLICATION_CATEGORY = 'LifestyleApplication';
const APPLICATION_OPERATING_SYSTEM = 'Telegram';
const FREE_OFFER_CURRENCY = 'UAH';

const buildUrlByLanguage = (
    buildUrl: (language: SharePageLanguage) => string
) => {
    return Object.fromEntries(
        SHARE_PAGE_LANGUAGES.map(language => {
            return [language, buildUrl(language)];
        })
    ) as Record<SharePageLanguage, string>;
};

const buildImageUrl = (origin: string) => {
    return new URL(OG_IMAGE_PATH, origin).toString();
};

const buildAlternates = (model: SharePageModel): PageAlternates => {
    const urlByLanguage = buildUrlByLanguage(language => {
        return buildShareUrl(model.origin, model.publicId, language);
    });

    return {
        canonicalUrl: urlByLanguage[model.language],
        defaultUrl: buildShareUrl(model.origin, model.publicId),
        urlByLanguage,
        imageUrl: buildImageUrl(model.origin)
    };
};

const buildHomeAlternates = (model: HomePageModel): PageAlternates => {
    const urlByLanguage = buildUrlByLanguage(language => {
        return buildHomeUrl(model.origin, language);
    });

    return {
        canonicalUrl: urlByLanguage[model.language],
        defaultUrl: buildHomeUrl(model.origin),
        urlByLanguage,
        imageUrl: buildImageUrl(model.origin)
    };
};

const buildHomeStructuredData = (
    model: HomePageModel,
    alternates: PageAlternates
) => {
    const LL = getTranslator(model.language);

    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: LL.web.home.name(),
        description: LL.web.home.description(),
        url: alternates.canonicalUrl,
        inLanguage: model.language,
        image: alternates.imageUrl,
        installUrl: model.botUrl,
        applicationCategory: APPLICATION_CATEGORY,
        operatingSystem: APPLICATION_OPERATING_SYSTEM,
        isAccessibleForFree: true,
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: FREE_OFFER_CURRENCY
        },
        author: {
            '@type': 'Person',
            name: AUTHOR_NAME,
            url: model.authorUrl
        },
        sameAs: [model.botUrl, model.githubUrl]
    };
};

export const renderHomePage = (model: HomePageModel) => {
    const LL = getTranslator(model.language);
    const alternates = buildHomeAlternates(model);
    const document = (
        <PageLayout
            language={model.language}
            title={LL.web.home.title()}
            description={LL.web.home.description()}
            indexable={model.indexable}
            alternates={alternates}
            structuredData={buildHomeStructuredData(model, alternates)}
            assetVersion={model.assetVersion}
            theme={model.theme ?? 'system'}
        >
            <HomePage model={model} />
        </PageLayout>
    );

    return `${DOCTYPE}${document.toString()}`;
};

const hasPhotos = (model: SharePageModel) => {
    return [...model.wishes, ...(model.gifted ?? [])].some(wish => {
        return (wish.photos?.length ?? 0) > 0;
    });
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
            carouselScript={hasPhotos(model)}
            theme={model.theme ?? 'system'}
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
    assetVersion: string,
    theme: WebTheme = 'system',
    back = '/'
) => {
    const { title, description } = getErrorPageTexts(language, kind);
    const document = (
        <PageLayout
            language={language}
            title={title}
            description={description}
            indexable={false}
            assetVersion={assetVersion}
            theme={theme}
        >
            <ErrorPage
                language={language}
                kind={kind}
                botUrl={botUrl}
                theme={theme}
                back={back}
            />
        </PageLayout>
    );

    return `${DOCTYPE}${document.toString()}`;
};
