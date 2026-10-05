import type { AppLocale } from '../../shared/app-api';
import { getSystemTexts } from '../i18n/system-texts';
import { openTelegramLink } from '../telegram/links';
import { isNativeShell } from '../telegram/sdk';
import { SystemNotice } from '../ui/system-notice';

export type UnavailableKind = 'previewOnly' | 'unsupported';

/** The 403 preview gate and clients older than Bot API 6.9 point the user back to the chat bot. */
export const UnavailableScreen = ({
    locale,
    botUrl,
    kind
}: {
    locale: AppLocale;
    botUrl: string;
    kind: UnavailableKind;
}) => {
    return (
        <SystemNotice
            screen={kind}
            texts={getSystemTexts(locale, kind)}
            href={botUrl}
            {...(isNativeShell() && {
                onAction: () => {
                    openTelegramLink(botUrl);
                }
            })}
        />
    );
};
