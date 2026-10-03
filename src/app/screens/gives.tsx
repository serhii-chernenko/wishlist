import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const GivesScreen = (_props: ScreenProps<'gives'>) => {
    const LL = useLL();
    const title = LL.gives.title();

    return (
        <ScreenLayout id='gives' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
