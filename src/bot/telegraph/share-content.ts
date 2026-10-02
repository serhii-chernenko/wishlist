import type { TranslationFunctions } from '../../i18n/i18n-types';
import { cutDescription, cutTitle } from '../input/limits';
import {
    element,
    expandLineBreaks,
    getNodesByteLength,
    htmlToNodes,
    inlineMarkup,
    replaceInText,
    TELEGRAPH_CONTENT_MAX_BYTES,
    trimEdgeWhitespace,
    type TelegraphNode
} from './nodes';

export interface ShareWish {
    title: string;
    description: string | null;
    link: string | null;
    price: number;
    priority: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ShareDonateLink {
    title: string;
    url: string;
}

export interface ShareContentInput {
    LL: TranslationFunctions;
    wishes: readonly ShareWish[];
    payments: string | null;
    formatMoney: (value: number) => string;
    formatDate: (value: Date) => string;
    botUrl: string;
    donateLinks: readonly ShareDonateLink[];
    maxBytes?: number;
}

export interface ShareContent {
    nodes: TelegraphNode[];
    includedWishes: number;
    truncated: boolean;
}

const PAYMENTS_TOKEN = 'payments';
const DONATE_SEPARATOR = ' • ';
const TRUNCATION_MARK = '…';

const blockFromHtml = (html: string): TelegraphNode => {
    const nodes = expandLineBreaks(trimEdgeWhitespace(htmlToNodes(html)));
    const [only] = nodes;

    if (
        nodes.length === 1 &&
        only !== undefined &&
        typeof only !== 'string' &&
        only.tag === 'blockquote'
    ) {
        return only;
    }

    return element('p', nodes);
};

const buildPaymentsBlock = (input: ShareContentInput, payments: string) => {
    const templated = htmlToNodes(input.LL.share.payments(PAYMENTS_TOKEN));
    const filled = replaceInText(
        trimEdgeWhitespace(templated),
        PAYMENTS_TOKEN,
        inlineMarkup(payments)
    );

    return element('blockquote', expandLineBreaks(filled));
};

const buildWishNodes = (
    input: ShareContentInput,
    wish: ShareWish
): TelegraphNode[] => {
    const { LL } = input;
    const nodes: TelegraphNode[] = [element('h3', [cutTitle(wish.title)])];

    if (wish.price > 0) {
        nodes.push(
            blockFromHtml(LL.markup.price(input.formatMoney(wish.price)))
        );
    }

    if (wish.description) {
        nodes.push(
            element(
                'p',
                inlineMarkup(cutDescription(wish.description), {
                    emphasis: false
                })
            )
        );
    }

    if (wish.priority) {
        nodes.push(blockFromHtml(LL.markup.priority.owner()));
    }

    if (wish.link) {
        nodes.push(
            element('p', [element('a', [wish.link], { href: wish.link })])
        );
    }

    const created = input.formatDate(wish.createdAt);
    const updated = input.formatDate(wish.updatedAt);

    nodes.push(blockFromHtml(LL.markup.date.created(created)));

    if (created !== updated) {
        nodes.push(blockFromHtml(LL.markup.date.updated(updated)));
    }

    nodes.push(element('hr'));

    return nodes;
};

const buildFooterNodes = (input: ShareContentInput): TelegraphNode[] => {
    const footer: TelegraphNode[] = [
        element('aside', [
            element('a', [input.LL.title()], { href: input.botUrl })
        ])
    ];
    const donateNodes: TelegraphNode[] = [];

    input.donateLinks.forEach((link, index) => {
        if (index > 0) {
            donateNodes.push(DONATE_SEPARATOR);
        }

        donateNodes.push(element('a', [link.title], { href: link.url }));
    });

    if (donateNodes.length > 0) {
        footer.push(element('aside', donateNodes));
    }

    return footer;
};

const getSerializedGroupBytes = (nodes: readonly TelegraphNode[]) => {
    const separatorBytes = 1;

    return nodes.reduce((total, node) => {
        return total + getNodesByteLength([node]) - 2 + separatorBytes;
    }, 0);
};

export const buildShareContent = (input: ShareContentInput): ShareContent => {
    const maxBytes = input.maxBytes ?? TELEGRAPH_CONTENT_MAX_BYTES;
    const header: TelegraphNode[] = input.payments
        ? [buildPaymentsBlock(input, input.payments)]
        : [];
    const footer = buildFooterNodes(input);
    const truncationNode = element('p', [TRUNCATION_MARK]);
    const included: TelegraphNode[] = [];
    let usedBytes = getNodesByteLength([...header, truncationNode, ...footer]);
    let includedWishes = 0;

    for (const wish of input.wishes) {
        const wishNodes = buildWishNodes(input, wish);
        const addedBytes = getSerializedGroupBytes(wishNodes);

        if (usedBytes + addedBytes > maxBytes) {
            break;
        }

        usedBytes += addedBytes;
        included.push(...wishNodes);
        includedWishes += 1;
    }

    const truncated = includedWishes < input.wishes.length;
    const nodes = [
        ...header,
        ...included,
        ...(truncated ? [truncationNode] : []),
        ...footer
    ];

    return { nodes, includedWishes, truncated };
};
