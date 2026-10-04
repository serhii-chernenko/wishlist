import { LINK_IMPORT_HTML_MAX_BYTES } from '../../../shared/app-api';
import type { CollectPageSignals, ItemPropSignal, PageSignals } from './types';

const MAX_TEXT_LENGTH = 2000;
const MAX_JSON_LD_LENGTH = LINK_IMPORT_HTML_MAX_BYTES;
const MAX_ITEMPROPS = 300;
const MAX_JSON_LD_BLOCKS = 30;
const MAX_META_KEYS = 200;
const MAX_META_VALUES_PER_KEY = 20;
const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8';
const COLLECTED_META_PREFIXES: readonly string[] = [
    'og:',
    'twitter:',
    'product:'
];
const COLLECTED_META_NAMES: ReadonlySet<string> = new Set(['description']);
const COLLECTED_ITEMPROPS: ReadonlySet<string> = new Set([
    'name',
    'description',
    'image',
    'price',
    'lowprice',
    'pricecurrency'
]);
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr'
]);
const PRODUCT_SCOPE_PATTERN =
    /schema\.org\/(?:Product|IndividualProduct|ProductModel|ProductGroup)\/?$/i;
const OFFER_SCOPE_PATTERN = /schema\.org\/(?:Offer|AggregateOffer)\/?$/i;
const PRICE_SPECIFICATION_SCOPE_PATTERN =
    /schema\.org\/\w*PriceSpecification\/?$/i;
const STRIKETHROUGH_PATTERN = /StrikethroughPrice/i;
const ITEMPROP_SEPARATOR = /\s+/;

type ScopeKind = 'product' | 'offer' | 'priceSpecification' | 'foreign';

interface Scope {
    kind: ScopeKind;
    struck: boolean;
}

interface TextSink {
    value: string;
    maxLength: number;
}

interface PendingItemProp {
    props: string[];
    content: string | null;
    scope: Scope;
}

interface CollectorState {
    jsonLd: string[];
    meta: Map<string, string[]>;
    itemprops: ItemPropSignal[];
    canonical: string | null;
    titleTag: string | null;
    baseHref: string | null;
    openSinks: Set<TextSink>;
    scopes: Scope[];
    productScopesSeen: number;
    svgDepth: number;
}

const createState = (): CollectorState => {
    return {
        jsonLd: [],
        meta: new Map(),
        itemprops: [],
        canonical: null,
        titleTag: null,
        baseHref: null,
        openSinks: new Set(),
        scopes: [],
        productScopesSeen: 0,
        svgDepth: 0
    };
};

const canHaveEndTag = (element: Element) => {
    return !VOID_ELEMENTS.has(element.tagName.toLowerCase());
};

const openSink = (
    state: CollectorState,
    element: Element,
    onClose: (value: string) => void,
    maxLength = MAX_TEXT_LENGTH
) => {
    const sink: TextSink = { value: '', maxLength };

    if (!canHaveEndTag(element)) {
        onClose('');

        return;
    }

    state.openSinks.add(sink);
    element.onEndTag(() => {
        state.openSinks.delete(sink);
        onClose(sink.value);
    });
};

const appendText = (state: CollectorState, text: Text) => {
    for (const sink of state.openSinks) {
        if (sink.value.length < sink.maxLength) {
            sink.value += text.text;
        }
    }
};

const nonEmpty = (value: string | null) => {
    return value !== null && value.trim().length > 0 ? value : null;
};

const isCollectedMetaKey = (key: string) => {
    return (
        COLLECTED_META_NAMES.has(key) ||
        COLLECTED_META_PREFIXES.some(prefix => {
            return key.startsWith(prefix);
        })
    );
};

