import { getTranslator, type AppLocale } from '../../../bot/i18n';
import { formatCurrency, formatDate } from '../../../bot/content/intl';
import { cutDescription, cutTitle } from '../../../bot/input/limits';
import { isRenderableLink } from '../../../bot/input/link';
import { inlineMarkup } from '../inline-markup';
import type { ShareWishView } from '../view-model';
import { InlineContent, OWNER_LINK_REL } from './inline-content';

const WWW_PREFIX = /^www\./;

export const getLinkHostname = (link: string) => {
    try {
        return new URL(link).hostname.replace(WWW_PREFIX, '');
    } catch {
        return null;
    }
};

export const WishCard = ({
    wish,
    language,
    currency
}: {
    wish: ShareWishView;
    language: AppLocale;
    currency: string;
}) => {
    const LL = getTranslator(language);
    const created = formatDate(wish.createdAt, language);
    const updated = formatDate(wish.updatedAt, language);
    const hostname = isRenderableLink(wish.link)
        ? getLinkHostname(wish.link)
        : null;
    const hasChips = wish.priority || wish.price > 0;

    return (
        <li>
            <article
                class={
                    wish.priority
                        ? 'card border-2 border-primary bg-base-100'
                        : 'card card-border bg-base-100'
                }
            >
                <div class='card-body gap-3 p-4 sm:p-6'>
                    <h2 class='card-title text-xl leading-snug'>
                        {cutTitle(wish.title)}
                    </h2>
                    {hasChips ? (
                        <p class='flex flex-wrap gap-2'>
                            {wish.priority ? (
                                <span class='badge badge-primary h-auto py-1'>
                                    <span aria-hidden='true'>♥</span>
                                    {LL.web.wish.priority()}
                                </span>
                            ) : null}
                            {wish.price > 0 ? (
                                <span class='badge badge-outline h-auto py-1'>
                                    {LL.web.wish.price({
                                        price: formatCurrency(
                                            wish.price,
                                            language,
                                            currency
                                        )
                                    })}
                                </span>
                            ) : null}
                        </p>
                    ) : null}
                    {wish.description ? (
                        <p>
                            <InlineContent
                                nodes={inlineMarkup(
                                    cutDescription(wish.description),
                                    {
                                        emphasis: false
                                    }
                                )}
                            />
                        </p>
                    ) : null}
                    {hostname !== null && wish.link !== null ? (
                        <div class='card-actions'>
                            <a
                                class='btn btn-secondary h-auto min-h-10 max-w-full py-2 text-start'
                                href={wish.link}
                                rel={OWNER_LINK_REL}
                                target='_blank'
                            >
                                {LL.web.wish.link({ host: hostname })}
                            </a>
                        </div>
                    ) : null}
                    <p class='text-sm'>
                        {LL.web.wish.created({ date: created })}
                        {created !== updated
                            ? ` · ${LL.web.wish.updated({ date: updated })}`
                            : ''}
                    </p>
                </div>
            </article>
        </li>
    );
};
