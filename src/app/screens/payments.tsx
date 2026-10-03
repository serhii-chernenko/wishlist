import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const PaymentsScreen = (_props: ScreenProps<'payments'>) => {
    const LL = useLL();
    const title = LL.payments.title();

    return (
        <ScreenLayout id='payments' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
