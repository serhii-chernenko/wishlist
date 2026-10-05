import type { Child } from 'hono/jsx';

export const Tag = ({
    children,
    class: className
}: {
    children?: Child;
    class?: string;
}) => {
    return (
        <div class={className === undefined ? 'note' : `note ${className}`}>
            <div class='note-tag'>
                <div class='note-body'>{children}</div>
            </div>
        </div>
    );
};
