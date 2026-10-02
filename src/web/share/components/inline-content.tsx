import type { Child } from 'hono/jsx';

import type { InlineNode } from '../inline-markup';
import { TEXT_LINK_CLASS } from './link-classes';

export const OWNER_LINK_REL = 'nofollow ugc noopener noreferrer';

const renderNode = (node: InlineNode, linkClass: string): Child => {
    if (typeof node === 'string') {
        return node;
    }

    const children = node.children?.map(child => {
        return renderNode(child, linkClass);
    });

    if (node.tag === 'a' && node.attrs?.href !== undefined) {
        return (
            <a
                class={linkClass}
                href={node.attrs.href}
                rel={OWNER_LINK_REL}
                target='_blank'
            >
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

export const InlineContent = ({
    nodes,
    linkClass = TEXT_LINK_CLASS
}: {
    nodes: readonly InlineNode[];
    linkClass?: string;
}) => {
    return (
        <>
            {nodes.map(node => {
                return renderNode(node, linkClass);
            })}
        </>
    );
};
