import type { AppLocale } from '../../shared/app-api';
import { buildMainAppLink } from '../../shared/app-links';
import { getSystemTexts } from '../i18n/system-texts';
import { SystemNotice } from '../ui/system-notice';

export const OutsideTelegramScreen = ({
    locale,
    botUrl
}: {
    locale: AppLocale;
    botUrl: string;
}) => {
    return (
        <SystemNotice
            screen='outsideTelegram'
            texts={getSystemTexts(locale, 'outside')}
            href={buildMainAppLink(botUrl)}
        />
    );
};
