import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const FeedbackScreen = (_props: ScreenProps<'feedback'>) => {
    const LL = useLL();
    const title = LL.feedback.title();

    return (
        <ScreenLayout id='feedback' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
