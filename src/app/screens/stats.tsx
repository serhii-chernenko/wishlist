import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const StatsScreen = (_props: ScreenProps<'stats'>) => {
    const LL = useLL();
    const title = LL.stats.title();

    return (
        <ScreenLayout id='stats' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
