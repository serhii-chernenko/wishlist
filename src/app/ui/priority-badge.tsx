import type { BadgePriority } from '../../shared/priority-badge';
import { useLL } from '../state/context';

/** The colored level chip shared with the share page markup (`.priority-badge`); the visible label is the level and a screen reader prefix names what it is. */
export const PriorityBadge = ({ priority }: { priority: BadgePriority }) => {
    const LL = useLL();

    return (
        <p class='priority-badge' data-level={priority}>
            <span class='sr-only'>{LL.editor.priority.label()}: </span>
            {LL.editor.priority.levels[priority]()}
        </p>
    );
};
