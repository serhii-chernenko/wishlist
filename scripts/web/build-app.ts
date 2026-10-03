import fs from 'node:fs';
import zlib from 'node:zlib';

import { build } from 'esbuild';

const OUTPUT_FILE = 'public/app/app.js';
const MAX_MINIFIED_BYTES = 120 * 1024;
const MAX_GZIP_BYTES = 40 * 1024;

const buildApp = async () => {
    await build({
        entryPoints: ['src/app/main.tsx'],
        outfile: OUTPUT_FILE,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: ['es2020', 'safari15', 'chrome100'],
        minify: true,
        jsx: 'automatic',
        jsxImportSource: 'hono/jsx/dom',
        tsconfig: 'tsconfig.app.json',
        legalComments: 'none',
        charset: 'utf8',
        metafile: true,
        logLevel: 'warning'
    });

    const bundle = fs.readFileSync(OUTPUT_FILE);
    const gzipBytes = zlib.gzipSync(bundle, { level: 9 }).length;

    if (bundle.length > MAX_MINIFIED_BYTES || gzipBytes > MAX_GZIP_BYTES) {
        throw new Error(
            `${OUTPUT_FILE} is over budget: ${bundle.length} bytes minified (max ${MAX_MINIFIED_BYTES}), ${gzipBytes} bytes gzip (max ${MAX_GZIP_BYTES})`
        );
    }

    console.log(
        `${OUTPUT_FILE}: ${bundle.length} bytes minified, ${gzipBytes} bytes gzip`
    );
};

buildApp().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
