import type { Child } from 'hono/jsx';

import type { InlineNode } from '../inline-markup';

export const OWNER_LINK_REL = 'nofollow ugc noopener noreferrer';

const renderNode = (node: InlineNode): Child => {
    if (typeof node === 'string') {
        return node;
    }

    const children = node.children?.map(renderNode);

    if (node.tag === 'a' && node.attrs?.href !== undefined) {
        return (
            <a href={node.attrs.href} rel={OWNER_LINK_REL} target='_blank'>
                {children}
            </a>
        );
    }

    if (node.tag === 'strong') {
        return <strong>{children}</strong>;
    }

    if (node.tag === 'em') {
        return <em>{children}</em>;
    }

    if (node.tag === 'br') {
        return <br />;
    }

    return children;
};

export const InlineContent = ({ nodes }: { nodes: readonly InlineNode[] }) => {
    return <>{nodes.map(renderNode)}</>;
};
