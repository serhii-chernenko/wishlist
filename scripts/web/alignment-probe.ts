export const ALIGNMENT_TOLERANCE_PX = 1;

export interface AlignmentSample {
    row: string;
    item: string;
    itemCenter: number;
    opticalCenter: number;
    lineCenter: number;
    delta: number;
    family: string;
    webfont: boolean;
}

export interface AlignmentReport {
    samples: AlignmentSample[];
    pairLabelsWrapped: string[];
    narrowControls: string[];
}

export const ALIGNMENT_PROBE_SOURCE = String.raw`
(async () => {
    await document.fonts.ready;

    const TITLE_SELECTOR = '.menu-row-label, .row-label, .choice-title, .toggle-label';
    const ITEM_SELECTOR = ':scope > .menu-icon, :scope > .row-icon, :scope > .menu-row-chevron, :scope > .row-trailing, :scope > .toggle-switch, :scope > .choice-radio';
    const ROW_SELECTOR = '.menu-row, .choice-card, .toggle-button';
    const SAMPLE_TEXT = 'Нх';
    const canvas = document.createElement('canvas').getContext('2d');
    const samples = [];

    const firstTextNode = element => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
            if (walker.currentNode.textContent.trim() !== '') {
                return walker.currentNode;
            }
        }

        return null;
    };

    const readTextMetrics = async textNode => {
        const parent = textNode.parentElement;
        const style = getComputedStyle(parent);
        const font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');

        await document.fonts.load(font, SAMPLE_TEXT);
        canvas.font = font;

        const capHeight = canvas.measureText('Н').actualBoundingBoxAscent;
        const xHeight = canvas.measureText('х').actualBoundingBoxAscent;
        const marker = document.createElement('span');

        marker.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline';
        const wrapper = document.createElement('span');

        parent.insertBefore(wrapper, textNode);
        wrapper.append(marker, textNode);

        const baseline = marker.getBoundingClientRect().bottom;

        parent.insertBefore(textNode, wrapper);
        wrapper.remove();

        const range = document.createRange();

        range.selectNodeContents(textNode);

        const lineRect = range.getClientRects()[0];

        return {
            opticalCenter: baseline - (capHeight + xHeight) / 4,
            lineCenter: lineRect.top + lineRect.height / 2,
            family: style.fontFamily.split(',')[0].trim().replace(/['"]/g, ''),
            webfont: document.fonts.check(font, SAMPLE_TEXT)
        };
    };

    const centerOf = element => {
        const rect = element.getBoundingClientRect();

        return rect.top + rect.height / 2;
    };

    const describe = element => {
        return [...element.classList].find(name => name !== 'icon') || element.tagName.toLowerCase();
    };

    const record = (rowName, item, metrics, itemName = describe(item)) => {
        const itemCenter = centerOf(item);

        samples.push({
            row: rowName,
            item: itemName,
            itemCenter,
            opticalCenter: metrics.opticalCenter,
            lineCenter: metrics.lineCenter,
            delta: itemCenter - metrics.opticalCenter,
            family: metrics.family,
            webfont: metrics.webfont
        });
    };

    for (const row of document.querySelectorAll(ROW_SELECTOR)) {
        const title = row.querySelector(TITLE_SELECTOR);
        const textNode = title === null ? null : firstTextNode(title);

        if (textNode === null || row.getClientRects().length === 0) {
            continue;
        }

        const metrics = await readTextMetrics(textNode);
        const rowName = textNode.textContent.trim().slice(0, 40);

        for (const item of row.querySelectorAll(ITEM_SELECTOR)) {
            record(rowName, item, metrics);
        }
    }

    for (const label of document.querySelectorAll('.field-label')) {
        const textNode = firstTextNode(label);
        const mark = label.querySelector('.field-mark-required');

        if (textNode === null || mark === null || label.getClientRects().length === 0) {
            continue;
        }

        const rowName = textNode.textContent.trim().slice(0, 40);
        const markTextNode = firstTextNode(mark);

        record(rowName, mark, await readTextMetrics(textNode));

        if (markTextNode !== null) {
            record(rowName, mark, await readTextMetrics(markTextNode), 'field-mark-text');
        }
    }

    const narrowControls = [];

    for (const control of document.querySelectorAll('.field-control')) {
        const row = control.closest('.field-row');
        const container = row === null ? control.closest('.field') : row;
        const suffix = row === null ? null : row.querySelector('.field-suffix');
        const suffixWidth = suffix === null ? 0 : suffix.getBoundingClientRect().width + parseFloat(getComputedStyle(row).columnGap);
        const missing = container.getBoundingClientRect().width - suffixWidth - control.getBoundingClientRect().width;

        if (missing > 1) {
            narrowControls.push(control.id + ': ' + missing.toFixed(1) + 'px narrower than its container');
        }
    }

    const pairLabelsWrapped = [];

    for (const label of document.querySelectorAll('.menu-list-pairs .menu-row-label')) {
        const range = document.createRange();

        range.selectNodeContents(label);

        const tops = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));

        if (tops.size > 1) {
            pairLabelsWrapped.push(label.textContent.trim());
        }
    }

    return { samples, pairLabelsWrapped, narrowControls };
})()
`;
