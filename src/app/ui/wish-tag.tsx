import type { Child } from 'hono/jsx';

import type { ApiImage } from '../../shared/app-api';
import { getLinkHost } from '../logic/format';
import { useLL } from '../state/context';
import { openLink } from '../telegram/links';
import { HeartSticker } from './heart';
import { PriceChip } from './price-chip';

export interface WishTagModel {
    id: number;
    title: string;
    price: number;
    priority: boolean;
    images: readonly ApiImage[];
    link: string | null;
    linkHost: string | null;
    hidden?: boolean;
}

export interface WishTagProps {
    wish: WishTagModel;
    currency: string | null;
    owner?: 'self' | 'other';
    onOpen?: () => void;
    badges?: Child;
    actions?: Child;
}

const WishCover = ({
    images,
    title
}: {
    images: readonly ApiImage[];
    title: string;
}) => {
    const LL = useLL();
    const [cover] = images;

    if (cover === undefined) {
        return <div class='wish-photo' />;
    }

    const morePhotos = images.length - 1;

    return (
        <div class='wish-photo'>
            <img
                src={cover.url}
                alt={LL.a11y.photo({ index: 1, total: images.length, title })}
                loading='lazy'
                decoding='async'
            />
            {morePhotos > 0 ? (
                <span class='wish-photo-count' aria-hidden='true'>
                    +{morePhotos}
                </span>
            ) : null}
        </div>
    );
};

/** The compact gift-tag card shared with the share page markup (`.wish` / `.wish-tag`). */
export const WishTag = ({
    wish,
    currency,
    owner = 'self',
    onOpen,
    badges,
    actions
}: WishTagProps) => {
    const LL = useLL();
    const host = wish.linkHost ?? getLinkHost(wish.link);

    return (
        <li class='wish' data-wish-id={String(wish.id)}>
            {wish.priority ? <HeartSticker /> : null}
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
                <WishCover images={wish.images} title={wish.title} />
                {wish.priority ? (
                    <p class='sr-only'>
                        {owner === 'self'
                            ? LL.a11y.priority()
                            : LL.a11y.priorityThird()}
                    </p>
                ) : null}
                {wish.hidden ? (
                    <p class='wish-badge'>{LL.wishes.hiddenBadge()}</p>
                ) : null}
                {badges}
                <PriceChip price={wish.price} currency={currency} />
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
