import { AtSign, CirclePlay, Code, Crown, Send } from 'lucide';

import type { AppLinkId } from '../../shared/app-api';
import type { ScreenProps } from '../nav/routes';
import { useLL, useSession } from '../state/context';
import { openLink, openTelegramLink } from '../telegram/links';
import type { IconNode } from '../ui/icon';
import { RowList, type RowListItem } from '../ui/row-list';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

const LINK_ICONS: Record<AppLinkId, IconNode> = {
    github: Code,
    princess: Crown,
    youtube: CirclePlay,
    telegram: Send,
    x: AtSign
};

const LINK_ORDER: readonly AppLinkId[] = [
    'github',
    'princess',
    'youtube',
    'telegram',
    'x'
];

const readAppVersion = () => {
    return document.getElementById('root')?.dataset.version ?? '';
};

export const AboutScreen = (_props: ScreenProps<'about'>) => {
    const LL = useLL();
    const { config } = useSession();
    const version = readAppVersion();
    const links = LINK_ORDER.flatMap((id): RowListItem[] => {
        const url = config.links[id];

        if (url === null) {
            return [];
        }

        return [
            {
                id,
                icon: LINK_ICONS[id],
                label: LL.about.links[id](),
                href: url,
                onSelect: () => {
                    if (id === 'telegram') {
                        openTelegramLink(url);
                    } else {
                        openLink(url);
                    }
                }
            }
        ];
    });

    return (
        <ScreenLayout
            id='about'
            title={LL.about.title()}
            lead={LL.about.lead()}
        >
            <Tag class='about-section'>
                <h2 class='panel-title'>{LL.about.privacy.title()}</h2>
                <p>{LL.about.privacy.storage()}</p>
                <p>{LL.about.privacy.phone()}</p>
                <p>{LL.about.privacy.name()}</p>
                <p>{LL.about.privacy.photos()}</p>
            </Tag>
            <Tag class='about-section'>
                <h2 class='panel-title'>{LL.about.openSource.title()}</h2>
                <p>{LL.about.openSource.text()}</p>
            </Tag>
            <Tag class='about-section'>
                <h2 class='panel-title'>{LL.about.languages.title()}</h2>
                <p>{LL.about.languages.text()}</p>
            </Tag>
            {links.length === 0 ? null : (
                <section class='menu-group' aria-labelledby='about-links'>
                    <h2 id='about-links' class='menu-group-title'>
                        {LL.about.links.title()}
                    </h2>
                    <RowList items={links} />
                </section>
            )}
            {version === '' ? null : (
                <p class='about-version'>{LL.about.version({ version })}</p>
            )}
        </ScreenLayout>
    );
};
