import type { Child } from 'hono/jsx';

import type { ApiImage, WishPriority } from '../../shared/app-api';
import type { Currency } from '../../shared/money';
import { isBadgePriority } from '../../shared/priority-badge';
import { getLinkHost } from '../logic/format';
import { useLL } from '../state/context';
import { openLink } from '../telegram/links';
import { HeartSticker } from './heart';
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
    onOpen?: () => void;
    badges?: Child;
    actions?: Child;
}

const WishCover = ({
    images,
    title,
    band
}: {
    images: readonly ApiImage[];
    title: string;
    band: string | undefined;
}) => {
    const LL = useLL();
    const [cover] = images;

    if (cover === undefined) {
        return <div class='wish-photo' data-band={band} />;
    }

    const morePhotos = images.length - 1;

    return (
        <div class='wish-photo' data-band={band}>
            <PhotoFrame
                src={cover.url}
                alt={LL.a11y.photo({ index: 1, total: images.length, title })}
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
export const WishTag = ({ wish, onOpen, badges, actions }: WishTagProps) => {
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
