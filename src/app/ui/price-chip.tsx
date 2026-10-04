import { describePrice, type Currency } from '../../shared/money';
import { useLL, useSession } from '../state/context';

export const PriceChip = ({
    price,
    currency
}: {
    price: number;
    currency: Currency;
}) => {
    const { locale, config, me } = useSession();
    const LL = useLL();

    if (price <= 0) {
        return null;
    }

    const display = describePrice(
        price,
        currency,
        me.currency,
        locale,
        config.rates
    );

    if (display.kind === 'exact') {
        return (
            <p class='price'>
                <span class='sr-only'>{LL.editor.price.label()} </span>
                {display.amount}
            </p>
        );
    }

    return (
        <p class='price' title={display.original}>
            <span class='sr-only'>{LL.editor.price.label()} </span>
            {LL.money.approx({ amount: display.amount })}
            <span class='sr-only'>
                {' '}
                {LL.money.original({ amount: display.original })}
            </span>
        </p>
    );
};
