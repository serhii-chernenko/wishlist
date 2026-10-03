import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

export const WishEditorScreen = ({ route }: ScreenProps<'wishEditor'>) => {
    const LL = useLL();
    const title =
        route.wishId === null ? LL.editor.createTitle() : LL.editor.editTitle();

    return (
        <ScreenLayout id='wishEditor' title={title}>
            <Tag>
                <p class='state-text'>{title}</p>
            </Tag>
        </ScreenLayout>
    );
};
