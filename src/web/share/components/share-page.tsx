import { formatDate } from '../../../bot/content/intl';
import { getTranslator } from '../../../bot/i18n';
import {
    PAYMENTS_MAX_LENGTH,
    truncateWithMark
} from '../../../bot/input/limits';
import { SHAREABLE_WISHES_LIMIT } from '../../../db/repositories/wish-repository';
import { inlineMarkup, trimEdgeWhitespace } from '../inline-markup';
import type { SharePageModel } from '../view-model';
import { PageFooter } from './footer';
import { InlineContent } from './inline-content';
import { LanguageSwitcher } from './language-switcher';
import { WishCard } from './wish-card';

const TELEGRAM_USERNAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

const PaymentsCallout = ({
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
        <section class='callout'>
            <h2>{LL.web.payments.title()}</h2>
            <p class='hint'>{LL.web.payments.description()}</p>
            <p>
                <InlineContent nodes={nodes} />
            </p>
        </section>
    );
};

const PageHero = ({ model }: { model: SharePageModel }) => {
    const LL = getTranslator(model.language);
    const heading =
        model.displayName === null
            ? LL.title()
            : LL.share.title({ name: model.displayName });
    const showsUsername =
        model.username !== null &&
        TELEGRAM_USERNAME_PATTERN.test(model.username);

    return (
        <header class='hero'>
            <h1>{heading}</h1>
            <ul class='facts'>
                <li>{LL.web.header.count({ count: model.visibleCount })}</li>
                {model.lastUpdatedAt ? (
                    <li>
                        {LL.web.header.updated({
                            date: formatDate(
                                model.lastUpdatedAt,
                                model.language
                            )
                        })}
                    </li>
                ) : null}
                {showsUsername && model.username !== null ? (
                    <li>
                        <a
                            href={`https://t.me/${model.username}`}
                            rel='noopener noreferrer'
                            target='_blank'
                        >
                            {LL.web.header.username({
                                username: model.username
                            })}
                        </a>
                    </li>
                ) : null}
            </ul>
        </header>
    );
};

export const SharePage = ({ model }: { model: SharePageModel }) => {
    const LL = getTranslator(model.language);

    return (
        <>
            <LanguageSwitcher
                language={model.language}
                publicId={model.publicId}
            />
            <main>
                <PageHero model={model} />
                {model.payments ? (
                    <PaymentsCallout
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
