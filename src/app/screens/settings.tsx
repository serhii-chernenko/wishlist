import { Eye, Info, Languages, Wallet } from 'lucide';

import type { ScreenProps } from '../nav/routes';
import { useLL, useNav, useSession } from '../state/context';
import { haptics } from '../telegram/haptics';
import { RowList, type RowListItem } from '../ui/row-list';
import { ScreenLayout } from '../ui/screen';

const SettingsGroup = ({
    id,
    title,
    items
}: {
    id: string;
    title: string;
    items: readonly RowListItem[];
}) => {
    return (
        <section class='menu-group' aria-labelledby={id}>
            <h2 id={id} class='menu-group-title'>
                {title}
            </h2>
            <RowList items={items} />
        </section>
    );
};

export const SettingsScreen = (_props: ScreenProps<'settings'>) => {
    const LL = useLL();
    const nav = useNav();
    const { me, locale } = useSession();
    const languageName = LL.language.native[locale]();
    const open = (route: Parameters<typeof nav.push>[0]) => {
        haptics.selection();
        nav.push(route);
    };
    const profileItems: RowListItem[] = [
        {
            id: 'visibility',
            icon: Eye,
            label: LL.settings.visibility(),
            value:
                me.visibility === null
                    ? LL.settings.visibilityNone()
                    : LL.visibility.values[me.visibility](),
            onSelect: () => {
                open({ screen: 'visibility' });
            }
        },
        ...(me.registered
            ? [
                  {
                      id: 'payments',
                      icon: Wallet,
                      label: LL.settings.payments(),
                      value:
                          me.payments === null
                              ? LL.settings.paymentsEmpty()
                              : LL.settings.paymentsSet(),
                      onSelect: () => {
                          open({ screen: 'payments' });
                      }
                  }
              ]
            : [])
    ];
    const appItems: RowListItem[] = [
        {
            id: 'language',
            icon: Languages,
            label: LL.settings.language(),
            value:
                me.languageChoice === 'auto'
                    ? LL.settings.languageAuto({ language: languageName })
                    : languageName,
            onSelect: () => {
                open({ screen: 'language' });
            }
        },
        {
            id: 'about',
            icon: Info,
            label: LL.nav.about(),
            onSelect: () => {
                open({ screen: 'about' });
            }
        }
    ];

    return (
        <ScreenLayout id='settings' title={LL.settings.title()}>
            <SettingsGroup
                id='settings-profile'
                title={LL.settings.groups.profile()}
                items={profileItems}
            />
            <SettingsGroup
                id='settings-app'
                title={LL.settings.groups.app()}
                items={appItems}
            />
        </ScreenLayout>
    );
};
