import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';

export const DeliveryScreen = (_props: ScreenProps<'delivery'>) => {
    const LL = useLL();

    return (
        <ScreenLayout
            id='delivery'
            title={LL.delivery.title()}
            lead={LL.delivery.lead()}
        />
    );
};
