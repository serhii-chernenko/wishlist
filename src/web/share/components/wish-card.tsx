import type { Child } from 'hono/jsx';

import { getTranslator, type AppLocale } from '../../../bot/i18n';
import { formatDate } from '../../../bot/content/intl';
import { cutDescription, cutTitle } from '../../../bot/input/limits';
import { isRenderableLink } from '../../../bot/input/link';
import {
    describePrice,
    type Currency,
    type ExchangeRates
} from '../../../shared/money';
import {
    getPhotoLoading,
    type PhotoLoadingAttributes
} from '../../../shared/photo-loading';
import { isBadgePriority } from '../../../shared/priority-badge';
import { inlineMarkup } from '../inline-markup';
import type { ShareWishPhoto, ShareWishView } from '../view-model';
import { InlineContent, OWNER_LINK_REL } from './inline-content';
import { PhotoPlaceholderReference } from './photo-placeholder';
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

const getStageId = (index: number) => {
    return `v${index}`;
};

const PhotoDots = ({ count }: { count: number }) => {
    return (
        <div class='photo-dots' aria-hidden='true'>
            {Array.from({ length: count }, (_, dotIndex) => {
                return (
                    <i
                        class={dotIndex === 0 ? 'photo-dot-active' : undefined}
                    />
                );
            })}
        </div>
    );
};

const WishZoom = ({
    photo,
    stageId,
    loading,
    className
}: {
    photo: ShareWishPhoto;
    stageId: string;
    loading: PhotoLoadingAttributes;
    className?: string;
}) => {
    return (
        <button class={className} popovertarget={stageId}>
            <img src={photo.url} alt={photo.alt} {...loading} />
        </button>
    );
};

const WishStage = ({
    stageId,
    closeLabel,
    children
}: {
    stageId: string;
    closeLabel: string;
    children?: Child;
}) => {
    return (
        <div id={stageId} class='wish-stage' popover='auto'>
            <button
                class='photo-viewer-close'
                popovertarget={stageId}
                popovertargetaction='hide'
                aria-label={closeLabel}
            >
                ×
            </button>
            {children}
        </div>
    );
};

const WishCover = ({
    photos,
    band,
    label,
    closeLabel,
    pendingLabel,
    index
}: {
    photos: readonly ShareWishPhoto[];
    band: string | undefined;
    label: string;
    closeLabel: string;
    pendingLabel: string | null;
    index: number;
}) => {
    const [cover] = photos;

    if (cover === undefined) {
        return (
            <div
                class={
                    pendingLabel === null
                        ? 'wish-photo wish-photo-placeholder'
                        : 'wish-photo wish-photo-placeholder wish-photo-pending'
                }
                data-band={band}
            >
                <PhotoPlaceholderReference />
                {pendingLabel === null ? null : (
                    <span class='sr-only'>{pendingLabel}</span>
                )}
            </div>
        );
    }

    const stageId = getStageId(index);

    if (photos.length === 1) {
        return (
            <div class='wish-photo' data-band={band}>
                <WishStage stageId={stageId} closeLabel={closeLabel}>
                    <WishZoom
                        className='wish-zoom'
                        photo={cover}
                        stageId={stageId}
                        loading={getPhotoLoading(index, 0)}
                    />
                </WishStage>
            </div>
        );
    }

    return (
        <div class='wish-photo' data-band={band}>
            <WishStage stageId={stageId} closeLabel={closeLabel}>
                <div
                    class='carousel wish-carousel'
                    role='group'
                    tabindex={0}
                    aria-label={label}
                >
                    {photos.map((photo, slideIndex) => {
                        return (
                            <WishZoom
                                photo={photo}
                                stageId={stageId}
                                loading={getPhotoLoading(index, slideIndex)}
                            />
                        );
                    })}
                </div>
                <PhotoDots count={photos.length} />
            </WishStage>
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
    const photos = wish.photos ?? NO_PHOTOS;
    const photosLabel = LL.web.wish.photos({ count: photos.length });
    const hostname =
        !gifted && isRenderableLink(wish.link)
            ? getLinkHostname(wish.link)
            : null;

    return (
        <li class={gifted ? 'wish wish-gifted' : 'wish'}>
            <article class='wish-tag'>
                <h2 class='wish-title'>{cutTitle(wish.title)}</h2>
                <WishCover
                    photos={photos}
                    band={gifted ? LL.web.wish.gifted() : undefined}
                    label={photosLabel}
                    closeLabel={LL.web.wish.close()}
                    pendingLabel={
                        wish.photoPending === true
                            ? LL.web.wish.photoLoading()
                            : null
                    }
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
                <details class='wish-details'>
                    <summary>{LL.web.wish.details()}</summary>
                    {!gifted && wish.description ? (
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
