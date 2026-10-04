import { LINK_IMPORT_MAX_IMAGE_CANDIDATES } from '../../../shared/app-api';
import { PRICE_MAX_VALUE, cutDescription, cutTitle } from '../../input/limits';
import { parsePrice } from '../../input/price';
import { registrableDomain } from './normalize-url';
import type {
    ExtractProduct,
    ExtractedProduct,
    ItemPropSignal,
    LinkImportSource,
    PageSignals
} from './types';

type JsonObject = Record<string, unknown>;

interface Draft {
    source: LinkImportSource;
    title: string | null;
    description: string | null;
    price: number | null;
    currency: string | null;
    images: string[];
}

interface ExtractContext {
    finalUrl: URL;
    canonical: URL | null;
    base: URL;
    referenceTokens: ReadonlySet<string>;
    siteNames: readonly string[];
    ogIsGeneric: boolean;
}

interface OfferReading {
    price: number | null;
    currency: string | null;
    wideRange: boolean;
}

interface ProductGraph {
    candidates: JsonObject[];
    variantsOf: (node: JsonObject) => JsonObject[];
}

const WIDE_PRICE_RANGE_RATIO = 3;
const MAX_GRAPH_DEPTH = 4;
const MIN_TOKEN_LENGTH = 2;
const MIN_SITE_NAME_LENGTH = 3;
const PRODUCT_TYPES: ReadonlySet<string> = new Set([
    'product',
    'individualproduct',
    'productmodel',
    'someproducts',
    'productgroup'
]);
const PRODUCT_GROUP_TYPE = 'productgroup';
const AGGREGATE_OFFER_TYPE = 'aggregateoffer';
const STRIKETHROUGH_PATTERN = /strikethrough/i;
const HTTP_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const IMAGE_PROTOCOL = 'https:';
const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ENTITY_PATTERN = /&(#x[\da-f]+|#\d+|[a-z]+\d*);/gi;
const TAG_PATTERN = /<[^>]*>/g;
const WHITESPACE_PATTERN = /\s+/gu;
const CONTROL_CHARACTERS_PATTERN = /\p{Cc}+/gu;
const MARKUP_WRAPPER_PATTERN =
    /^\s*(?:<!--|\/\/\s*<!\[CDATA\[)|(?:-->|\/\/\s*\]\]>)\s*$/g;
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{N}]+/gu;
const TITLE_SEPARATOR_PATTERN = /(\s+[|:•·–—-]\s+)/;
const TYPE_NAMESPACE_PATTERN = /^.*[/:]/;
const WWW_PREFIX_PATTERN = /^www\./;
const TRAILING_SLASHES_PATTERN = /\/+$/;
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
const MAX_CODE_POINT = 0x10ffff;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    ndash: '–',
    mdash: '—',
    laquo: '«',
    raquo: '»',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    bdquo: '„',
    euro: '€',
    copy: '©',
    reg: '®',
    trade: '™',
    times: '×',
    deg: '°',
    middot: '·',
    bull: '•',
    sup2: '²',
    sup3: '³'
};

