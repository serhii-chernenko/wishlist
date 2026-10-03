import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const OnboardingScreen = (_props: ScreenProps<'onboarding'>) => {
    const LL = useLL();
    const title = LL.home.guest.title();

    return (
        <ScreenLayout id='onboarding' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
