import { getTranslator } from '../../../bot/i18n';
import { buildHomePath } from '../public-id';
import type { HomePageModel } from '../view-model';
import { BotCallToAction, EXTERNAL_LINK_REL, SupportSection } from './footer';
import { HeroTag } from './hero';
import { LanguageSwitcher } from './language-switcher';
import { TEXT_LINK_CLASS } from './link-classes';

const STEP_KEYS = ['create', 'share', 'give'] as const;

const FEATURE_KEYS = [
    'photos',
    'prices',
    'priority',
    'hidden',
    'page',
    'search',
    'languages'
] as const;

const FEATURE_STICKER_VARIANTS = ['heart', 'box', 'tag'] as const;

const STEPS_HEADING_ID = 'how-it-works';
const FEATURES_HEADING_ID = 'features';
const PRIVACY_HEADING_ID = 'privacy';
const TELEGRAM_HANDLE_PATTERN = /^\/([A-Za-z0-9_]{5,32})\/?$/;

export const getBotHandle = (botUrl: string) => {
    try {
        const handle = TELEGRAM_HANDLE_PATTERN.exec(
            new URL(botUrl).pathname
        )?.[1];

        return handle === undefined ? null : `@${handle}`;
    } catch {
        return null;
    }
};

export const getHomeCallToActionLabel = (model: HomePageModel) => {
    const LL = getTranslator(model.language);
    const handle = getBotHandle(model.botUrl);

    return handle === null
        ? LL.web.notFound.cta()
        : LL.web.home.cta({ bot: handle });
};

const HowItWorks = ({ model }: { model: HomePageModel }) => {
    const LL = getTranslator(model.language);

    return (
        <section class='home-section' aria-labelledby={STEPS_HEADING_ID}>
            <h2 class='section-title' id={STEPS_HEADING_ID}>
                {LL.web.home.steps.title()}
            </h2>
            <ol class='steps'>
                {STEP_KEYS.map(key => {
                    return (
                        <li class='step'>
                            <h3 class='step-title'>
                                {LL.web.home.steps[key].title()}
                            </h3>
                            <p class='step-text'>
                                {LL.web.home.steps[key].text()}
                            </p>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
};

const Features = ({ model }: { model: HomePageModel }) => {
    const LL = getTranslator(model.language);

    return (
        <section class='home-section' aria-labelledby={FEATURES_HEADING_ID}>
            <h2 class='section-title' id={FEATURES_HEADING_ID}>
                {LL.web.home.features.title()}
            </h2>
            <ul class='features'>
                {FEATURE_KEYS.map((key, index) => {
                    const variant =
                        FEATURE_STICKER_VARIANTS[
                            index % FEATURE_STICKER_VARIANTS.length
                        ];

                    return (
                        <li class='feature'>
                            <h3 class={`sticker sticker-${variant}`}>
                                {LL.web.home.features[key].title()}
                            </h3>
                            <p class='feature-text'>
                                {LL.web.home.features[key].text()}
                            </p>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

const Privacy = ({ model }: { model: HomePageModel }) => {
    const LL = getTranslator(model.language);

    return (
        <section class='note' aria-labelledby={PRIVACY_HEADING_ID}>
            <div class='note-tag'>
                <div class='note-body'>
                    <h2 class='section-title' id={PRIVACY_HEADING_ID}>
                        {LL.web.home.privacy.title()}
                    </h2>
                    <ul class='note-list'>
                        <li>{LL.web.home.privacy.phone()}</li>
                        <li>{LL.web.home.privacy.name()}</li>
                        <li>{LL.web.home.privacy.openSource()}</li>
                    </ul>
                </div>
            </div>
        </section>
    );
};

const HomeFooter = ({ model }: { model: HomePageModel }) => {
    const LL = getTranslator(model.language);
    const links = [
        { href: model.githubUrl, label: LL.web.footer.openSource() },
        { href: model.authorUrl, label: LL.web.home.links.author() },
        { href: model.princessUrl, label: LL.web.home.links.princess() }
    ];

    return (
        <footer class='page-footer'>
            <BotCallToAction
                botUrl={model.botUrl}
                label={getHomeCallToActionLabel(model)}
                logoIdPrefix='wl-footer-cta'
            />
            <SupportSection
                language={model.language}
                supportLinks={model.supportLinks}
            />
            <section class='more-links'>
                <h2 class='support-title'>{LL.web.home.links.title()}</h2>
                <ul class='link-list'>
                    {links.map(link => {
                        return (
                            <li>
                                <a
                                    class={TEXT_LINK_CLASS}
                                    href={link.href}
                                    rel={EXTERNAL_LINK_REL}
                                    target='_blank'
                                >
                                    {link.label}
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </footer>
    );
};

export const HomePage = ({ model }: { model: HomePageModel }) => {
    const LL = getTranslator(model.language);

    return (
        <>
            <LanguageSwitcher
                language={model.language}
                pathFor={buildHomePath}
            />
            <main>
                <HeroTag
                    heading={
                        <span class='hero-name'>{LL.web.home.name()}</span>
                    }
                >
                    <p class='hero-meta'>{LL.web.home.tagline()}</p>
                    <p class='hero-action'>
                        <BotCallToAction
                            botUrl={model.botUrl}
                            label={getHomeCallToActionLabel(model)}
                        />
                    </p>
                    <p class='hero-note'>{LL.web.home.note()}</p>
                </HeroTag>
                <HowItWorks model={model} />
                <Features model={model} />
                <Privacy model={model} />
            </main>
            <HomeFooter model={model} />
        </>
    );
};
