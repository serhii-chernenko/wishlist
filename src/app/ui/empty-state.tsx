import type { Child } from 'hono/jsx';

import { Tag } from './tag';

export interface StateAction {
    label: string;
    onClick: () => void;
}

export const EmptyState = ({
    title,
    text,
    action,
    children
}: {
    title: string;
    text?: string;
    action?: StateAction;
    children?: Child;
}) => {
    return (
        <Tag class='state-tag'>
            <h2 class='state-title'>{title}</h2>
            {text === undefined ? null : <p class='state-text'>{text}</p>}
            {children}
            {action === undefined ? null : (
                <button
                    type='button'
                    class='btn btn-primary'
                    onClick={action.onClick}
                >
                    {action.label}
                </button>
            )}
        </Tag>
    );
};
