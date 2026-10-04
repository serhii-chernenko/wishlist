import type { ScreenProps } from '../nav/routes';
import { useLL } from '../state/context';
import { ScreenLayout } from '../ui/screen';

export const ListImportScreen = (_props: ScreenProps<'listImport'>) => {
    const LL = useLL();

    return (
        <ScreenLayout
            id='listImport'
            title={LL.listImport.title()}
            lead={LL.listImport.hint()}
        />
    );
};