const isObject = (value: unknown): value is JsonObject => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const asArray = (value: unknown): unknown[] => {
    if (value === undefined || value === null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
};

const asObjects = (value: unknown): JsonObject[] => {
    return asArray(value).filter(isObject);
};

const asString = (value: unknown) => {
    return typeof value === 'string' ? value : null;
};

const decodeEntity = (match: string, body: string) => {
    if (body.startsWith('#')) {
        const isHex = body[1] === 'x' || body[1] === 'X';
        const codePoint = Number.parseInt(
            body.slice(isHex ? 2 : 1),
            isHex ? HEX_RADIX : DECIMAL_RADIX
        );

        return codePoint > 0 && codePoint <= MAX_CODE_POINT
            ? String.fromCodePoint(codePoint)
            : match;
    }

    return NAMED_ENTITIES[body] ?? match;
};

export const decodeHtmlEntities = (value: string) => {
    return value.replace(ENTITY_PATTERN, decodeEntity);
};

const cleanText = (value: string | null) => {
    if (value === null) {
        return null;
    }

    const cleaned = decodeHtmlEntities(value)
        .replace(TAG_PATTERN, ' ')
        .replace(WHITESPACE_PATTERN, ' ')
        .trim();

    return cleaned.length > 0 ? cleaned : null;
};

const tokensOf = (value: string) => {
    return (value.toLowerCase().match(TOKEN_PATTERN) ?? []).filter(token => {
        return token.length >= MIN_TOKEN_LENGTH;
    });
};

const compactName = (value: string) => {
    return value.toLowerCase().replace(NON_ALPHANUMERIC_PATTERN, '');
};

const parseUrl = (raw: string | null, base: URL | string) => {
    if (raw === null) {
        return null;
    }

    try {
        const url = new URL(decodeHtmlEntities(raw).trim(), base);

        return HTTP_PROTOCOLS.has(url.protocol) ? url : null;
    } catch {
        return null;
    }
};

const pathKey = (url: URL) => {
    const host = url.hostname.replace(WWW_PREFIX_PATTERN, '');
    const path = url.pathname.replace(TRAILING_SLASHES_PATTERN, '');

    return `${host}${path}`.toLowerCase();
};

const exactKey = (url: URL) => {
    return `${pathKey(url)}${url.search}`;
};

const firstMeta = (signals: PageSignals, keys: readonly string[]) => {
    for (const key of keys) {
        const value = cleanText(signals.meta[key]?.[0] ?? null);

        if (value !== null) {
            return value;
        }
    }

    return null;
};

const allMeta = (signals: PageSignals, keys: readonly string[]) => {
    return keys.flatMap(key => {
        return signals.meta[key] ?? [];
    });
};

const readAmount = (value: unknown) => {
    let amount: number | null = null;

    if (typeof value === 'number' && Number.isFinite(value)) {
        amount = Math.round(value);
    } else if (typeof value === 'string') {
        const parsed = parsePrice(decodeHtmlEntities(value), []);

        amount = parsed.ok ? parsed.value : null;
    }

    return amount !== null && amount > 0 && amount <= PRICE_MAX_VALUE
        ? amount
        : null;
};

const readCurrency = (value: unknown) => {
    const text = asString(value)?.trim().toUpperCase() ?? '';

    return ISO_CURRENCY_PATTERN.test(text) ? text : null;
};

const typesOf = (node: JsonObject) => {
    return asArray(node['@type'])
        .map(asString)
        .filter((type): type is string => {
            return type !== null;
        })
        .map(type => {
            return type.replace(TYPE_NAMESPACE_PATTERN, '').toLowerCase();
        });
};

const isProductNode = (node: JsonObject) => {
    return typesOf(node).some(type => {
        return PRODUCT_TYPES.has(type);
    });
};

const isGroupNode = (node: JsonObject) => {
    return typesOf(node).includes(PRODUCT_GROUP_TYPE);
};

const referenceId = (value: unknown) => {
    return isObject(value) ? asString(value['@id']) : asString(value);
};

const parseJsonLd = (block: string): unknown => {
    const text = block.replace(MARKUP_WRAPPER_PATTERN, '');

    for (const candidate of [
        text,
        text.replace(CONTROL_CHARACTERS_PATTERN, ' ')
    ]) {
        try {
            return JSON.parse(candidate) as unknown;
        } catch {
            continue;
        }
    }

    return undefined;
};

const collectNodes = (value: unknown, into: JsonObject[], depth: number) => {
    if (depth > MAX_GRAPH_DEPTH) {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectNodes(item, into, depth + 1);
        }

        return;
    }

    if (!isObject(value)) {
        return;
    }

    into.push(value);
    collectNodes(value['@graph'], into, depth + 1);
    collectNodes(value['mainEntity'], into, depth + 1);
};

