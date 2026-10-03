import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const AboutScreen = (_props: ScreenProps<'about'>) => {
    const LL = useLL();
    const title = LL.about.title();

    return (
        <ScreenLayout id='about' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
