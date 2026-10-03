import { formatPrice } from '../logic/format';
import { useLL, useSession } from '../state/context';

export const PriceChip = ({
    price,
    currency
}: {
    price: number;
    currency: string | null;
}) => {
    const { locale } = useSession();
    const LL = useLL();

    if (price <= 0) {
        return null;
    }

    return (
        <p class='price'>
            <span class='sr-only'>{LL.editor.price.label()} </span>
            {formatPrice(price, locale, currency)}
        </p>
    );
};