const recordMeta = (state: CollectorState, element: Element) => {
    const key = (
        element.getAttribute('property') ||
        element.getAttribute('name') ||
        ''
    ).toLowerCase();
    const content = nonEmpty(element.getAttribute('content'));

    if (content === null || !isCollectedMetaKey(key)) {
        return;
    }

    const values = state.meta.get(key);

    if (values === undefined) {
        if (state.meta.size < MAX_META_KEYS) {
            state.meta.set(key, [content]);
        }

        return;
    }

    if (values.length < MAX_META_VALUES_PER_KEY) {
        values.push(content);
    }
};

const currentScope = (state: CollectorState) => {
    return state.scopes.at(-1) ?? null;
};

const isInsideCollectingScope = (state: CollectorState) => {
    return state.scopes.some(scope => {
        return scope.kind !== 'foreign';
    });
};

const classifyTopLevelScope = (
    state: CollectorState,
    itemtype: string
): ScopeKind => {
    return state.productScopesSeen === 0 && PRODUCT_SCOPE_PATTERN.test(itemtype)
        ? 'product'
        : 'foreign';
};

const classifyNestedScope = (parent: Scope, itemtype: string): ScopeKind => {
    if (parent.kind === 'product' && OFFER_SCOPE_PATTERN.test(itemtype)) {
        return 'offer';
    }

    if (
        parent.kind === 'offer' &&
        PRICE_SPECIFICATION_SCOPE_PATTERN.test(itemtype)
    ) {
        return 'priceSpecification';
    }

    return 'foreign';
};

const classifyScope = (state: CollectorState, itemtype: string) => {
    const parent = currentScope(state);

    if (!isInsideCollectingScope(state) || parent === null) {
        return classifyTopLevelScope(state, itemtype);
    }

    return classifyNestedScope(parent, itemtype);
};

const openScope = (state: CollectorState, element: Element) => {
    if (!canHaveEndTag(element)) {
        return;
    }

    const kind = classifyScope(state, element.getAttribute('itemtype') ?? '');
    const scope: Scope = { kind, struck: false };

    if (kind === 'product') {
        state.productScopesSeen += 1;
    }

    state.scopes.push(scope);
    element.onEndTag(() => {
        state.scopes.pop();
    });
};

const isCollectingScope = (scope: Scope | null): scope is Scope => {
    return scope !== null && scope.kind !== 'foreign';
};

const emitItemProp = (
    state: CollectorState,
    pending: PendingItemProp,
    text: string | null
) => {
    if (pending.scope.struck) {
        return;
    }

    for (const prop of pending.props) {
        if (state.itemprops.length >= MAX_ITEMPROPS) {
            return;
        }

        state.itemprops.push({
            prop,
            content: pending.content,
            text: nonEmpty(text),
            inOffer: pending.scope.kind !== 'product'
        });
    }
};

const markStruck = (scope: Scope, element: Element) => {
    const content = element.getAttribute('content') ?? '';
    const href = element.getAttribute('href') ?? '';

    if (
        STRIKETHROUGH_PATTERN.test(content) ||
        STRIKETHROUGH_PATTERN.test(href)
    ) {
        scope.struck = true;
    }
};

const itemPropContent = (element: Element) => {
    return nonEmpty(
        element.getAttribute('content') ??
            element.getAttribute('src') ??
            element.getAttribute('href') ??
            element.getAttribute('value')
    );
};

const recordItemProp = (state: CollectorState, element: Element) => {
    const scope = currentScope(state);

    if (!isCollectingScope(scope) || element.hasAttribute('itemscope')) {
        return;
    }

    const names = (element.getAttribute('itemprop') ?? '')
        .split(ITEMPROP_SEPARATOR)
        .filter(Boolean);

    if (names.some(name => name.toLowerCase() === 'pricetype')) {
        markStruck(scope, element);
    }

    const props = names.filter(name => {
        return COLLECTED_ITEMPROPS.has(name.toLowerCase());
    });

    if (props.length === 0) {
        return;
    }

    const pending: PendingItemProp = {
        props,
        content: itemPropContent(element),
        scope
    };

    openSink(state, element, text => {
        emitItemProp(state, pending, text);
    });
};

