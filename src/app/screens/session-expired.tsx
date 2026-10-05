import type { AppLocale } from '../../shared/app-api';
import { getSystemTexts } from '../i18n/system-texts';
import { closeApp } from '../telegram/links';
import { SystemNotice } from '../ui/system-notice';

export const SessionExpiredScreen = ({ locale }: { locale: AppLocale }) => {
    return (
        <SystemNotice
            screen='sessionExpired'
            texts={getSystemTexts(locale, 'expired')}
            onAction={closeApp}
        />
    );
};
