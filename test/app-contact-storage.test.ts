import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { Route } from '../src/app/logic/nav';
import {
    parseStoredRoute,
    serializeNavSnapshot
} from '../src/app/logic/nav-persistence';

const APP_ROOT = fileURLToPath(new URL('../src/app', import.meta.url));
const STORAGE_ACCESS =
    /sessionStorage|localStorage|CloudStorage|indexedDB|\.setItem\(|document\.cookie/;
const STORAGE_WRITERS = new Set(['nav/persistence.ts', 'telegram/theme.ts']);
const STORAGE_DECLARATIONS = new Set(['telegram/types.ts']);
const PRIVATE_FIELDS =
    /\bme\b|contact|deliveryAddress|phoneMasked|payments|disclosure|phone/i;

const listSourceFiles = (directory: string): string[] => {
    return readdirSync(directory).flatMap(name => {
        const path = join(directory, name);

        if (statSync(path).isDirectory()) {
            return listSourceFiles(path);
        }

        return /\.tsx?$/.test(name) ? [path] : [];
    });
};

const SOURCES = listSourceFiles(APP_ROOT).map(path => {
    return {
        file: relative(APP_ROOT, path).split('\\').join('/'),
        text: readFileSync(path, 'utf8')
    };
});

describe('Mini App client storage never holds contact details', () => {
    it('touches browser or Telegram storage only from the known writers', () => {
        const touching = SOURCES.filter(source => {
            return STORAGE_ACCESS.test(source.text);
        }).map(source => {
            return source.file;
        });

        assert.deepEqual(
            touching.sort(),
            [...STORAGE_WRITERS, ...STORAGE_DECLARATIONS].sort()
        );
    });

    it('keeps the writers free of me, contact, address, phone and payments', () => {
        for (const source of SOURCES) {
            if (STORAGE_WRITERS.has(source.file)) {
                assert.doesNotMatch(source.text, PRIVATE_FIELDS, source.file);
            }
        }
    });

    it('strips payments and contact from the stored navigation snapshot', () => {
        const route: Route = {
            screen: 'thirdList',
            source: {
                kind: 'owner',
                owner: {
                    token: 'token.value.signature',
                    label: '@olena',
                    payments: 'Jar payments-secret',
                    contact: {
                        phone: '+380 99 753 18 64',
                        phoneHref: 'tel:+380997531864',
                        address: 'Qzvrlockerx 4471'
                    },
                    source: 'search',
                    canGive: true
                }
            }
        };
        const stored = serializeNavSnapshot([route], 'launch');

        for (const secret of [
            'payments-secret',
            '380997531864',
            '753 18 64',
            'Qzvrlockerx',
            'contact',
            'payments'
        ]) {
            assert.ok(!stored.includes(secret), secret);
        }

        const [restored] = (JSON.parse(stored) as { routes: unknown[] }).routes;
        const parsed = parseStoredRoute(restored);

        assert.ok(parsed?.screen === 'thirdList');
        assert.ok(parsed.source.kind === 'owner');
        assert.equal(parsed.source.owner.contact, null);
        assert.equal(parsed.source.owner.payments, null);
    });
});