const buildRewriter = (state: CollectorState) => {
    return new HTMLRewriter()
        .on('script[type*="ld+json"]', {
            element: element => {
                openSink(
                    state,
                    element,
                    text => {
                        if (state.jsonLd.length < MAX_JSON_LD_BLOCKS) {
                            state.jsonLd.push(text);
                        }
                    },
                    MAX_JSON_LD_LENGTH
                );
            }
        })
        .on('meta', {
            element: element => {
                recordMeta(state, element);
            }
        })
        .on('link[rel~="canonical"][href]', {
            element: element => {
                state.canonical ??= nonEmpty(element.getAttribute('href'));
            }
        })
        .on('base[href]', {
            element: element => {
                state.baseHref ??= nonEmpty(element.getAttribute('href'));
            }
        })
        .on('svg', {
            element: element => {
                state.svgDepth += 1;
                element.onEndTag(() => {
                    state.svgDepth -= 1;
                });
            }
        })
        .on('title', {
            element: element => {
                if (state.svgDepth > 0 || state.titleTag !== null) {
                    return;
                }

                openSink(state, element, text => {
                    state.titleTag ??= nonEmpty(text);
                });
            }
        })
        .on('[itemprop]', {
            element: element => {
                recordItemProp(state, element);
            }
        })
        .on('[itemscope]', {
            element: element => {
                openScope(state, element);
            }
        })
        .onDocument({
            text: text => {
                appendText(state, text);
            }
        });
};

const limitBody = (
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
    onTruncate: () => void
) => {
    const reader = body.getReader();
    let total = 0;

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            const { done, value } = await reader.read();

            if (done) {
                controller.close();

                return;
            }

            const remaining = maxBytes - total;

            if (value.byteLength > remaining) {
                controller.enqueue(value.subarray(0, remaining));
                onTruncate();
                controller.close();
                await reader.cancel().catch(() => {
                    return undefined;
                });

                return;
            }

            total += value.byteLength;
            controller.enqueue(value);
        },
        cancel(reason) {
            return reader.cancel(reason);
        }
    });
};

const drain = async (body: ReadableStream<Uint8Array> | null) => {
    if (body === null) {
        return;
    }

    const reader = body.getReader();

    for (;;) {
        const { done } = await reader.read();

        if (done) {
            return;
        }
    }
};

const toSignals = (state: CollectorState, truncated: boolean): PageSignals => {
    return {
        jsonLd: state.jsonLd,
        meta: Object.fromEntries(state.meta),
        itemprops: state.itemprops,
        canonical: state.canonical,
        titleTag: state.titleTag,
        baseHref: state.baseHref,
        truncated
    };
};

/**
 * Streams a page through HTMLRewriter (Workers only) and keeps JSON-LD blocks,
 * og/twitter/product metas, the canonical link, the first non-SVG `<title>`,
 * `<base href>` and the microdata of the first top-level Product scope. Only
 * item properties whose nearest scope is that Product, one of its offers or
 * an offer's price specification are kept; nested brands, sellers, reviews
 * and struck-through prices are dropped. Values are raw: entities are left
 * for the extractor. Reading stops at the HTML byte cap and on any stream
 * error, and both mark the signals `truncated`.
 */
export const collectPageSignals: CollectPageSignals = async response => {
    const state = createState();
    let truncated = false;
    const markTruncated = () => {
        truncated = true;
    };

    if (response.body === null) {
        return toSignals(state, truncated);
    }

    const limited = new Response(
        limitBody(response.body, LINK_IMPORT_HTML_MAX_BYTES, markTruncated),
        {
            headers: {
                'content-type':
                    response.headers.get('content-type') ?? DEFAULT_CONTENT_TYPE
            }
        }
    );

    try {
        await drain(buildRewriter(state).transform(limited).body);
    } catch {
        markTruncated();
    }

    return toSignals(state, truncated);
};
