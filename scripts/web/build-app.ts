import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

import { build, type BuildOptions } from 'esbuild';

export const OUTPUT_FILE = 'public/app/app.js';
export const MAX_MINIFIED_BYTES = 120 * 1024;
export const MAX_GZIP_BYTES = 40 * 1024;

export const APP_BUILD_OPTIONS = {
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
} as const satisfies BuildOptions;

export interface BundleSize {
    minifiedBytes: number;
    gzipBytes: number;
}

export const measureBundle = (bundle: Uint8Array): BundleSize => {
    return {
        minifiedBytes: bundle.length,
        gzipBytes: zlib.gzipSync(bundle, { level: 9 }).length
    };
};

export const isWithinBudget = ({ minifiedBytes, gzipBytes }: BundleSize) => {
    return minifiedBytes <= MAX_MINIFIED_BYTES && gzipBytes <= MAX_GZIP_BYTES;
};

export const buildAppBundle = async (options: BuildOptions = {}) => {
    const result = await build({
        ...APP_BUILD_OPTIONS,
        write: false,
        ...options
    });
    const output = result.outputFiles?.[0];

    if (!output) {
        throw new Error('esbuild produced no output for the app bundle');
    }

    return output.contents;
};

const writeAppBundle = async () => {
    const bundle = await buildAppBundle();
    const size = measureBundle(bundle);

    if (!isWithinBudget(size)) {
        throw new Error(
            `${OUTPUT_FILE} is over budget: ${size.minifiedBytes} bytes minified (max ${MAX_MINIFIED_BYTES}), ${size.gzipBytes} bytes gzip (max ${MAX_GZIP_BYTES})`
        );
    }

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, bundle);
    console.log(
        `${OUTPUT_FILE}: ${size.minifiedBytes} bytes minified, ${size.gzipBytes} bytes gzip`
    );
};

const scriptPath = process.argv[1];

if (
    scriptPath &&
    import.meta.url === pathToFileURL(path.resolve(scriptPath)).href
) {
    writeAppBundle().catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
}
