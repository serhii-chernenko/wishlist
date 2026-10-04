import { getTranslator, type AppLocale } from '../../../bot/i18n';
import { formatDate } from '../../../bot/content/intl';
import { cutDescription, cutTitle } from '../../../bot/input/limits';
import { isRenderableLink } from '../../../bot/input/link';
import {
    describePrice,
    type Currency,
    type ExchangeRates
} from '../../../shared/money';
import { getPhotoLoading } from '../../../shared/photo-loading';
import { isBadgePriority } from '../../../shared/priority-badge';
import { inlineMarkup } from '../inline-markup';
import type { ShareWishPhoto, ShareWishView } from '../view-model';
import { InlineContent, OWNER_LINK_REL } from './inline-content';
import { HeartSticker } from './heart-sticker';
import { PriorityBadge } from './priority-badge';

const WWW_PREFIX = /^www\./;
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
    wishCurrency,
    displayCurrency,
    rates
}: {
    price: number;
    language: AppLocale;
    wishCurrency: Currency;
    displayCurrency: Currency;
    rates: ExchangeRates;
}) => {
    const LL = getTranslator(language);
    const display = describePrice(
        price,
        wishCurrency,
        displayCurrency,
        language,
        rates
    );

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

export const isHighPriorityWish = (wish: Pick<ShareWishView, 'priority'>) => {
    return wish.priority === 'high';
};

const WishCover = ({
    photos,
    band,
    label,
    countLabel,
    index
}: {
    photos: readonly ShareWishPhoto[];
    band: string | undefined;
    label: string;
    countLabel: string;
    index: number;
}) => {
    const [cover] = photos;

    if (cover === undefined) {
        return <div class='wish-photo' data-band={band} />;
    }

    if (photos.length === 1) {
        return (
            <div class='wish-photo' data-band={band}>
                <img
                    src={cover.url}
                    alt={cover.alt}
                    {...getPhotoLoading(index, 0)}
                />
            </div>
        );
    }

    return (
        <div class='wish-photo' data-band={band} data-count={countLabel}>
            <div
                class='carousel wish-carousel'
                role='group'
                tabindex={0}
                aria-label={label}
            >
                {photos.map((photo, slideIndex) => {
                    return (
                        <img
                            src={photo.url}
                            alt={photo.alt}
                            {...getPhotoLoading(index, slideIndex)}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export const WishCard = ({
    wish,
    language,
    displayCurrency,
    rates,
    index
}: {
    wish: ShareWishView;
    index: number;
    language: AppLocale;
    displayCurrency: Currency;
    rates: ExchangeRates;
}) => {
    const LL = getTranslator(language);
    const created = formatDate(wish.createdAt, language);
    const updated = formatDate(wish.updatedAt, language);
    const gifted = wish.gifted === true;
    const hostname =
        !gifted && isRenderableLink(wish.link)
            ? getLinkHostname(wish.link)
            : null;
    const wanted = wish.priority === 'high' && !gifted;

    return (
        <li class={gifted ? 'wish wish-gifted' : 'wish'}>
            {wanted ? <HeartSticker /> : null}
            <article class='wish-tag'>
                <h2 class='wish-title'>{cutTitle(wish.title)}</h2>
                <WishCover
                    photos={wish.photos ?? NO_PHOTOS}
                    band={gifted ? LL.web.wish.gifted() : undefined}
                    label={LL.web.wish.photos({
                        count: wish.photos?.length ?? 0
                    })}
                    countLabel={LL.web.wish.photoCount({
                        count: wish.photos?.length ?? 0
                    })}
                    index={index}
                />
                {!gifted && isBadgePriority(wish.priority) ? (
                    <PriorityBadge
                        priority={wish.priority}
                        label={LL.web.wish.priority[wish.priority]()}
                    />
                ) : null}
                {wish.price > 0 ? (
                    <WishPrice
                        price={wish.price}
                        language={language}
                        wishCurrency={wish.currency}
                        displayCurrency={displayCurrency}
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
                {gifted ? null : (
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
                )}
            </article>
        </li>
    );
};
