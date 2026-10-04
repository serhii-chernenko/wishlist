import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

import type { PageSignals } from '../../src/bot/services/link-import/types';
import { LINK_IMPORT_HTML_MAX_BYTES } from '../../src/shared/app-api';

const collectModulePath = path.resolve(
    process.cwd(),
    'src/bot/services/link-import/collect.ts'
);
const fixturesDirectory = path.resolve(
    process.cwd(),
    'test/fixtures/link-import'
);
const signalsDirectory = path.join(fixturesDirectory, 'signals');
const updateSnapshots = process.env.LINK_IMPORT_UPDATE_SIGNALS === '1';
const compatibilityDate = '2026-05-09';
const OVERSIZED_PATH = '/oversized';
const OVERSIZED_EXTRA_BYTES = 512 * 1024;
const PAGE_CONTENT_TYPE_HEADER = 'x-page-content-type';
const WINDOWS_1251_TITLE = [
    ...Buffer.from('<html><head><title>'),
    0xc0,
    0xe1,
    ...Buffer.from('</title></head></html>')
];

const workerEntry = `
import { collectPageSignals } from ${JSON.stringify(collectModulePath)};

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8';
const encoder = new TextEncoder();

const oversizedBody = (totalBytes) => {
    const head = encoder.encode(
        '<html><head><script type="application/ld+json">{"@type":"Product","name":"Big"}</script></head><body>'
    );
    const filler = encoder.encode('<p>' + 'x'.repeat(16 * 1024) + '</p>');
    let sent = 0;

    return new ReadableStream({
        pull(controller) {
            const chunk = sent === 0 ? head : filler;

            controller.enqueue(chunk);
            sent += chunk.byteLength;

            if (sent >= totalBytes) {
                controller.close();
            }
        }
    });
};

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const body =
            url.pathname === ${JSON.stringify(OVERSIZED_PATH)}
                ? oversizedBody(${LINK_IMPORT_HTML_MAX_BYTES + OVERSIZED_EXTRA_BYTES})
                : request.body;
        const contentType =
            request.headers.get(${JSON.stringify(PAGE_CONTENT_TYPE_HEADER)}) ??
            DEFAULT_CONTENT_TYPE;
        const signals = await collectPageSignals(
            new Response(body, { headers: { 'content-type': contentType } })
        );

        return Response.json(signals);
    }
};
`;

const htmlFixtures = fs
    .readdirSync(fixturesDirectory)
    .filter(file => {
        return file.endsWith('.html');
    })
    .sort();

const collect = async (worker: Unstable_DevWorker, html: string) => {
    const response = await worker.fetch('/', { method: 'POST', body: html });

    return (await response.json()) as PageSignals;
};

describe('link-import collector under workerd', () => {
    let worker: Unstable_DevWorker;
    let probeDirectory: string;

    before(async () => {
        probeDirectory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'wishlist-link-collect-')
        );

        const entryPath = path.join(probeDirectory, 'entry.ts');
        const configPath = path.join(probeDirectory, 'wrangler.jsonc');

        fs.writeFileSync(entryPath, workerEntry);
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                name: 'wishlist-link-collect-probe',
                main: 'entry.ts',
                compatibility_date: compatibilityDate,
                compatibility_flags: ['nodejs_compat']
            })
        );
        worker = await unstable_dev(entryPath, {
            config: configPath,
            local: true,
            logLevel: 'error',
            ip: '127.0.0.1',
            persist: false,
            experimental: { disableExperimentalWarning: true }
        });
    });

    after(async () => {
        await worker?.stop();
        fs.rmSync(probeDirectory, { recursive: true, force: true });
    });

    for (const file of htmlFixtures) {
        it(`matches the committed signals for ${file}`, async () => {
            const html = fs.readFileSync(
                path.join(fixturesDirectory, file),
                'utf8'
            );
            const signals = await collect(worker, html);
            const snapshotPath = path.join(
                signalsDirectory,
                file.replace(/\.html$/, '.json')
            );

            if (updateSnapshots) {
                fs.writeFileSync(
                    snapshotPath,
                    `${JSON.stringify(signals, null, 4)}\n`
                );
            }

            const expected = JSON.parse(
                fs.readFileSync(snapshotPath, 'utf8')
            ) as PageSignals;

            assert.deepEqual(signals, expected);
        });
    }

    it('keeps only the main product microdata and drops struck prices', async () => {
        const signals = await collect(
            worker,
            [
                '<body itemscope itemtype="https://schema.org/ItemPage">',
                '<span itemprop="name">Breadcrumb</span>',
                '<div itemscope itemtype="https://schema.org/Product" itemprop="mainEntity">',
                '<h1 itemprop="name">Kettle &amp; Co</h1>',
                '<div itemprop="brand" itemscope itemtype="https://schema.org/Brand"><meta itemprop="name" content="Brand"></div>',
                '<img itemprop="image" src="/a.jpg">',
                '<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">',
                '<div itemprop="priceSpecification" itemscope itemtype="https://schema.org/UnitPriceSpecification">',
                '<meta itemprop="priceType" content="https://schema.org/StrikethroughPrice">',
                '<data itemprop="price" value="2699.00">2 699</data>',
                '</div>',
                '<data itemprop="price" content="2099.00">2 099</data>',
                '<meta itemprop="priceCurrency" content="UAH">',
                '</div>',
                '</div>',
                '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Related</span></div>',
                '</body>'
            ].join('')
        );

        assert.deepEqual(signals.itemprops, [
            {
                prop: 'name',
                content: null,
                text: 'Kettle &amp; Co',
                inOffer: false
            },
            { prop: 'image', content: '/a.jpg', text: null, inOffer: false },
            { prop: 'price', content: '2099.00', text: '2 099', inOffer: true },
            {
                prop: 'priceCurrency',
                content: 'UAH',
                text: null,
                inOffer: true
            }
        ]);
    });

    it('skips titles inside inline SVG and keeps the first page title', async () => {
        const signals = await collect(
            worker,
            '<html><body><svg><title>Icon</title></svg><title>Page</title><title>Second</title></body></html>'
        );

        assert.equal(signals.titleTag, 'Page');
    });

    it('decodes a windows-1251 page from its declared charset', async () => {
        const response = await worker.fetch('/', {
            method: 'POST',
            body: new Uint8Array(WINDOWS_1251_TITLE),
            headers: {
                [PAGE_CONTENT_TYPE_HEADER]: 'text/html; charset=windows-1251'
            }
        });
        const signals = (await response.json()) as PageSignals;

        assert.equal(signals.titleTag, 'Аб');
    });

    it('stops at the HTML byte cap and keeps what it already read', async () => {
        const response = await worker.fetch(OVERSIZED_PATH, { method: 'POST' });
        const signals = (await response.json()) as PageSignals;

        assert.equal(signals.truncated, true);
        assert.deepEqual(signals.jsonLd, ['{"@type":"Product","name":"Big"}']);
    });
});
