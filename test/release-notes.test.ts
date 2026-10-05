import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseChangelog } from '../scripts/releases/changelog-parser';
import {
    getLatestRelease,
    getLatestReleaseVersion,
    getReleaseItemText,
    normalizeReleaseRecords,
    renderReleaseAnnouncement,
    renderReleaseNotes,
    TELEGRAM_MESSAGE_LIMIT,
    type ReleaseRecord
} from '../src/bot/content/releases';

const trilingualRelease: ReleaseRecord = {
    version: '2.0.0',
    date: '29.09.2026',
    groups: {
        added: [
            {
                uk: 'Нова команда /lang.',
                en: 'New /lang command.',
                pl: 'Nowe polecenie /lang.'
            },
            { uk: 'Тільки українською.' },
            { uk: 'Українською та англійською.', en: 'English as well.' }
        ],
        notes: [{ uk: 'Нотатка', en: 'A note', pl: 'Notatka' }]
    }
};

test('the latest release matches the first changelog entry', () => {
    const [first] = parseChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'));
    const latest = getLatestRelease();
    const items = Object.values(latest?.groups ?? {}).flat();

    assert.equal(latest?.version, first?.version);
    assert.equal(getLatestReleaseVersion(), first?.version);
    assert.ok(items.length > 0);
    assert.ok(items.every(item => item.uk.length > 0));
});

test('release items fall back to Ukrainian when a translation is missing', () => {
    const item = { uk: 'uk', en: 'en', pl: 'pl' };

    assert.equal(getReleaseItemText(item, 'uk'), 'uk');
    assert.equal(getReleaseItemText(item, 'en'), 'en');
    assert.equal(getReleaseItemText(item, 'pl'), 'pl');
    assert.equal(getReleaseItemText({ uk: 'uk', en: 'en' }, 'pl'), 'uk');
    assert.equal(getReleaseItemText({ uk: 'uk' }, 'en'), 'uk');
});

test('legacy string items normalize to Ukrainian-only items', () => {
    const [record] = normalizeReleaseRecords([
        {
            version: '1.0.0',
            date: '01.01.2020',
            groups: { notes: ['Перша версія'] }
        }
    ]);

    assert.deepEqual(record?.groups.notes, [{ uk: 'Перша версія' }]);
});

test('the announcement uses Ukrainian text and headings for uk users', () => {
    const rendered = renderReleaseAnnouncement(trilingualRelease, 'uk');

    assert.match(rendered, /Бот оновлено до версії 2\.0\.0 🎉/);
    assert.match(rendered, /29\.09\.2026/);
    assert.match(rendered, /<b>Додано<\/b>/);
    assert.match(rendered, /- Нова команда \/lang\./);
    assert.match(rendered, /Нотатка/);
    assert.match(rendered, /\/releases/);
    assert.doesNotMatch(rendered, /New \/lang command/);
});

test('the announcement uses English text and headings for en users', () => {
    const rendered = renderReleaseAnnouncement(trilingualRelease, 'en');

    assert.match(rendered, /The bot is now on version 2\.0\.0 🎉/);
    assert.match(rendered, /<b>Added<\/b>/);
    assert.match(rendered, /- New \/lang command\./);
    assert.match(rendered, /- Тільки українською\./);
    assert.match(rendered, /- English as well\./);
    assert.match(rendered, /A note/);
    assert.match(rendered, /\/releases/);
});

test('the announcement uses Polish item text for pl users', () => {
    const rendered = renderReleaseAnnouncement(trilingualRelease, 'pl');

    assert.match(rendered, /- Nowe polecenie \/lang\./);
    assert.match(rendered, /- Тільки українською\./);
    assert.match(rendered, /- Українською та англійською\./);
    assert.match(rendered, /Notatka/);
});

test('release notes and announcements escape HTML in item text', () => {
    const release: ReleaseRecord = {
        version: '2.0.1',
        date: '01.10.2026',
        groups: { fixed: [{ uk: 'a <b>bold</b> & "quoted"' }] }
    };

    for (const rendered of [
        renderReleaseAnnouncement(release, 'uk'),
        renderReleaseNotes(0, 'uk')
    ]) {
        assert.doesNotMatch(rendered, /a <b>bold<\/b>/);
    }

    assert.match(
        renderReleaseAnnouncement(release, 'uk'),
        /a &lt;b&gt;bold&lt;\/b&gt; &amp; &quot;quoted&quot;/
    );
});

test('/releases limits the number of releases and respects the locale', () => {
    const all = renderReleaseNotes(0, 'uk');
    const newest = renderReleaseNotes(1, 'uk');
    const latestVersion = getLatestReleaseVersion();

    assert.ok(newest.length < all.length);
    assert.match(newest, new RegExp(latestVersion.replaceAll('.', '\\.')));
    assert.match(all, /<b>Додано<\/b>/);
    assert.match(renderReleaseNotes(0, 'en'), /<b>Added<\/b>/);
});

test('oversized announcements are truncated below the Telegram limit', () => {
    const release: ReleaseRecord = {
        version: '9.9.9',
        date: '01.01.2030',
        groups: {
            added: Array.from({ length: 200 }, (_value, index) => {
                return { uk: `Пункт ${index} & ${'слово '.repeat(20)}` };
            }),
            notes: [{ uk: 'Ніколи не показується' }]
        }
    };

    for (const locale of ['uk', 'en', 'pl'] as const) {
        const rendered = renderReleaseAnnouncement(release, locale);

        assert.ok(rendered.length <= TELEGRAM_MESSAGE_LIMIT);
        assert.match(rendered, /…/);
        assert.match(rendered, /\/releases/);
        assert.doesNotMatch(rendered, /Ніколи не показується/);
        assert.doesNotMatch(rendered, /&(?![a-z#0-9]+;)/i);
    }
});

test('a single oversized item is cut instead of dropped', () => {
    const release: ReleaseRecord = {
        version: '9.9.9',
        date: '01.01.2030',
        groups: { added: [{ uk: 'x'.repeat(10_000) }] }
    };
    const rendered = renderReleaseAnnouncement(release, 'uk');

    assert.ok(rendered.length <= TELEGRAM_MESSAGE_LIMIT);
    assert.match(rendered, /xxxx…/);
});

test('short announcements are not truncated', () => {
    const rendered = renderReleaseAnnouncement(trilingualRelease, 'uk');

    assert.doesNotMatch(rendered, /…/);
});
