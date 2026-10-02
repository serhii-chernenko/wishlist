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
            <article class={wish.priority ? 'wish is-priority' : 'wish'}>
                <h2>{cutTitle(wish.title)}</h2>
                {hasChips ? (
                    <p class='chips'>
                        {wish.priority ? (
                            <span class='chip priority'>
                                {LL.web.wish.priority()}
                            </span>
                        ) : null}
                        {wish.price > 0 ? (
                            <span class='chip'>
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
                    <p class='description'>
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
                    <a
                        class='button'
                        href={wish.link}
                        rel={OWNER_LINK_REL}
                        target='_blank'
                    >
                        {LL.web.wish.link({ host: hostname })}
                    </a>
                ) : null}
                <p class='dates'>
                    {LL.web.wish.created({ date: created })}
                    {created !== updated
                        ? ` · ${LL.web.wish.updated({ date: updated })}`
                        : ''}
                </p>
            </article>
        </li>
    );
};
