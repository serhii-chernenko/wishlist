import { formatDate } from '../../../bot/content/intl';
import { getTranslator } from '../../../bot/i18n';
import {
    PAYMENTS_MAX_LENGTH,
    truncateWithMark
} from '../../../bot/input/limits';
import { SHAREABLE_WISHES_LIMIT } from '../../../db/repositories/wish-repository';
import { inlineMarkup, trimEdgeWhitespace } from '../inline-markup';
import { buildSharePath } from '../public-id';
import type { SharePageModel } from '../view-model';
import { buildShareAppLink } from '../../../shared/app-links';
import { EXTERNAL_LINK_REL, PageFooter } from './footer';
import { HeroTag } from './hero';
import { InlineContent } from './inline-content';
import { LanguageSwitcher } from './language-switcher';
import { ENVELOPE_LINK_CLASS, TEXT_LINK_CLASS } from './link-classes';
import { WishCard } from './wish-card';

const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

const PaymentsEnvelope = ({
    language,
    payments
}: {
    language: SharePageModel['language'];
    payments: string;
}) => {
    const LL = getTranslator(language);
    const nodes = trimEdgeWhitespace(
        inlineMarkup(truncateWithMark(payments, PAYMENTS_MAX_LENGTH))
    );

    return (
        <section class='envelope'>
            <span class='envelope-flap' aria-hidden='true' />
            <h2 class='envelope-title'>{LL.web.payments.title()}</h2>
            <p class='envelope-text'>
                <InlineContent nodes={nodes} linkClass={ENVELOPE_LINK_CLASS} />
            </p>
        </section>
    );
};

const ShareHero = ({ model }: { model: SharePageModel }) => {
    const LL = getTranslator(model.language);
    const appLink = buildShareAppLink(model.botUrl, model.publicId);
    const showsUsername =
        model.username !== null &&
        TELEGRAM_USERNAME_PATTERN.test(model.username);
    const heading =
        model.displayName === null ? (
            <span class='hero-name'>{LL.web.header.fallback()}</span>
        ) : (
            <>
                <span class='hero-lead'>{LL.web.header.lead()}</span>{' '}
                <span class='hero-name'>{model.displayName}</span>
            </>
        );

    return (
        <HeroTag heading={heading}>
            <p class='hero-meta'>
                {model.lastUpdatedAt
                    ? LL.web.header.summary({
                          count: model.visibleCount,
                          date: formatDate(model.lastUpdatedAt, model.language)
                      })
                    : LL.web.header.count({ count: model.visibleCount })}
            </p>
            {showsUsername && model.username !== null ? (
                <p class='hero-user'>
                    <a
                        class={TEXT_LINK_CLASS}
                        href={`https://t.me/${model.username}`}
                        rel='noopener noreferrer'
                        target='_blank'
                    >
                        {LL.web.header.username({ username: model.username })}
                    </a>
                </p>
            ) : null}
            {model.wishes.length > 0 && appLink !== null ? (
                <p class='hero-action'>
                    <a
                        class='cta cta-text'
                        href={appLink}
                        rel={EXTERNAL_LINK_REL}
                    >
                        {LL.web.footer.openInApp()}
                    </a>
                </p>
            ) : null}
        </HeroTag>
    );
};

export const SharePage = ({ model }: { model: SharePageModel }) => {
    const LL = getTranslator(model.language);

    return (
        <>
            <LanguageSwitcher
                language={model.language}
                pathFor={language => {
                    return buildSharePath(model.publicId, language);
                }}
            />
            <main>
                <ShareHero model={model} />
                {model.payments ? (
                    <PaymentsEnvelope
                        language={model.language}
                        payments={model.payments}
                    />
                ) : null}
                {model.wishes.length === 0 ? (
                    <p class='empty'>{LL.web.empty()}</p>
                ) : (
                    <ul class='wishes'>
                        {model.wishes.map(wish => {
                            return (
                                <WishCard
                                    wish={wish}
                                    language={model.language}
                                    currency={model.currency}
                                />
                            );
                        })}
                    </ul>
                )}
                {model.visibleCount > SHAREABLE_WISHES_LIMIT ? (
                    <p class='notice'>
                        {LL.web.truncated({ limit: SHAREABLE_WISHES_LIMIT })}
                    </p>
                ) : null}
            </main>
            <PageFooter
                language={model.language}
                botUrl={model.botUrl}
                githubUrl={model.githubUrl}
                supportLinks={model.supportLinks}
            />
        </>
    );
};
