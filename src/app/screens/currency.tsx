import { useState } from 'hono/jsx/dom';

import { CURRENCIES, type Currency } from '../../shared/money';
import type { ScreenProps } from '../nav/routes';
import { useApp, useLL, useSession } from '../state/context';
import { toFailure } from '../state/store';
import { haptics } from '../telegram/haptics';
import { ChoiceCards, type ChoiceOption } from '../ui/choice-cards';
import { ScreenLayout } from '../ui/screen';

const CURRENCY_GLYPHS = {
    UAH: '🇺🇦',
    USD: '🇺🇸',
    EUR: '🇪🇺',
    PLN: '🇵🇱'
} as const satisfies Record<Currency, string>;

export const CurrencyScreen = (_props: ScreenProps<'currency'>) => {
    const LL = useLL();
    const { api, toast, updateMe } = useApp();
    const { me } = useSession();
    const [pending, setPending] = useState<Currency | null>(null);
    const options = CURRENCIES.map((currency): ChoiceOption<Currency> => {
        return {
            value: currency,
            glyph: CURRENCY_GLYPHS[currency],
            title: LL.currency.options[currency].title(),
            hint: LL.currency.options[currency].hint()
        };
    });

    const choose = async (currency: Currency) => {
        if (pending !== null || currency === me.currency) {
            return;
        }

        setPending(currency);

        try {
            updateMe(await api.request('setCurrency', { body: { currency } }));
            haptics.success();
            toast.show(LL.toasts.saved(), 'success');
        } catch (error) {
            toast.failure(toFailure(error));
        }

        setPending(null);
    };

    return (
        <ScreenLayout
            id='currency'
            title={LL.currency.title()}
            lead={LL.currency.lead()}
        >
            <ChoiceCards
                name='currency'
                legend={LL.currency.title()}
                options={options}
                variant='list'
                value={pending ?? me.currency}
                disabled={pending !== null}
                onChange={currency => {
                    void choose(currency);
                }}
            />
        </ScreenLayout>
    );
};
