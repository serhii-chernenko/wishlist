import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const ShareScreen = (_props: ScreenProps<'share'>) => {
    const LL = useLL();
    const title = LL.share.title();

    return (
        <ScreenLayout id='share' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
