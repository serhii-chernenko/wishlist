import type { Child } from 'hono/jsx';

import type { SharedWishDto } from '../../shared/app-api';
import { isBadgePriority } from '../../shared/priority-badge';
import { useLL } from '../state/context';
import { ActionSheet } from '../ui/action-sheet';
import { PriceChip } from '../ui/price-chip';
import { PriorityBadge } from '../ui/priority-badge';
import { WishCover, WishLink } from '../ui/wish-tag';
import { WishDates } from '../ui/wish-dates';

const FIRST_CARD_INDEX = 0;

export interface WishDetailsSheetProps {
    wish: SharedWishDto;
    onClose: () => void;
    action?: Child;
}

export const WishDetailsSheet = ({
    wish,
    onClose,
    action
}: WishDetailsSheetProps) => {
    const LL = useLL();
    const gifted = wish.gifted === true;

    return (
        <ActionSheet
            title={wish.title}
            closeLabel={LL.common.close()}
            scrollable
            onClose={onClose}
        >
            <div class='wish-sheet'>
                <WishCover
                    images={wish.images}
                    title={wish.title}
                    band={gifted ? LL.gifted.band() : undefined}
                    index={FIRST_CARD_INDEX}
                    pending={wish.photoPending === true}
                />
                {!gifted && isBadgePriority(wish.priority) ? (
                    <PriorityBadge priority={wish.priority} />
                ) : null}
                <PriceChip price={wish.price} currency={wish.currency} />
                {wish.description === null ? null : (
                    <p class='wish-sheet-description'>{wish.description}</p>
                )}
                <WishDates
                    createdAt={wish.createdAt}
                    updatedAt={wish.updatedAt}
                    className='wish-sheet-dates'
                />
                <WishLink wish={wish} />
                {action === undefined ? null : (
                    <div class='action-sheet-actions'>{action}</div>
                )}
            </div>
        </ActionSheet>
    );
};
