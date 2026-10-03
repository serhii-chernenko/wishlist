import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const ReleasesScreen = (_props: ScreenProps<'releases'>) => {
    const LL = useLL();
    const title = LL.releases.title();

    return (
        <ScreenLayout id='releases' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
