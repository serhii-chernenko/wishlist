import { Coins, Download, Eye, Info, Languages, Truck, Wallet } from 'lucide';

import type { ScreenProps } from '../nav/routes';
import { useLL, useNav, useSession } from '../state/context';
import { haptics } from '../telegram/haptics';
import {
    THEME_PREFERENCES,
    type ThemePreference
} from '../logic/theme-preference';
import { useStore } from '../state/store';
import { setThemePreference, themePreference } from '../telegram/theme';
import { ChoiceCards, type ChoiceOption } from '../ui/choice-cards';
import { RowList, type RowListItem } from '../ui/row-list';
import { THEME_ICONS } from '../ui/theme-toggle';
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

const ThemeSettings = () => {
    const LL = useLL();
    const preference = useStore(themePreference);
    const texts = LL.settings.theme;
    const options: ChoiceOption<ThemePreference>[] = THEME_PREFERENCES.map(
        value => {
            return {
                value,
                title: texts[value](),
                icon: THEME_ICONS[value],
                ...(value === 'system' && { hint: texts.systemHint() })
            };
        }
    );

    return (
        <section class='menu-group' aria-labelledby='settings-theme'>
            <h2 id='settings-theme' class='menu-group-title'>
                {texts.title()}
            </h2>
            <ChoiceCards
                name='theme'
                legend={texts.title()}
                options={options}
                value={preference}
                variant='list'
                onChange={setThemePreference}
            />
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
                  },
                  {
                      id: 'currency',
                      icon: Coins,
                      label: LL.settings.currency(),
                      value: me.currency,
                      onSelect: () => {
                          open({ screen: 'currency' });
                      }
                  },
                  {
                      id: 'delivery',
                      icon: Truck,
                      label: LL.settings.delivery(),
                      value:
                          me.deliveryAddress === null
                              ? LL.settings.deliveryEmpty()
                              : LL.settings.deliverySet(),
                      onSelect: () => {
                          open({ screen: 'delivery' });
                      }
                  },
                  {
                      id: 'listImport',
                      icon: Download,
                      label: LL.settings.listImport(),
                      onSelect: () => {
                          open({ screen: 'listImport' });
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
            <ThemeSettings />
        </ScreenLayout>
    );
};