const buildProductGraph = (signals: PageSignals): ProductGraph => {
    const nodes: JsonObject[] = [];

    for (const block of signals.jsonLd) {
        collectNodes(parseJsonLd(block), nodes, 0);
    }

    const products = [...new Set(nodes.filter(isProductNode))];
    const byId = new Map(
        nodes.flatMap(node => {
            const id = asString(node['@id']);

            return id === null ? [] : [[id, node] as const];
        })
    );
    const groups = products.filter(isGroupNode);
    const variantsOf = (group: JsonObject) => {
        const groupId = asString(group['@id']);
        const declared = asArray(group['hasVariant']).flatMap(variant => {
            const resolved = isObject(variant)
                ? variant
                : byId.get(referenceId(variant) ?? '');

            return resolved === undefined ? [] : [resolved];
        });
        const linked = products.filter(product => {
            const parent = product['isVariantOf'];

            return (
                parent === group ||
                (groupId !== null && referenceId(parent) === groupId)
            );
        });

        return [...new Set([...declared, ...linked])].filter(isObject);
    };
    const variants = new Set(groups.flatMap(variantsOf));

    return {
        candidates: products.filter(product => {
            return !variants.has(product);
        }),
        variantsOf
    };
};

const nodeUrls = (node: JsonObject, context: ExtractContext) => {
    const offerUrls = asObjects(node['offers']).map(offer => {
        return offer['url'];
    });
    const raw = [
        node['url'],
        node['@id'],
        referenceId(node['mainEntityOfPage']),
        ...offerUrls
    ];

    return raw.flatMap(value => {
        const url = parseUrl(asString(value), context.base);

        return url === null ? [] : [url];
    });
};

const targetUrls = (context: ExtractContext) => {
    return context.canonical === null
        ? [context.finalUrl]
        : [context.finalUrl, context.canonical];
};

const matchesTarget = (
    node: JsonObject,
    context: ExtractContext,
    targets: readonly URL[],
    keyOf: (url: URL) => string
) => {
    const targetKeys = new Set(targets.map(keyOf));

    return nodeUrls(node, context).some(url => {
        return targetKeys.has(keyOf(url));
    });
};

const pickCandidate = (graph: ProductGraph, context: ExtractContext) => {
    const targets = targetUrls(context);
    const matched = graph.candidates.find(candidate => {
        return [candidate, ...graph.variantsOf(candidate)].some(node => {
            return matchesTarget(node, context, targets, pathKey);
        });
    });

    if (matched !== undefined) {
        return matched;
    }

    return graph.candidates.length === 1 ? (graph.candidates[0] ?? null) : null;
};

const pickVariantFor = (
    variants: JsonObject[],
    context: ExtractContext,
    target: URL
) => {
    const exact = variants.find(variant => {
        return matchesTarget(variant, context, [target], exactKey);
    });

    if (exact !== undefined) {
        return exact;
    }

    const byPath = variants.filter(variant => {
        return matchesTarget(variant, context, [target], pathKey);
    });

    return byPath.length === 1 ? (byPath[0] ?? null) : null;
};

const pickVariant = (variants: JsonObject[], context: ExtractContext) => {
    for (const target of targetUrls(context)) {
        const variant = pickVariantFor(variants, context, target);

        if (variant !== null) {
            return variant;
        }
    }

    return null;
};

const isEligibleSpecification = (specification: JsonObject) => {
    const priceType = asString(specification['priceType']) ?? '';

    return (
        !STRIKETHROUGH_PATTERN.test(priceType) &&
        specification['validForMemberTier'] === undefined
    );
};

const readSpecification = (value: unknown) => {
    const specification = asObjects(value).find(entry => {
        return (
            isEligibleSpecification(entry) &&
            readAmount(entry['price']) !== null
        );
    });

    return {
        price: readAmount(specification?.['price']),
        currency: readCurrency(specification?.['priceCurrency'])
    };
};

const isWideAggregate = (offer: JsonObject) => {
    const low = readAmount(offer['lowPrice']);
    const high = readAmount(offer['highPrice']);

    return (
        typesOf(offer).includes(AGGREGATE_OFFER_TYPE) &&
        low !== null &&
        high !== null &&
        high / low > WIDE_PRICE_RANGE_RATIO
    );
};

