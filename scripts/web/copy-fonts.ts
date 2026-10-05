import fs from 'node:fs';
import path from 'node:path';

const FONT_SOURCES = {
    unbounded: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext'],
    commissioner: ['cyrillic', 'latin', 'latin-ext']
} as const;

const OUTPUT_DIRECTORY = path.join('public', 'fonts');

const sourceFileName = (family: string, subset: string) => {
    return `${family}-${subset}-wght-normal.woff2`;
};

fs.rmSync(OUTPUT_DIRECTORY, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

for (const [family, subsets] of Object.entries(FONT_SOURCES)) {
    for (const subset of subsets) {
        const fileName = sourceFileName(family, subset);

        fs.copyFileSync(
            path.join(
                'node_modules',
                '@fontsource-variable',
                family,
                'files',
                fileName
            ),
            path.join(OUTPUT_DIRECTORY, fileName)
        );
    }
}
