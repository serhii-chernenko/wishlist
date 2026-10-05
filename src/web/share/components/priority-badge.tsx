import type { BadgePriority } from '../../../shared/priority-badge';

export const PriorityBadge = ({
    priority,
    label
}: {
    priority: BadgePriority;
    label: string;
}) => {
    return (
        <p class='priority-badge' data-level={priority}>
            {label}
        </p>
    );
};
