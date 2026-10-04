import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';

export const LinkImportScreen = (_props: ScreenProps<'linkImport'>) => {
    const LL = useLL();

    return (
        <ScreenLayout
            id='linkImport'
            title={LL.linkImport.title()}
            lead={LL.linkImport.hint()}
        />
    );
};
