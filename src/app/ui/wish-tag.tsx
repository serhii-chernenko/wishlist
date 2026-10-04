import type { Child } from 'hono/jsx';

import type { ApiImage, WishPriority } from '../../shared/app-api';
import type { Currency } from '../../shared/money';
import { isBadgePriority } from '../../shared/priority-badge';
import { EAGER_CARD_COUNT, getPhotoLoading } from '../../shared/photo-loading';
import { getLinkHost } from '../logic/format';
import { useLL } from '../state/context';
import { openLink } from '../telegram/links';
import { HeartSticker } from './heart';
import { PhotoCarousel } from './photo-carousel';
import { PhotoFrame } from './photo-frame';
import { PriceChip } from './price-chip';
import { PriorityBadge } from './priority-badge';

export interface WishTagModel {
    id: number;
    title: string;
    price: number;
    currency: Currency;
    priority: WishPriority;
    images: readonly ApiImage[];
    link: string | null;
    linkHost: string | null;
    hidden?: boolean;
    gifted?: boolean;
}

export interface WishTagProps {
    wish: WishTagModel;
    index?: number;
    onOpen?: () => void;
    badges?: Child;
    actions?: Child;
}

const WishCover = ({
    images,
    title,
    band,
    index,
    onOpen
}: {
    images: readonly ApiImage[];
    title: string;
    band: string | undefined;
    index: number;
    onOpen: (() => void) | undefined;
}) => {
    const LL = useLL();
    const [cover] = images;

    if (cover === undefined) {
        return <div class='wish-photo' data-band={band} />;
    }

    const describeSlide = (slideIndex: number) => {
        return LL.a11y.photo({
            index: slideIndex + 1,
            total: images.length,
            title
        });
    };

    return (
        <div class='wish-photo' data-band={band}>
            {images.length > 1 ? (
                <PhotoCarousel
                    images={images}
                    label={LL.a11y.photos({ count: images.length })}
                    describeSlide={describeSlide}
                    cardIndex={index}
                    {...(onOpen !== undefined && { onOpen })}
                />
            ) : (
                <PhotoFrame
                    src={cover.url}
                    alt={describeSlide(0)}
                    loading={getPhotoLoading(index, 0)}
                />
            )}
        </div>
    );
};

/** The compact gift-tag card shared with the share page markup (`.wish` / `.wish-tag`). */
export const WishTag = ({
    wish,
    index = EAGER_CARD_COUNT,
    onOpen,
    badges,
    actions
}: WishTagProps) => {
    const LL = useLL();
    const host = wish.linkHost ?? getLinkHost(wish.link);
    const gifted = wish.gifted === true;
    const wanted = wish.priority === 'high' && !gifted;

    return (
        <li
            class={gifted ? 'wish wish-gifted' : 'wish'}
            data-wish-id={String(wish.id)}
        >
            {wanted ? <HeartSticker /> : null}
            <article class='wish-tag'>
                <h2 class='wish-title'>
                    {onOpen === undefined ? (
                        wish.title
                    ) : (
                        <button
                            type='button'
                            class='wish-open'
                            onClick={onOpen}
                        >
                            {wish.title}
                        </button>
                    )}
                </h2>
                <WishCover
                    images={wish.images}
                    title={wish.title}
                    band={gifted ? LL.gifted.band() : undefined}
                    index={index}
                    onOpen={onOpen}
                />
                {!gifted && isBadgePriority(wish.priority) ? (
                    <PriorityBadge priority={wish.priority} />
                ) : null}
                {wish.hidden && !gifted ? (
                    <p class='wish-badge'>{LL.wishes.hiddenBadge()}</p>
                ) : null}
                {badges}
                <PriceChip price={wish.price} currency={wish.currency} />
                {wish.link !== null && host !== null ? (
                    <a
                        class='wish-link'
                        href={wish.link}
                        rel='noopener noreferrer nofollow'
                        target='_blank'
                        onClick={(event: MouseEvent) => {
                            event.preventDefault();
                            openLink(wish.link ?? '');
                        }}
                    >
                        {LL.third.openLink({ host })}
                    </a>
                ) : null}
                {actions === undefined ? null : (
                    <div class='wish-actions'>{actions}</div>
                )}
            </article>
        </li>
    );
};

export const WishGrid = ({
    children,
    label
}: {
    children?: Child;
    label?: string;
}) => {
    return (
        <ul class='wish-grid' aria-label={label}>
            {children}
        </ul>
    );
};
