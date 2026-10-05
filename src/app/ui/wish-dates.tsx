import { describeWishDates } from '../logic/format';
import { useLL, useSession } from '../state/context';

export const WishDates = ({
    createdAt,
    updatedAt,
    className
}: {
    createdAt: string;
    updatedAt: string;
    className: string;
}) => {
    const LL = useLL();
    const { locale } = useSession();
    const { created, updated } = describeWishDates(
        createdAt,
        updatedAt,
        locale
    );

    if (created === '') {
        return null;
    }

    return (
        <p class={className}>
            {LL.editor.createdAt({ date: created })}
            {updated === '' ? null : (
                <>
                    <br />
                    {LL.editor.updatedAt({ date: updated })}
                </>
            )}
        </p>
    );
};
