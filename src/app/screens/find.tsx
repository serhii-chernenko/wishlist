import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const FindScreen = (_props: ScreenProps<'find'>) => {
    const LL = useLL();
    const title = LL.find.title();

    return (
        <ScreenLayout id='find' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
