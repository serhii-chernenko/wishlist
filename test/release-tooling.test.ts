import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseChangelog } from '../scripts/releases/changelog-parser';
import { validateChangesetBody } from '../scripts/releases/changeset-validator';
import {
    FIRST_AUTOMATIC_VERSION,
    findRelease,
    getReleaseTitle,
    parseGithubReleaseArguments,
    publishGithubReleases,
    renderGithubReleaseNotes,
    type GithubCli
} from '../scripts/releases/github-release';

const changelog = `# wishlist

## 2.0.0 - 29.09.2026

### Major Changes

- [updated] Українською
  - en: In English
  - pl: Po polsku
- [updated] Лише українською
- [added] Лише з англійською
  - en: Only English
- [notes] Багаторядкова
  примітка
  - pl: Wielowierszowa
    notatka
  - en: Multi-line
    note

## 1.7.1 - 17.08.2024

### Patch Changes

- [notes] Сьогодні в мене день народження

    Привітати мене можна

    Дякую!
`;

test('changelog parser reads every translation of an item', () => {
    const [release] = parseChangelog(changelog);

    assert.equal(release?.version, '2.0.0');
    assert.equal(release?.date, '29.09.2026');
    assert.deepEqual(release?.groups.updated, [
        { uk: 'Українською', en: 'In English', pl: 'Po polsku' },
        { uk: 'Лише українською' }
    ]);
    assert.deepEqual(release?.groups.added, [
        { uk: 'Лише з англійською', en: 'Only English' }
    ]);
    assert.deepEqual(release?.groups.notes, [
        {
            uk: 'Багаторядкова\nпримітка',
            en: 'Multi-line\nnote',
            pl: 'Wielowierszowa\nnotatka'
        }
    ]);
});

test('changelog parser keeps history without translation keys', () => {
    const legacy = parseChangelog(changelog)[1];
    const [note] = legacy?.groups.notes ?? [];

    assert.equal(legacy?.version, '1.7.1');
    assert.equal(legacy?.groups.notes?.length, 1);
    assert.deepEqual(Object.keys(note ?? {}), ['uk']);
    assert.match(note?.uk ?? '', /^Сьогодні в мене/);
    assert.match(note?.uk ?? '', /\nПривітати мене можна\n/);
    assert.match(note?.uk ?? '', /Дякую!$/);
});

test('changelog parser understands the raw changesets bullet shape', () => {
    const raw = `## 6.0.0 - 01.01.2027

### Major Changes

-   abc1234: - [added] Перше
    -   en: First
    -   pl: Pierwsze
    -   [fixed] Друге
        -   en: Second
        -   pl: Drugie
`;
    const [release] = parseChangelog(raw);

    assert.deepEqual(release?.groups.added, [
        { uk: 'Перше', en: 'First', pl: 'Pierwsze' }
    ]);
    assert.deepEqual(release?.groups.fixed, [
        { uk: 'Друге', en: 'Second', pl: 'Drugie' }
    ]);
});

test('changelog parser splits the first bullet that changesets flattens onto one line', () => {
    const flattened = `## 6.0.0 - 01.01.2027

### Major Changes

- abc1234: - [added] Перше - en: First - pl: Pierwsze
  - [fixed] Друге
    - en: Second
    - pl: Drugie
`;
    const [release] = parseChangelog(flattened);

    assert.deepEqual(release?.groups.added, [
        { uk: 'Перше', en: 'First', pl: 'Pierwsze' }
    ]);
    assert.deepEqual(release?.groups.fixed, [
        { uk: 'Друге', en: 'Second', pl: 'Drugie' }
    ]);
});

test('changelog parser orders groups and requires release dates', () => {
    const [release] = parseChangelog(
        '## 1.0.0 - 01.01.2020\n\n- [notes] n\n- [added] a\n'
    );

    assert.deepEqual(Object.keys(release?.groups ?? {}), ['added', 'notes']);
    assert.throws(() => parseChangelog('## 1.0.0\n'), /Missing release date/);
});

test('the committed changelog parses into the committed manifest', () => {
    const parsed = parseChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'));
    const manifest: unknown = JSON.parse(
        fs.readFileSync('releases.generated.json', 'utf8')
    );

    assert.deepEqual(manifest, parsed);
    assert.deepEqual(parsed.map(release => release.version).slice(-6), [
        '1.7.1',
        '1.7.0',
        '1.6.0',
        '1.5.0',
        '1.4.0',
        '1.3.0'
    ]);
});

test('the pending changesets are valid', () => {
    const changesetFiles = fs
        .readdirSync('.changeset')
        .filter(name => name.endsWith('.md') && name !== 'README.md');

    for (const fileName of changesetFiles) {
        const parts = fs
            .readFileSync(`.changeset/${fileName}`, 'utf8')
            .split('---');

        assert.doesNotThrow(() => {
            validateChangesetBody(fileName, parts.slice(2).join('---'));
        });
    }
});

