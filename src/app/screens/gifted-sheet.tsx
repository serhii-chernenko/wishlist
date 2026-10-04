import type { OwnWishDto } from '../../shared/app-api';
import { formatIsoDate } from '../logic/format';
import { useLL, useSession } from '../state/context';
import { ActionSheet } from '../ui/action-sheet';

const HIDE_HINT_ID = 'gifted-hide-hint';

export interface GiftedSheetProps {
    wish: OwnWishDto;
    onClose: () => void;
    onRestore: (wish: OwnWishDto) => void;
    onHide: (wish: OwnWishDto) => void;
}

export const GiftedSheet = ({
    wish,
    onClose,
    onRestore,
    onHide
}: GiftedSheetProps) => {
    const LL = useLL();
    const { locale } = useSession();
    const giftedOn = formatIsoDate(wish.updatedAt, locale);

    return (
        <ActionSheet
            title={wish.title}
            {...(giftedOn !== '' && {
                subtitle: LL.gifted.date({ date: giftedOn })
            })}
            closeLabel={LL.common.close()}
            onClose={onClose}
        >
            <div class='action-sheet-actions'>
                <button
                    type='button'
                    class='btn btn-primary'
                    onClick={() => {
                        onRestore(wish);
                    }}
                >
                    {LL.gifted.restore()}
                </button>
                <div class='action-sheet-option'>
                    <button
                        type='button'
                        class='btn action-sheet-danger'
                        aria-describedby={HIDE_HINT_ID}
                        onClick={() => {
                            onHide(wish);
                        }}
                    >
                        {LL.gifted.hide()}
                    </button>
                    <p id={HIDE_HINT_ID} class='field-hint'>
                        {LL.gifted.hideHint()}
                    </p>
                </div>
            </div>
        </ActionSheet>
    );
};
