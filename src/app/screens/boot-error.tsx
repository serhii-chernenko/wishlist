import type { AppLocale } from '../../shared/app-api';
import { getSystemTexts } from '../i18n/system-texts';
import { SystemNotice } from '../ui/system-notice';

export const BootErrorScreen = ({
    locale,
    onRetry
}: {
    locale: AppLocale;
    onRetry: () => void;
}) => {
    return (
        <SystemNotice
            screen='bootError'
            texts={getSystemTexts(locale, 'bootError')}
            onAction={onRetry}
        />
    );
};
