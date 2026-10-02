export interface TelegraphElement {
    tag: string;
    attrs?: { href?: string; src?: string };
    children?: TelegraphNode[];
}

export type TelegraphNode = string | TelegraphElement;

export const TELEGRAPH_CONTENT_MAX_BYTES = 60_000;

const textEncoder = new TextEncoder();

export const element = (
    tag: string,
    children?: readonly TelegraphNode[],
    attrs?: { href?: string; src?: string }
): TelegraphElement => {
    const node: TelegraphElement = { tag };

    if (attrs) {
        node.attrs = attrs;
    }

    if (children && children.length > 0) {
        node.children = [...children];
    }

    return node;
};

export const getNodesByteLength = (nodes: readonly TelegraphNode[]) => {
    return textEncoder.encode(JSON.stringify(nodes)).length;
};

const lineBreak = () => {
    return element('br');
};

export const textWithBreaks = (text: string): TelegraphNode[] => {
    const nodes: TelegraphNode[] = [];

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
    nodes: readonly TelegraphNode[]
): TelegraphNode[] => {
    const merged: TelegraphNode[] = [];

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

export const expandLineBreaks = (
    nodes: readonly TelegraphNode[]
): TelegraphNode[] => {
    const expanded = nodes.flatMap((node): TelegraphNode[] => {
        if (typeof node === 'string') {
            return textWithBreaks(node);
        }

        return [
            element(
                node.tag,
                node.children ? expandLineBreaks(node.children) : undefined,
                node.attrs
            )
        ];
    });

    return mergeAdjacentText(expanded);
};

const inlinePattern =
    /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)|\*([^*\n]+?)\*|(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])/gu;
const trailingUrlPunctuation = /[.,;:!?]+$/;

const buildLinkNodes = (rawUrl: string): TelegraphNode[] => {
    const trailing = trailingUrlPunctuation.exec(rawUrl)?.[0] ?? '';
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    const href = url.startsWith('www.') ? `https://${url}` : url;
    const nodes: TelegraphNode[] = [element('a', [url], { href })];

    if (trailing) {
        nodes.push(trailing);
    }

    return nodes;
};

export const inlineMarkup = (
    text: string,
    options: { emphasis: boolean } = { emphasis: true }
): TelegraphNode[] => {
    const nodes: TelegraphNode[] = [];
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

const htmlTagToTelegraphTag: Readonly<Record<string, string>> = {
    b: 'strong',
    strong: 'strong',
    i: 'em',
    em: 'em',
    u: 'u',
    s: 's',
    code: 'code',
    a: 'a',
    blockquote: 'blockquote',
    br: 'br'
};

const voidTags = new Set(['br']);

const htmlEntities: Readonly<Record<string, string>> = {
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&amp;': '&'
};

const decodeEntities = (value: string) => {
    return value.replace(/&(?:lt|gt|quot|#39|amp);/g, entity => {
        return htmlEntities[entity] ?? entity;
    });
};

const htmlTokenPattern =
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)>|([^<]+|<)/g;
const hrefPattern = /\shref="([^"]*)"/;

interface OpenElement {
    htmlTag: string;
    node: TelegraphElement | null;
    children: TelegraphNode[];
}

const closeElement = (stack: OpenElement[]) => {
    const closed = stack.pop();
    const parent = stack[stack.length - 1];

    if (!closed || !parent) {
        return;
    }

    if (closed.node === null) {
        parent.children.push(...closed.children);

        return;
    }

    parent.children.push(
        element(closed.node.tag, closed.children, closed.node.attrs)
    );
};

const openElement = (
    stack: OpenElement[],
    htmlTag: string,
    attributes: string
) => {
    const tag = htmlTagToTelegraphTag[htmlTag];

    if (tag === undefined) {
        stack.push({ htmlTag, node: null, children: [] });

        return;
    }

    const href = hrefPattern.exec(attributes)?.[1];
    const attrs =
        tag === 'a' && href ? { href: decodeEntities(href) } : undefined;

    stack.push({
        htmlTag,
        node: attrs ? { tag, attrs } : { tag },
        children: []
    });
};

export const trimEdgeWhitespace = (
    nodes: readonly TelegraphNode[]
): TelegraphNode[] => {
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

/**
 * Converts the trusted, translator-authored HTML subset used by the i18n
 * strings (b, strong, i, em, u, s, code, a, blockquote, br) into nodes.
 * Unknown tags are dropped and their children are kept.
 */
export const htmlToNodes = (html: string): TelegraphNode[] => {
    const root: OpenElement = { htmlTag: '', node: null, children: [] };
    const stack: OpenElement[] = [root];

    for (const match of html.matchAll(htmlTokenPattern)) {
        const [, closingSlash, rawTag, attributes = '', text] = match;
        const current = stack[stack.length - 1] ?? root;

        if (text !== undefined) {
            current.children.push(decodeEntities(text));
            continue;
        }

        const htmlTag = (rawTag ?? '').toLowerCase();

        if (closingSlash) {
            const openIndex = stack
                .map(open => open.htmlTag)
                .lastIndexOf(htmlTag);

            while (openIndex > 0 && stack.length > openIndex) {
                closeElement(stack);
            }

            continue;
        }

        openElement(stack, htmlTag, attributes);

        if (voidTags.has(htmlTag)) {
            closeElement(stack);
        }
    }

    while (stack.length > 1) {
        closeElement(stack);
    }

    return root.children;
};

export const replaceInText = (
    nodes: readonly TelegraphNode[],
    token: string,
    replacement: readonly TelegraphNode[]
): TelegraphNode[] => {
    const result: TelegraphNode[] = [];

    for (const node of nodes) {
        if (typeof node !== 'string') {
            result.push(
                element(
                    node.tag,
                    node.children
                        ? replaceInText(node.children, token, replacement)
                        : undefined,
                    node.attrs
                )
            );
            continue;
        }

        const parts = node.split(token);

        parts.forEach((part, index) => {
            if (index > 0) {
                result.push(...replacement);
            }

            if (part) {
                result.push(part);
            }
        });
    }

    return result;
};