const readOffer = (offer: JsonObject): OfferReading => {
    const specification = readSpecification(offer['priceSpecification']);
    const price =
        readAmount(offer['price']) ??
        specification.price ??
        readAmount(offer['lowPrice']);

    return {
        price,
        currency:
            readCurrency(offer['priceCurrency']) ?? specification.currency,
        wideRange: isWideAggregate(offer)
    };
};

const readOffers = (node: JsonObject | null): OfferReading | null => {
    if (node === null) {
        return null;
    }

    const readings = asObjects(node['offers']).map(readOffer);
    const priced = readings.find(reading => {
        return reading.price !== null;
    });

    if (priced === undefined) {
        return null;
    }

    return {
        ...priced,
        wideRange: readings.some(reading => {
            return reading.wideRange;
        })
    };
};

const lowestVariantOffer = (variants: JsonObject[]): OfferReading | null => {
    const readings = variants.flatMap(variant => {
        const reading = readOffers(variant);

        return reading === null ? [] : [reading];
    });
    const currency = readings[0]?.currency ?? null;

    return readings
        .filter(reading => {
            return reading.currency === currency;
        })
        .reduce<OfferReading | null>((lowest, reading) => {
            return lowest === null || (reading.price ?? 0) < (lowest.price ?? 0)
                ? reading
                : lowest;
        }, null);
};

const imageUrlsOf = (node: JsonObject | null | undefined): string[] => {
    if (node === null || node === undefined) {
        return [];
    }

    return asArray(node['image']).flatMap(image => {
        if (typeof image === 'string') {
            return [image];
        }

        if (!isObject(image)) {
            return [];
        }

        const url = asString(image['url']) ?? asString(image['contentUrl']);

        return url === null ? [] : [url];
    });
};

const firstText = (
    nodes: readonly (JsonObject | null | undefined)[],
    key: string
) => {
    for (const node of nodes) {
        const value = cleanText(asString(node?.[key]));

        if (value !== null) {
            return value;
        }
    }

    return null;
};

const firstImages = (nodes: readonly (JsonObject | null | undefined)[]) => {
    for (const node of nodes) {
        const images = imageUrlsOf(node);

        if (images.length > 0) {
            return images;
        }
    }

    return [];
};

const sharesReferenceToken = (title: string, context: ExtractContext) => {
    if (context.referenceTokens.size === 0) {
        return true;
    }

    return tokensOf(title).some(token => {
        return context.referenceTokens.has(token);
    });
};

const jsonLdDraft = (
    signals: PageSignals,
    context: ExtractContext
): Draft | null => {
    const graph = buildProductGraph(signals);
    const product = pickCandidate(graph, context);

    if (product === null) {
        return null;
    }

    const variants = graph.variantsOf(product);
    const variant = pickVariant(variants, context);
    const nodes = [variant, product, variants[0]];
    const offer =
        readOffers(variant) ??
        readOffers(product) ??
        lowestVariantOffer(variants);
    const title = firstText(nodes, 'name');

    if (
        offer?.wideRange === true ||
        title === null ||
        !sharesReferenceToken(title, context)
    ) {
        return null;
    }

    return {
        source: 'jsonld',
        title,
        description: firstText(nodes, 'description'),
        price: offer?.price ?? null,
        currency: offer?.currency ?? null,
        images: firstImages(nodes)
    };
};

const itemPropValue = (signal: ItemPropSignal) => {
    return signal.content ?? signal.text;
};

const itemPropsNamed = (signals: PageSignals, name: string) => {
    return signals.itemprops.filter(signal => {
        return signal.prop.toLowerCase() === name;
    });
};

const preferOffer = (props: ItemPropSignal[]) => {
    const inOffer = props.filter(signal => {
        return signal.inOffer;
    });

    return inOffer.length > 0 ? inOffer : props;
};

