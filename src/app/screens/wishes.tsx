import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const WishesScreen = (_props: ScreenProps<'wishes'>) => {
    const LL = useLL();
    const title = LL.wishes.title();

    return (
        <ScreenLayout id='wishes' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
