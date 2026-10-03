import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const ThirdListScreen = (_props: ScreenProps<'thirdList'>) => {
    const LL = useLL();
    const title = LL.third.title();

    return (
        <ScreenLayout id='thirdList' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
