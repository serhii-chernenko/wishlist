import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const DonateScreen = (_props: ScreenProps<'donate'>) => {
    const LL = useLL();
    const title = LL.donate.title();

    return (
        <ScreenLayout id='donate' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