const microdataPrice = (signals: PageSignals) => {
    const amounts = preferOffer([
        ...itemPropsNamed(signals, 'price'),
        ...itemPropsNamed(signals, 'lowprice')
    ]).flatMap(signal => {
        const amount = readAmount(itemPropValue(signal));

        return amount === null ? [] : [amount];
    });

    return amounts.length > 0 ? Math.min(...amounts) : null;
};

const microdataDraft = (
    signals: PageSignals,
    context: ExtractContext
): Draft | null => {
    const productText = (name: string) => {
        const signal = itemPropsNamed(signals, name).find(prop => {
            return !prop.inOffer && cleanText(itemPropValue(prop)) !== null;
        });

        return signal === undefined ? null : cleanText(itemPropValue(signal));
    };
    const title = productText('name');

    if (title === null || !sharesReferenceToken(title, context)) {
        return null;
    }

    const currencySignal = preferOffer(
        itemPropsNamed(signals, 'pricecurrency')
    )[0];

    return {
        source: 'microdata',
        title,
        description: productText('description'),
        price: microdataPrice(signals),
        currency:
            currencySignal === undefined
                ? null
                : readCurrency(itemPropValue(currencySignal)),
        images: itemPropsNamed(signals, 'image').flatMap(signal => {
            return signal.content === null ? [] : [signal.content];
        })
    };
};

const OG_TITLE_KEYS = ['og:title', 'twitter:title'] as const;
const OG_DESCRIPTION_KEYS = [
    'og:description',
    'twitter:description',
    'description'
] as const;
const OG_IMAGE_KEYS = [
    'og:image',
    'og:image:url',
    'og:image:secure_url'
] as const;
const TWITTER_IMAGE_KEYS = ['twitter:image', 'twitter:image:src'] as const;
const OG_PRICE_KEYS = ['product:price:amount', 'og:price:amount'] as const;
const OG_CURRENCY_KEYS = [
    'product:price:currency',
    'og:price:currency'
] as const;
const SITE_NAME_KEYS = ['og:site_name', 'og:sitename'] as const;
const PLAIN_DESCRIPTION_KEYS = ['description'] as const;

const ogImages = (signals: PageSignals) => {
    const images = allMeta(signals, OG_IMAGE_KEYS);

    return images.length > 0 ? images : allMeta(signals, TWITTER_IMAGE_KEYS);
};

const openGraphDraft = (
    signals: PageSignals,
    context: ExtractContext
): Draft => {
    const generic = context.ogIsGeneric;

    return {
        source: 'og',
        title: generic ? null : firstMeta(signals, OG_TITLE_KEYS),
        description: firstMeta(
            signals,
            generic ? PLAIN_DESCRIPTION_KEYS : OG_DESCRIPTION_KEYS
        ),
        price: readAmount(firstMeta(signals, OG_PRICE_KEYS)),
        currency: readCurrency(firstMeta(signals, OG_CURRENCY_KEYS)),
        images: generic ? [] : ogImages(signals)
    };
};

const siteNamesOf = (signals: PageSignals, finalUrl: URL) => {
    const domainLabel =
        registrableDomain(finalUrl.hostname).split('.')[0] ?? '';
    const names = [
        ...allMeta(signals, SITE_NAME_KEYS).map(decodeHtmlEntities),
        domainLabel
    ].map(compactName);

    return [...new Set(names)].filter(name => {
        return name.length >= MIN_SITE_NAME_LENGTH;
    });
};

const isGenericOpenGraph = (
    signals: PageSignals,
    siteNames: readonly string[]
) => {
    const title = firstMeta(signals, OG_TITLE_KEYS);

    return title !== null && siteNames.includes(compactName(title));
};

const namesSite = (segment: string, siteNames: readonly string[]) => {
    const candidates = new Set([
        compactName(segment),
        ...(segment.toLowerCase().match(TOKEN_PATTERN) ?? [])
    ]);

    return siteNames.some(name => {
        return candidates.has(name);
    });
};

