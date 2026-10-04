import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';

export const CurrencyScreen = (_props: ScreenProps<'currency'>) => {
    const LL = useLL();

    return (
        <ScreenLayout
            id='currency'
            title={LL.currency.title()}
            lead={LL.currency.lead()}
        />
    );
};
