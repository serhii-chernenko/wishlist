import { WISH_PRIORITIES, type WishPriority } from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import { useLL } from '../state/context';
import { ChoiceCards, type ChoiceOption } from './choice-cards';

export interface PriorityChoiceProps {
    name: string;
    value: WishPriority;
    onChange: (priority: WishPriority) => void;
    groupDescribedBy?: string | undefined;
}

const buildPriorityOptions = (
    LL: AppTranslator
): ReadonlyArray<ChoiceOption<WishPriority>> => {
    return WISH_PRIORITIES.map(priority => {
        return {
            value: priority,
            title: LL.editor.priority.levels[priority](),
            marker: priority
        };
    });
};

/** The four priority levels as one joined radio list, shared by the wish editor and the card priority sheet. */
export const PriorityChoice = ({
    name,
    value,
    onChange,
    groupDescribedBy
}: PriorityChoiceProps) => {
    const LL = useLL();

    return (
        <ChoiceCards
            name={name}
            legend={LL.editor.priority.label()}
            options={buildPriorityOptions(LL)}
            value={value}
            variant='list'
            onChange={onChange}
            groupDescribedBy={groupDescribedBy}
        />
    );
};
