import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const LanguageScreen = (_props: ScreenProps<'language'>) => {
    const LL = useLL();
    const title = LL.language.title();

    return (
        <ScreenLayout id='language' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
