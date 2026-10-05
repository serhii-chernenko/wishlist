import { ChevronRight, ExternalLink } from 'lucide';

import { useLL } from '../state/context';
import { Icon, type IconNode } from './icon';

export interface RowListItem {
    id: string;
    icon?: IconNode;
    glyph?: string;
    label: string;
    value?: string;
    href?: string;
    onSelect: () => void;
}

const RowContent = ({ item }: { item: RowListItem }) => {
    const LL = useLL();

    return (
        <>
            {item.icon === undefined ? (
                <span class='row-icon row-glyph' aria-hidden='true'>
                    {item.glyph}
                </span>
            ) : (
                <Icon icon={item.icon} class='row-icon' />
            )}
            <span class='row-label'>{item.label}</span>
            {item.value === undefined ? null : (
                <span class='row-value'>{item.value}</span>
            )}
            <Icon
                icon={item.href === undefined ? ChevronRight : ExternalLink}
                class='row-trailing'
            />
            {item.href === undefined ? null : (
                <span class='sr-only'>{LL.a11y.externalLink()}</span>
            )}
        </>
    );
};

/** One bordered group of full-width rows separated by dashed lines, the same shape as the home menu; rows with `href` are external links. */
export const RowList = ({
    items,
    label
}: {
    items: readonly RowListItem[];
    label?: string;
}) => {
    return (
        <ul class='card card-border menu-list row-list' aria-label={label}>
            {items.map(item => {
                return (
                    <li key={item.id}>
                        {item.href === undefined ? (
                            <button
                                type='button'
                                class='menu-row'
                                onClick={item.onSelect}
                            >
                                <RowContent item={item} />
                            </button>
                        ) : (
                            <a
                                class='menu-row'
                                href={item.href}
                                rel='noopener noreferrer nofollow'
                                target='_blank'
                                onClick={(event: MouseEvent) => {
                                    event.preventDefault();
                                    item.onSelect();
                                }}
                            >
                                <RowContent item={item} />
                            </a>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};
