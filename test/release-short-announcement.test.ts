import assert from 'node:assert/strict';
import test from 'node:test';

import shortAnnouncementConfig from '../releases.announcements.json';
import { getAvailableLanguageCodes } from '../src/bot/i18n';
import { getReleases } from '../src/bot/content/releases';
import {
    findShortAnnouncementProblems,
    getShortAnnouncement,
    measureCaptionLength,
    readShortAnnouncement,
    SHORT_ANNOUNCEMENT_MAX_LENGTH,
    TELEGRAM_CAPTION_LIMIT
} from '../src/bot/content/release-short-announcement';

const validEntry = { uk: '<b>Так</b>', en: '<i>Yes</i>', pl: 'Tak' };

test('the committed short announcements have no problems', () => {
    assert.deepEqual(
        findShortAnnouncementProblems(shortAnnouncementConfig),
        []
    );
});

test('every committed short announcement belongs to a known release', () => {
    const versions = getReleases().map(release => release.version);

    for (const version of Object.keys(shortAnnouncementConfig)) {
        assert.ok(versions.includes(version), version);
    }
});

test('the limit leaves room under the Telegram caption limit', () => {
    assert.ok(SHORT_ANNOUNCEMENT_MAX_LENGTH < TELEGRAM_CAPTION_LIMIT);
});

test('the committed texts fit the caption limit as Telegram counts them', () => {
    for (const [version, entry] of Object.entries(shortAnnouncementConfig)) {
        for (const locale of getAvailableLanguageCodes()) {
            const length = measureCaptionLength(entry[locale]);

            assert.ok(
                length <= SHORT_ANNOUNCEMENT_MAX_LENGTH,
                `${version} ${locale}`
            );
        }
    }
});

test('caption length ignores tags, decodes entities and counts UTF-16 code units', () => {
    assert.equal(measureCaptionLength('<b>ab</b><i>c</i>'), 3);
    assert.equal(
        measureCaptionLength('a &lt; b &amp; c &gt; &quot;d&quot;'),
        15
    );
    assert.equal(measureCaptionLength('🎉'), 2);
    assert.equal(measureCaptionLength('ща'), 2);
});

test('a valid entry passes validation', () => {
    assert.deepEqual(
        findShortAnnouncementProblems({ '2.1.0': validEntry }),
        []
    );
    assert.deepEqual(findShortAnnouncementProblems({}), []);
});

test('a text over the limit is rejected', () => {
    const tooLong = 'a'.repeat(SHORT_ANNOUNCEMENT_MAX_LENGTH + 1);
    const atLimit = 'a'.repeat(SHORT_ANNOUNCEMENT_MAX_LENGTH);

    assert.deepEqual(
        findShortAnnouncementProblems({
            '2.1.0': { ...validEntry, uk: atLimit }
        }),
        []
    );
    assert.match(
        findShortAnnouncementProblems({
            '2.1.0': { ...validEntry, en: tooLong }
        }).join('\n'),
        /2\.1\.0: en: the caption is 1001 characters/
    );
});

test('tags do not count towards the limit but emoji count twice', () => {
    const body = 'a'.repeat(SHORT_ANNOUNCEMENT_MAX_LENGTH - 2);

    assert.deepEqual(
        findShortAnnouncementProblems({
            '2.1.0': { ...validEntry, uk: `<b>${body}</b>🎉` }
        }),
        []
    );
    assert.equal(
        findShortAnnouncementProblems({
            '2.1.0': { ...validEntry, uk: `<b>${body}</b>🎉a` }
        }).length,
        1
    );
});

test('missing locales and unknown locales are rejected', () => {
    assert.match(
        findShortAnnouncementProblems({
            '2.1.0': { uk: 'a', en: 'b' }
        }).join('\n'),
        /pl: missing/
    );
    assert.match(
        findShortAnnouncementProblems({
            '2.1.0': { ...validEntry, de: 'x' }
        }).join('\n'),
        /unknown locale "de"/
    );
    assert.match(
        findShortAnnouncementProblems({
            '2.1.0': { ...validEntry, pl: '  ' }
        }).join('\n'),
        /pl: the text must be a non-empty string/
    );
});

test('tags other than b and i are rejected', () => {
    for (const html of [
        '<a href="https://example.com">x</a>',
        '<u>x</u>',
        '<code>x</code>',
        '<script>x</script>'
    ]) {
        assert.ok(
            findShortAnnouncementProblems({
                '2.1.0': { ...validEntry, uk: html }
            }).length > 0,
            html
        );
    }
});

test('unbalanced markup and raw angle brackets or ampersands are rejected', () => {
    for (const html of [
        '<b>x',
        'x</b>',
        '<b><i>x</b></i>',
        'a < b',
        'a & b',
        'a &nbsp; b'
    ]) {
        assert.ok(
            findShortAnnouncementProblems({
                '2.1.0': { ...validEntry, uk: html }
            }).length > 0,
            html
        );
    }
});

test('a version key must be a release version', () => {
    assert.match(
        findShortAnnouncementProblems({ latest: validEntry }).join('\n'),
        /latest: the key must be a release version/
    );
    assert.deepEqual(findShortAnnouncementProblems([]), [
        'The short announcement config must be a JSON object'
    ]);
});

test('the reader returns the text of the locale for a valid entry', () => {
    const config = { '2.1.0': validEntry };

    assert.equal(readShortAnnouncement(config, '2.1.0', 'uk'), validEntry.uk);
    assert.equal(readShortAnnouncement(config, '2.1.0', 'en'), validEntry.en);
    assert.equal(readShortAnnouncement(config, '2.1.0', 'pl'), validEntry.pl);
});

test('the reader falls back to uk for a locale without a text', () => {
    const config = { '2.1.0': validEntry };

    assert.equal(
        readShortAnnouncement(config, '2.1.0', 'de' as never),
        validEntry.uk
    );
});

test('the reader ignores missing and invalid entries', () => {
    assert.equal(readShortAnnouncement({}, '2.1.0', 'uk'), null);
    assert.equal(readShortAnnouncement(null, '2.1.0', 'uk'), null);
    assert.equal(
        readShortAnnouncement({ '2.1.0': { uk: 'a' } }, '2.1.0', 'uk'),
        null
    );
    assert.equal(
        readShortAnnouncement(
            { '2.1.0': { ...validEntry, en: '<u>x</u>' } },
            '2.1.0',
            'uk'
        ),
        null
    );
    assert.equal(
        readShortAnnouncement(shortAnnouncementConfig, '0.0.1', 'uk'),
        null
    );
});

test('the bundled 2.0.0 announcement is available in every locale', () => {
    for (const locale of getAvailableLanguageCodes()) {
        const text = getShortAnnouncement('2.0.0', locale) ?? '';

        assert.ok(text.startsWith('<b>'), locale);
        assert.ok(text.includes('/releases'), locale);
    }
});
