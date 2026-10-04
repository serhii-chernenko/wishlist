import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const FORBIDDEN_SOURCE_DIRECTORIES = ['src/db', 'src/worker', 'src/api'];
const FORBIDDEN_PACKAGES = ['telegraf', 'effect', 'drizzle-orm'];
const CLIENT_BUNDLED_BOT_FILES = [
    'src/bot/input/title.ts',
    'src/bot/input/description.ts',
    'src/bot/input/link.ts',
    'src/bot/input/price.ts',
    'src/bot/input/limits.ts',
    'src/bot/input/remove-command.ts',
    'src/bot/content/intl.ts'
];
const IMPORT_SPECIFIER_PATTERNS = [
    /\bimport\s+(?!type\b)[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?!type\b)[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
];
const TYPE_AWARE_IMPORT_PATTERNS = [
    /\bimport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    ...IMPORT_SPECIFIER_PATTERNS.slice(2)
];
const BROWSER_GLOBALS = /\b(window|document|Telegram)\b/;
const STYLE_PROP = /\bstyle\s*=|setAttribute\(\s*['"]style['"]/;

const listSourceFiles = (directory: string): string[] => {
    const absolute = path.join(REPOSITORY_ROOT, directory);

    if (!existsSync(absolute)) {
        return [];
    }

    return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
        const relative = path.posix.join(directory, entry.name);

        if (entry.isDirectory()) {
            return listSourceFiles(relative);
        }

        return SOURCE_EXTENSIONS.test(entry.name) ? [relative] : [];
    });
};

const readImportSpecifiers = (source: string, includeTypeOnly: boolean) => {
    const patterns = includeTypeOnly
        ? TYPE_AWARE_IMPORT_PATTERNS
        : IMPORT_SPECIFIER_PATTERNS;

    return patterns.flatMap(pattern => {
        return Array.from(source.matchAll(pattern), match => {
            return match[1] ?? '';
        });
    });
};

const findForbiddenImports = (file: string, specifiers: string[]) => {
    return specifiers.filter(specifier => {
        if (specifier.startsWith('.')) {
            const target = path.posix.normalize(
                path.posix.join(path.posix.dirname(file), specifier)
            );

            return FORBIDDEN_SOURCE_DIRECTORIES.some(directory => {
                return (
                    target === directory || target.startsWith(`${directory}/`)
                );
            });
        }

        return FORBIDDEN_PACKAGES.some(name => {
            return specifier === name || specifier.startsWith(`${name}/`);
        });
    });
};

const readSource = (file: string) => {
    return readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8');
};

test('the import scanner finds relative and package violations', () => {
    const source = [
        "import { Effect } from 'effect';",
        "import type { Db } from '../../db/client';",
        "import { createDb } from '../../db/client';",
        "export { run } from '../../worker/app';",
        "import 'telegraf/format';",
        "const lazy = import('drizzle-orm/d1');",
        "import { ok } from './logic/ok';"
    ].join('\n');
    const runtime = findForbiddenImports(
        'src/app/screens/x.ts',
        readImportSpecifiers(source, false)
    );
    const everything = findForbiddenImports(
        'src/app/screens/x.ts',
        readImportSpecifiers(source, true)
    );

    assert.deepEqual([...runtime].sort(), [
        '../../db/client',
        '../../worker/app',
        'drizzle-orm/d1',
        'effect',
        'telegraf/format'
    ]);
    assert.equal(everything.length, runtime.length + 1);
});

test('client and shared code never import the server side', () => {
    const files = [
        ...listSourceFiles('src/app'),
        ...listSourceFiles('src/shared')
    ];

    for (const file of files) {
        assert.deepEqual(
            findForbiddenImports(
                file,
                readImportSpecifiers(readSource(file), true)
            ),
            [],
            file
        );
    }
});

test('the validators bundled into the client import no server code at runtime', () => {
    for (const file of CLIENT_BUNDLED_BOT_FILES.filter(candidate => {
        return existsSync(path.join(REPOSITORY_ROOT, candidate));
    })) {
        assert.deepEqual(
            findForbiddenImports(
                file,
                readImportSpecifiers(readSource(file), false)
            ),
            [],
            file
        );
    }
});

test('DOM free logic never touches window, document or Telegram', () => {
    assert.match('const a = window.x', BROWSER_GLOBALS);
    assert.match('Telegram.WebApp', BROWSER_GLOBALS);
    assert.doesNotMatch('const documented = 1', BROWSER_GLOBALS);

    for (const file of listSourceFiles('src/app/logic')) {
        assert.doesNotMatch(readSource(file), BROWSER_GLOBALS, file);
    }
});

test('app code never sets an inline style, which the CSP would block', () => {
    assert.match('<div style={{ a: 1 }} />', STYLE_PROP);
    assert.match("el.setAttribute('style', 'a:b')", STYLE_PROP);
    assert.doesNotMatch('const lifestyle = 1;', STYLE_PROP);

    for (const file of listSourceFiles('src/app')) {
        assert.doesNotMatch(readSource(file), STYLE_PROP, file);
    }
});
