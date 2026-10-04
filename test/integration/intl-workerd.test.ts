import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { unstable_dev, type Unstable_DevWorker } from 'wrangler';

import {
    formatCurrency,
    formatDate,
    formatNumber
} from '../../src/bot/content/intl';

const intlModulePath = path.resolve(process.cwd(), 'src/bot/content/intl.ts');
const compatibilityDate = '2026-05-09';
const sampleTimestamp = Date.UTC(2026, 9, 2, 22, 30);

interface IntlSample {
    currencyUk: string;
    currencyEn: string;
    currencyPl: string;
    currencyUsd: string;
    numberUk: string;
    dateUk: string;
    dateEn: string;
    datePl: string;
}

const workerEntry = `
import { formatCurrency, formatDate, formatNumber } from ${JSON.stringify(intlModulePath)};

export default {
    fetch() {
        const date = new Date(${sampleTimestamp});

        return Response.json({
            currencyUk: formatCurrency(1000, 'uk'),
            currencyEn: formatCurrency(1000, 'en'),
            currencyPl: formatCurrency(1000, 'pl'),
            currencyUsd: formatCurrency(1500.5, 'uk', 'USD'),
            numberUk: formatNumber(1234567, 'uk'),
            dateUk: formatDate(date, 'uk'),
            dateEn: formatDate(date, 'en'),
            datePl: formatDate(date, 'pl')
        });
    }
};
`;

describe('Intl formatting under workerd', () => {
    let worker: Unstable_DevWorker;
    let probeDirectory: string;
    let sample: IntlSample;

    before(async () => {
        probeDirectory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'wishlist-intl-workerd-')
        );

        const entryPath = path.join(probeDirectory, 'entry.ts');
        const configPath = path.join(probeDirectory, 'wrangler.jsonc');

        fs.writeFileSync(entryPath, workerEntry);
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                name: 'wishlist-intl-probe',
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

        const response = await worker.fetch('/');

        sample = (await response.json()) as IntlSample;
    });

    after(async () => {
        await worker?.stop();
        fs.rmSync(probeDirectory, { recursive: true, force: true });
    });

    it('renders Ukrainian hryvnia amounts with the Ukrainian grouping', () => {
        assert.match(sample.currencyUk, /^1\s000,00\s₴$/);
    });

    it('renders the hryvnia sign for Ukrainian currency', () => {
        assert.ok(sample.currencyUk.includes('₴'), sample.currencyUk);
        assert.equal(sample.currencyUk.includes('грн'), false);
    });

    it('matches the Node output for the other currencies and numbers', () => {
        assert.equal(sample.currencyEn, formatCurrency(1000, 'en'));
        assert.equal(sample.currencyPl, formatCurrency(1000, 'pl'));
        assert.equal(sample.currencyUsd, formatCurrency(1500.5, 'uk', 'USD'));
        assert.equal(sample.numberUk, formatNumber(1_234_567, 'uk'));
    });

    it('uses the narrow currency symbol in every language', () => {
        assert.ok(sample.currencyEn.includes('₴'), sample.currencyEn);
        assert.ok(sample.currencyPl.includes('₴'), sample.currencyPl);
        assert.ok(sample.currencyUsd.includes('$'), sample.currencyUsd);
    });

    it('renders Ukrainian month names', () => {
        assert.match(sample.dateUk, /жовтня/);
        assert.match(sample.dateUk, /2026/);
    });

    it('renders English and Polish month names', () => {
        assert.match(sample.dateEn, /October/);
        assert.match(sample.datePl, /października/);
    });

    it('formats dates in Europe/Kyiv, not UTC', () => {
        assert.match(sample.dateEn, /^3 October 2026$/);
        assert.equal(
            sample.dateUk,
            formatDate(new Date(sampleTimestamp), 'uk')
        );
    });
});
