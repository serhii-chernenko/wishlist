export interface InlineElement {
    tag: string;
    attrs?: { href?: string };
    children?: InlineNode[];
}

export type InlineNode = string | InlineElement;

const element = (
    tag: string,
    children?: readonly InlineNode[],
    attrs?: { href?: string }
): InlineElement => {
    const node: InlineElement = { tag };

    if (attrs) {
        node.attrs = attrs;
    }

    if (children && children.length > 0) {
        node.children = [...children];
    }

    return node;
};

const lineBreak = () => {
    return element('br');
};

export const textWithBreaks = (text: string): InlineNode[] => {
    const nodes: InlineNode[] = [];

    text.split('\n').forEach((line, index) => {
        if (index > 0) {
            nodes.push(lineBreak());
        }

        if (line) {
            nodes.push(line);
        }
    });

    return nodes;
};

export const mergeAdjacentText = (
    nodes: readonly InlineNode[]
): InlineNode[] => {
    const merged: InlineNode[] = [];

    for (const node of nodes) {
        const previous = merged[merged.length - 1];

        if (typeof node === 'string' && typeof previous === 'string') {
            merged[merged.length - 1] = previous + node;
            continue;
        }

        merged.push(node);
    }

    return merged;
};

const inlinePattern =
    /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)|\*([^*\n]+?)\*|(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])/gu;
const trailingUrlPunctuation = /[.,;:!?]+$/;

const buildLinkNodes = (rawUrl: string): InlineNode[] => {
    const trailing = trailingUrlPunctuation.exec(rawUrl)?.[0] ?? '';
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    const href = url.startsWith('www.') ? `https://${url}` : url;
    const nodes: InlineNode[] = [element('a', [url], { href })];

    if (trailing) {
        nodes.push(trailing);
    }

    return nodes;
};

export const inlineMarkup = (
    text: string,
    options: { emphasis: boolean } = { emphasis: true }
): InlineNode[] => {
    const nodes: InlineNode[] = [];
    let cursor = 0;

    for (const match of text.matchAll(inlinePattern)) {
        const [whole, url, strong, emphasis] = match;
        const start = match.index;
        const isFormatting = url === undefined;

        if (isFormatting && !options.emphasis) {
            continue;
        }

        nodes.push(...textWithBreaks(text.slice(cursor, start)));

        if (url !== undefined) {
            nodes.push(...buildLinkNodes(url));
        } else if (strong !== undefined) {
            nodes.push(element('strong', textWithBreaks(strong)));
        } else {
            nodes.push(element('em', textWithBreaks(emphasis ?? '')));
        }

        cursor = start + whole.length;
    }

    nodes.push(...textWithBreaks(text.slice(cursor)));

    return mergeAdjacentText(nodes);
};

export const trimEdgeWhitespace = (
    nodes: readonly InlineNode[]
): InlineNode[] => {
    const result = [...nodes];

    while (result.length > 0) {
        const first = result[0];

        if (typeof first !== 'string') {
            break;
        }

        const trimmed = first.trimStart();

        if (trimmed) {
            result[0] = trimmed;
            break;
        }

        result.shift();
    }

    while (result.length > 0) {
        const last = result[result.length - 1];

        if (typeof last !== 'string') {
            break;
        }

        const trimmed = last.trimEnd();

        if (trimmed) {
            result[result.length - 1] = trimmed;
            break;
        }

        result.pop();
    }

    return result;
};
