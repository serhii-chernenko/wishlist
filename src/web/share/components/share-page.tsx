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
import { CURRENT_COLOR_LINK_CLASS } from './link-classes';
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
        <section class='alert alert-info mb-6'>
            <div class='grid gap-2 text-base'>
                <h2 class='text-lg font-bold'>{LL.web.payments.title()}</h2>
                <p>{LL.web.payments.description()}</p>
                <p class='font-medium'>
                    <InlineContent
                        nodes={nodes}
                        linkClass={CURRENT_COLOR_LINK_CLASS}
                    />
                </p>
            </div>
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
        <header class='mb-6'>
            <h1 class='mb-3 text-3xl leading-tight font-extrabold text-balance sm:text-4xl'>
                {heading}
            </h1>
            <ul class='flex flex-wrap gap-2'>
                <li class='badge badge-lg h-auto py-1'>
                    {LL.web.header.count({ count: model.visibleCount })}
                </li>
                {model.lastUpdatedAt ? (
                    <li class='badge badge-lg h-auto py-1'>
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
                            class={`badge badge-lg badge-secondary h-auto py-1 ${CURRENT_COLOR_LINK_CLASS}`}
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
                    <p class='card card-dash bg-base-100 p-8 text-center'>
                        {LL.web.empty()}
                    </p>
                ) : (
                    <ul class='grid gap-4'>
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
                    <p class='alert mt-4 border-base-300 bg-base-100'>
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