/** Drops a trailing "- Shop" / "| Shop.pl" / ": Amazon.de: …" tail once a segment after the first names the site. */
export const stripSiteSuffix = (
    title: string,
    siteNames: readonly string[]
) => {
    const parts = title.split(TITLE_SEPARATOR_PATTERN);

    for (let index = 2; index < parts.length; index += 2) {
        if (namesSite(parts[index] ?? '', siteNames)) {
            return parts
                .slice(0, index - 1)
                .join('')
                .trim();
        }
    }

    return title;
};

const buildContext = (signals: PageSignals, finalUrl: URL): ExtractContext => {
    const canonical = parseUrl(signals.canonical, finalUrl);
    const base = parseUrl(signals.baseHref, finalUrl) ?? finalUrl;
    const siteNames = siteNamesOf(signals, finalUrl);
    const ogIsGeneric = isGenericOpenGraph(signals, siteNames);
    const references = [
        ogIsGeneric ? null : firstMeta(signals, OG_TITLE_KEYS),
        cleanText(signals.titleTag)
    ].filter((value): value is string => {
        return value !== null;
    });

    return {
        finalUrl,
        canonical,
        base,
        referenceTokens: new Set(references.flatMap(tokensOf)),
        siteNames,
        ogIsGeneric
    };
};

const resolveImages = (images: readonly string[], context: ExtractContext) => {
    const resolved = images.flatMap(image => {
        const url = parseUrl(image, context.base);

        return url !== null && url.protocol === IMAGE_PROTOCOL
            ? [url.href]
            : [];
    });

    return [...new Set(resolved)].slice(0, LINK_IMPORT_MAX_IMAGE_CANDIDATES);
};

const pickPriced = (drafts: readonly Draft[]) => {
    const priced = drafts.find(draft => {
        return draft.price !== null;
    });
    const currency =
        priced?.currency ??
        drafts.find(draft => {
            return draft.currency !== null;
        })?.currency ??
        null;

    return { price: priced?.price ?? null, currency: priced ? currency : null };
};

const finalizeTitle = (title: string, context: ExtractContext) => {
    const stripped = stripSiteSuffix(title, context.siteNames);

    return cutTitle(stripped.length > 0 ? stripped : title);
};

const finalizeDescription = (description: string | null, title: string) => {
    return description === null || description === title
        ? null
        : cutDescription(description);
};

const safeUrl = (raw: string) => {
    try {
        return new URL(raw);
    } catch {
        return null;
    }
};

/**
 * Reads a product from collected page signals: JSON-LD first, then microdata,
 * then OpenGraph/Twitter. The first source with a title wins; missing price,
 * description and images are filled from the later sources. A JSON-LD node
 * is dropped when its aggregate price range is wider than 3x or its name
 * shares no word with og:title or `<title>`, which rejects category pages.
 * Returns null when no source yields a title.
 */
export const extractProduct: ExtractProduct = (signals, finalUrlRaw) => {
    const finalUrl = safeUrl(finalUrlRaw);

    if (finalUrl === null) {
        return null;
    }

    const context = buildContext(signals, finalUrl);
    const drafts = [
        jsonLdDraft(signals, context),
        microdataDraft(signals, context),
        openGraphDraft(signals, context)
    ].filter((draft): draft is Draft => {
        return draft !== null;
    });
    const primary = drafts.find(draft => {
        return draft.title !== null;
    });

    if (primary === undefined || primary.title === null) {
        return null;
    }

    const ordered = [primary, ...drafts.filter(draft => draft !== primary)];
    const title = finalizeTitle(primary.title, context);
    const { price, currency } = pickPriced(ordered);
    const description =
        ordered.find(draft => {
            return draft.description !== null;
        })?.description ?? null;
    const images =
        ordered
            .map(draft => {
                return resolveImages(draft.images, context);
            })
            .find(resolved => {
                return resolved.length > 0;
            }) ?? [];
    const product: ExtractedProduct = {
        title,
        description: finalizeDescription(description, primary.title),
        price,
        currency,
        images,
        source: primary.source,
        canonicalUrl: context.canonical?.href ?? null,
        finalUrl: finalUrlRaw
    };

    return product;
};
