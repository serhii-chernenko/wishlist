import type { Child } from 'hono/jsx';

import type { ApiImage, WishPriority } from '../../shared/app-api';
import type { Currency } from '../../shared/money';
import { isBadgePriority } from '../../shared/priority-badge';
import { EAGER_CARD_COUNT, getPhotoLoading } from '../../shared/photo-loading';
import { getLinkHost } from '../logic/format';
import { useLL } from '../state/context';
import { openLink } from '../telegram/links';
import { PhotoCarousel } from './photo-carousel';
import { PhotoFrame } from './photo-frame';
import { PhotoPlaceholder } from './photo-placeholder';
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
    photoPending?: boolean;
}

export interface WishTagProps {
    wish: WishTagModel;
    index?: number;
    onOpen?: () => void;
    badges?: Child;
    actions?: Child;
}

const PendingPhotoNote = () => {
    const LL = useLL();

    return <span class='sr-only'>{LL.a11y.photoLoading()}</span>;
};

export const WishCover = ({
    images,
    title,
    band,
    index,
    pending,
    onOpen
}: {
    images: readonly ApiImage[];
    title: string;
    band: string | undefined;
    index: number;
    pending: boolean;
    onOpen: (() => void) | undefined;
}) => {
    const LL = useLL();
    const [cover] = images;

    if (cover === undefined) {
        return (
            <div
                class={
                    pending
                        ? 'wish-photo wish-photo-placeholder wish-photo-pending'
                        : 'wish-photo wish-photo-placeholder'
                }
                data-band={band}
            >
                <PhotoPlaceholder />
                {pending ? <PendingPhotoNote /> : null}
            </div>
        );
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

export const WishLink = ({
    wish
}: {
    wish: Pick<WishTagModel, 'link' | 'linkHost'>;
}) => {
    const LL = useLL();
    const host = wish.linkHost ?? getLinkHost(wish.link);

    if (wish.link === null || host === null) {
        return null;
    }

    const { link } = wish;

    return (
        <a
            class='wish-link'
            href={link}
            rel='noopener noreferrer nofollow'
            target='_blank'
            onClick={(event: MouseEvent) => {
                event.preventDefault();
                openLink(link);
            }}
        >
            {LL.third.openLink({ host })}
        </a>
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
    const gifted = wish.gifted === true;

    return (
        <li
            class={gifted ? 'wish wish-gifted' : 'wish'}
            data-wish-id={String(wish.id)}
        >
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
                    pending={wish.photoPending === true}
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
                <WishLink wish={wish} />
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
        <div class='wish-grid-frame'>
            <ul class='wish-grid' aria-label={label}>
                {children}
            </ul>
        </div>
    );
};
