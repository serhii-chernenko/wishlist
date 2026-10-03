import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const SettingsScreen = (_props: ScreenProps<'settings'>) => {
    const LL = useLL();
    const title = LL.settings.title();

    return (
        <ScreenLayout id='settings' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
