import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const VisibilityScreen = (_props: ScreenProps<'visibility'>) => {
    const LL = useLL();
    const title = LL.visibility.title();

    return (
        <ScreenLayout id='visibility' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