test('every 2.0.0 changelog item is translated into English and Polish', () => {
    const releases = parseChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'));
    const release = releases.find(entry => entry.version === '2.0.0');
    const items = Object.values(release?.groups ?? {}).flat();

    assert.equal(items.length, 10);
    assert.ok(items.every(item => item.uk && item.en && item.pl));
});

const githubReleases = parseChangelog(`# wishlist

## 2.1.0 - 30.09.2026

### Minor Changes

- [added] Нове
    - en: New
    - pl: Nowe

## 2.0.0 - 29.09.2026

### Major Changes

- [notes] Примітка
    - en: A note
    - pl: Notatka
- [added] Одне
    - en: One
- [added] Два
  друга лінія
    - en: Two
      second line
- [fixed] Лише українською

## 1.7.1 - 17.08.2024

### Patch Changes

- [notes] Староапізня примітка
`);

test('github release notes prefer English, follow group order and indent continuations', () => {
    const release = findRelease(githubReleases, '2.0.0');

    assert.equal(
        renderGithubReleaseNotes(release),
        [
            '### Added',
            '',
            '- One',
            '- Two',
            '  second line',
            '',
            '### Fixed',
            '',
            '- Лише українською',
            '',
            '### Notes',
            '',
            '- A note',
            ''
        ].join('\n')
    );
});

test('github release notes fall back to Ukrainian for legacy releases', () => {
    const release = findRelease(githubReleases, '1.7.1');

    assert.equal(
        renderGithubReleaseNotes(release),
        '### Notes\n\n- Староапізня примітка\n'
    );
});

test('github release lookup, title and arguments are strict', () => {
    assert.equal(FIRST_AUTOMATIC_VERSION, '2.0.0');
    assert.throws(() => findRelease(githubReleases, '9.9.9'), /not in/);
    assert.equal(
        getReleaseTitle(findRelease(githubReleases, '2.0.0')),
        '2.0.0 - 2026-09-29'
    );
    assert.deepEqual(
        parseGithubReleaseArguments([
            '--version',
            '2.0.0',
            '--target',
            'abc',
            '--print'
        ]),
        { version: '2.0.0', target: 'abc', print: true }
    );
    assert.deepEqual(parseGithubReleaseArguments([]), {
        version: null,
        target: null,
        print: false
    });
    assert.throws(() => parseGithubReleaseArguments(['--version']), /value/);
    assert.throws(() => parseGithubReleaseArguments(['--bogus']), /Unknown/);
});

const createFakeGithub = (existing: string[] = []) => {
    const present = new Set(existing);
    const created: { tag: string; target: string; isLatest: boolean }[] = [];
    const cli: GithubCli = {
        releaseExists: tag => {
            return present.has(tag);
        },
        createRelease: ({ tag, target, isLatest }) => {
            created.push({ tag, target, isLatest });
            present.add(tag);
        }
    };

    return { cli, created };
};

const PUBLISHING_COMMIT = 'sha-head';

const createDependencies = (cli: GithubCli) => {
    return { cli, target: PUBLISHING_COMMIT, log: () => {} };
};

test('github release publishing creates missing releases from 2.0.0 oldest first and is idempotent', () => {
    const { cli, created } = createFakeGithub();
    const dependencies = createDependencies(cli);
    const options = { version: null, target: null, print: false };

    assert.deepEqual(
        publishGithubReleases(githubReleases, options, dependencies),
        ['2.0.0', '2.1.0']
    );
    assert.deepEqual(created, [
        { tag: '2.0.0', target: PUBLISHING_COMMIT, isLatest: false },
        { tag: '2.1.0', target: PUBLISHING_COMMIT, isLatest: true }
    ]);
    assert.deepEqual(
        publishGithubReleases(githubReleases, options, dependencies),
        []
    );
    assert.equal(created.length, 2);
});

test('github release publishing skips releases that already exist', () => {
    const { cli, created } = createFakeGithub(['2.0.0']);
    const logged: string[] = [];
    const dependencies = {
        cli,
        target: PUBLISHING_COMMIT,
        log: (message: string) => {
            logged.push(message);
        }
    };

    assert.deepEqual(
        publishGithubReleases(
            githubReleases,
            { version: null, target: null, print: false },
            dependencies
        ),
        ['2.1.0']
    );
    assert.deepEqual(created, [
        { tag: '2.1.0', target: PUBLISHING_COMMIT, isLatest: true }
    ]);
    assert.deepEqual(logged, [
        'GitHub release 2.0.0 already exists; skipping.',
        'Created GitHub release 2.1.0.'
    ]);
});

test('github release publishing honors an explicit older version and target', () => {
    const { cli, created } = createFakeGithub();

    assert.deepEqual(
        publishGithubReleases(
            githubReleases,
            { version: '1.7.1', target: 'abc', print: false },
            createDependencies(cli)
        ),
        ['1.7.1']
    );
    assert.deepEqual(created, [
        { tag: '1.7.1', target: 'abc', isLatest: false }
    ]);
});
