import { getTranslator, type AppLocale } from '../../../bot/i18n';
import { formatDate } from '../../../bot/content/intl';
import { cutDescription, cutTitle } from '../../../bot/input/limits';
import { isRenderableLink } from '../../../bot/input/link';
import { describePrice, type ExchangeRates } from '../../../shared/money';
import { inlineMarkup } from '../inline-markup';
import type { ShareWishPhoto, ShareWishView } from '../view-model';
import { HERO_LOGO_ID_PREFIX } from './hero';
import { InlineContent, OWNER_LINK_REL } from './inline-content';
import { heartSymbolId } from './logo';

const WWW_PREFIX = /^www\./;
const HEART_HREF = `#${heartSymbolId(HERO_LOGO_ID_PREFIX)}`;
const STICKER_VIEW_BOX = '-125 -124 250 206';
const NO_PHOTOS: readonly ShareWishPhoto[] = [];

export const getLinkHostname = (link: string) => {
    try {
        return new URL(link).hostname.replace(WWW_PREFIX, '');
    } catch {
        return null;
    }
};

const WishPrice = ({
    price,
    language,
    currency,
    rates
}: {
    price: number;
    language: AppLocale;
    currency: string;
    rates: ExchangeRates;
}) => {
    const LL = getTranslator(language);
    const display = describePrice(price, currency, language, rates);

    if (display.kind === 'exact') {
        return (
            <p class='price'>
                <span class='sr-only'>{LL.web.wish.price()} </span>
                {display.amount}
            </p>
        );
    }

    return (
        <p class='price' title={display.original}>
            <span class='sr-only'>{LL.web.wish.price()} </span>
            {LL.web.wish.approx({ amount: display.amount })}
            <span class='sr-only'>
                {' '}
                {LL.web.wish.original({ amount: display.original })}
            </span>
        </p>
    );
};

const HeartSticker = () => {
    return (
        <svg class='wish-heart' viewBox={STICKER_VIEW_BOX} aria-hidden='true'>
            <use href={HEART_HREF} class='heart-halo' />
            <use href={HEART_HREF} class='heart-fill' />
        </svg>
    );
};

const WishCover = ({ photos }: { photos: readonly ShareWishPhoto[] }) => {
    const [cover] = photos;

    if (cover === undefined) {
        return <div class='wish-photo' />;
    }

    const morePhotos = photos.length - 1;

    return (
        <div class='wish-photo'>
            <img src={cover.url} alt={cover.alt} loading='lazy' />
            {morePhotos > 0 ? (
                <span class='wish-photo-count' aria-hidden='true'>
                    +{morePhotos}
                </span>
            ) : null}
        </div>
    );
};

export const WishCard = ({
    wish,
    language,
    currency,
    rates
}: {
    wish: ShareWishView;
    language: AppLocale;
    currency: string;
    rates: ExchangeRates;
}) => {
    const LL = getTranslator(language);
    const created = formatDate(wish.createdAt, language);
    const updated = formatDate(wish.updatedAt, language);
    const hostname = isRenderableLink(wish.link)
        ? getLinkHostname(wish.link)
        : null;

    return (
        <li class='wish'>
            {wish.priority ? <HeartSticker /> : null}
            <article class='wish-tag'>
                <h2 class='wish-title'>{cutTitle(wish.title)}</h2>
                <WishCover photos={wish.photos ?? NO_PHOTOS} />
                {wish.priority ? (
                    <p class='sr-only'>{LL.web.wish.priority()}</p>
                ) : null}
                {wish.price > 0 ? (
                    <WishPrice
                        price={wish.price}
                        language={language}
                        currency={currency}
                        rates={rates}
                    />
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
                <details class='wish-details'>
                    <summary>{LL.web.wish.details()}</summary>
                    {wish.description ? (
                        <p class='wish-text'>
                            <InlineContent
                                nodes={inlineMarkup(
                                    cutDescription(wish.description),
                                    { emphasis: false }
                                )}
                            />
                        </p>
                    ) : null}
                    <p class='wish-dates'>
                        {created === updated
                            ? LL.web.wish.created({ date: created })
                            : LL.web.wish.updated({ created, updated })}
                    </p>
                </details>
            </article>
        </li>
    );
};
