import { HandHeart, Send } from 'lucide';

import type { ScreenProps } from '../nav/routes';
import { useLL, useSession } from '../state/context';
import { haptics } from '../telegram/haptics';
import { openLink, openTelegramLink } from '../telegram/links';
import { RowList, type RowListItem } from '../ui/row-list';
import { ScreenLayout } from '../ui/screen';
import { Tag } from '../ui/tag';

const LEADING_EMOJI = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u;

const splitLeadingEmoji = (title: string) => {
    const emoji = LEADING_EMOJI.exec(title)?.[1];

    return emoji === undefined
        ? { glyph: undefined, label: title }
        : { glyph: emoji, label: title.replace(LEADING_EMOJI, '') };
};

export const DonateScreen = (_props: ScreenProps<'donate'>) => {
    const LL = useLL();
    const { config } = useSession();
    const channel = config.links.telegram;
    const services: RowListItem[] = config.supportLinks.map(link => {
        const { glyph, label } = splitLeadingEmoji(link.title);

        return {
            id: link.id,
            ...(glyph === undefined ? { icon: HandHeart } : { glyph }),
            label,
            href: link.url,
            onSelect: () => {
                haptics.impact('light');
                openLink(link.url);
            }
        };
    });

    return (
        <ScreenLayout
            id='donate'
            title={LL.donate.title()}
            lead={LL.donate.lead()}
        >
            <Tag class='donate-note'>
                <p>{LL.donate.note()}</p>
            </Tag>
            {services.length === 0 ? null : (
                <section class='menu-group' aria-labelledby='donate-services'>
                    <h2 id='donate-services' class='menu-group-title'>
                        {LL.donate.services()}
                    </h2>
                    <RowList items={services} />
                </section>
            )}
            {channel === null ? null : (
                <section class='menu-group'>
                    <RowList
                        label={LL.donate.channel()}
                        items={[
                            {
                                id: 'channel',
                                icon: Send,
                                label: LL.about.links.telegram(),
                                href: channel,
                                onSelect: () => {
                                    openTelegramLink(channel);
                                }
                            }
                        ]}
                    />
                </section>
            )}
            <p class='donate-thanks'>{LL.donate.thanks()}</p>
        </ScreenLayout>
    );
};
