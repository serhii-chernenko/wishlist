import { getTranslator, type AppLocale } from '../../../bot/i18n';
import {
    DEFAULT_CURRENCY,
    formatDate,
    getLocaleTag
} from '../../../bot/content/intl';
import { cutDescription, cutTitle } from '../../../bot/input/limits';
import { isRenderableLink } from '../../../bot/input/link';
import { inlineMarkup } from '../inline-markup';
import type { ShareWishView } from '../view-model';
import { HERO_LOGO_ID_PREFIX } from './hero';
import { InlineContent, OWNER_LINK_REL } from './inline-content';
import { heartSymbolId } from './logo';

const WWW_PREFIX = /^www\./;
const HEART_HREF = `#${heartSymbolId(HERO_LOGO_ID_PREFIX)}`;
const STICKER_VIEW_BOX = '-125 -124 250 206';

export const getLinkHostname = (link: string) => {
    try {
        return new URL(link).hostname.replace(WWW_PREFIX, '');
    } catch {
        return null;
    }
};

const formatPrice = (price: number, language: AppLocale, currency: string) => {
    return new Intl.NumberFormat(getLocaleTag(language), {
        style: 'currency',
        currency: currency || DEFAULT_CURRENCY,
        currencyDisplay: 'narrowSymbol',
        ...(Number.isInteger(price) && { maximumFractionDigits: 0 })
    }).format(price);
};

const HeartSticker = () => {
    return (
        <svg class='wish-heart' viewBox={STICKER_VIEW_BOX} aria-hidden='true'>
            <use href={HEART_HREF} class='heart-halo' />
            <use href={HEART_HREF} class='heart-fill' />
        </svg>
    );
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

    return (
        <li class={wish.priority ? 'wish wish-priority' : 'wish'}>
            {wish.priority ? <HeartSticker /> : null}
            <article class='wish-tag'>
                <div class='wish-body'>
                    <h2 class='wish-title'>{cutTitle(wish.title)}</h2>
                    {wish.priority ? (
                        <p class='sr-only'>{LL.web.wish.priority()}</p>
                    ) : null}
                    {wish.price > 0 ? (
                        <p class='price'>
                            <span class='sr-only'>{LL.web.wish.price()} </span>
                            {formatPrice(wish.price, language, currency)}
                        </p>
                    ) : null}
                    {wish.description ? (
                        <p class='wish-text'>
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
                            class='wish-link'
                            href={wish.link}
                            rel={OWNER_LINK_REL}
                            target='_blank'
                        >
                            {LL.web.wish.link({ host: hostname })}
                        </a>
                    ) : null}
                    <p class='wish-dates'>
                        {created === updated
                            ? LL.web.wish.created({ date: created })
                            : LL.web.wish.updated({ created, updated })}
                    </p>
                </div>
            </article>
        </li>
    );
};
