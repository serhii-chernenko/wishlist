import assert from 'node:assert/strict';
import test from 'node:test';

import {
    hasSavedWishesNote,
    LIST_IMPORT_URL_MAX_LENGTH,
    parseListImportUrl,
    suggestListImportVisibility
} from '../src/shared/list-import-url';

const wishes = (slug: string, accessCode?: string) => {
    return {
        source: 'rewish',
        kind: 'wishes',
        slug,
        ...(accessCode === undefined ? {} : { accessCode }),
        url: `https://rewish.io/${slug}/wishes${
            accessCode === undefined ? '' : `?access_code=${accessCode}`
        }`
    };
};

test('profile links resolve to the wishes kind with a canonical url', () => {
    for (const raw of [
        'https://rewish.io/tESt01',
        'https://rewish.io/tESt01/',
        'https://rewish.io/tESt01/wishes',
        'https://rewish.io/tESt01/wishes/'
    ]) {
        assert.deepEqual(parseListImportUrl(raw), wishes('tESt01'), raw);
    }
});

test('collection links keep the id and the access code', () => {
    assert.deepEqual(
        parseListImportUrl(
            'https://rewish.io/tESt01/collection/123456?access_code=test-access-code'
        ),
        {
            source: 'rewish',
            kind: 'collection',
            slug: 'tESt01',
            collectionId: 123456,
            accessCode: 'test-access-code',
            url: 'https://rewish.io/tESt01/collection/123456?access_code=test-access-code'
        }
    );
});

test('www, a missing scheme and http are upgraded to https on rewish.io', () => {
    for (const raw of [
        'www.rewish.io/tESt01/wishes',
        'rewish.io/tESt01',
        'http://rewish.io/tESt01/wishes',
        'http://www.rewish.io/tESt01',
        '  HTTPS://REWISH.IO/tESt01/wishes  '
    ]) {
        assert.deepEqual(parseListImportUrl(raw), wishes('tESt01'), raw);
    }
});

test('tracking parameters and the hash are dropped but the access code stays', () => {
    assert.deepEqual(
        parseListImportUrl(
            'https://rewish.io/tESt01/wishes?utm_source=tg&access_code=test~code&fbclid=1#top'
        ),
        wishes('tESt01', 'test~code')
    );
});

test('the access code charset and length are enforced', () => {
    for (const code of ['a'.repeat(64), 'A.b_c-d~e']) {
        assert.equal(
            parseListImportUrl(`https://rewish.io/tESt01?access_code=${code}`)
                ?.accessCode,
            code
        );
    }

    for (const code of [
        '',
        'a'.repeat(65),
        'bad code',
        'bad%24code',
        'bad<code',
        'bad/code'
    ]) {
        assert.equal(
            parseListImportUrl(`https://rewish.io/tESt01?access_code=${code}`),
            null,
            code
        );
    }
});

test('hosts other than rewish.io are rejected', () => {
    for (const raw of [
        'https://evil.example/tESt01',
        'https://rewish.io.evil.example/tESt01',
        'https://evilrewish.io/tESt01',
        'https://sub.rewish.io/tESt01',
        'https://rewish.io@evil.example/tESt01',
        'https://user:pass@rewish.io/tESt01',
        'https://rewish.io:8443/tESt01',
        'https://127.0.0.1/tESt01',
        'ftp://rewish.io/tESt01',
        'javascript:alert(1)',
        'mailto:someone@rewish.io',
        ''
    ]) {
        assert.equal(parseListImportUrl(raw), null, raw);
    }
});

test('slugs outside the charset or length and unknown paths are rejected', () => {
    for (const raw of [
        'https://rewish.io/',
        'https://rewish.io',
        'https://rewish.io/a',
        `https://rewish.io/${'a'.repeat(65)}`,
        'https://rewish.io/bad slug',
        'https://rewish.io/bad.slug',
        'https://rewish.io/%71%35sEAA',
        'https://rewish.io//tESt01',
        'https://rewish.io/tESt01//wishes',
        'https://rewish.io/tESt01/profile',
        'https://rewish.io/tESt01/wishes/1',
        'https://rewish.io/tESt01/collection',
        'https://rewish.io/tESt01/collection/abc',
        'https://rewish.io/tESt01/collection/0',
        'https://rewish.io/tESt01/collection/012',
        'https://rewish.io/tESt01/collection/1234567890123',
        'https://rewish.io/tESt01/collection/12/extra',
        'https://rewish.io/tESt01/collection/12.5'
    ]) {
        assert.equal(parseListImportUrl(raw), null, raw);
    }
});

test('overlong input is rejected before parsing', () => {
    assert.equal(
        parseListImportUrl(
            `https://rewish.io/tESt01?x=${'a'.repeat(LIST_IMPORT_URL_MAX_LENGTH)}`
        ),
        null
    );
});

test('a link with an access code suggests hidden wishes and a plain link public ones', () => {
    const plain = parseListImportUrl('https://rewish.io/tESt01');
    const coded = parseListImportUrl(
        'https://rewish.io/tESt01/wishes?access_code=test~code'
    );
    const collection = parseListImportUrl(
        'https://rewish.io/tESt01/collection/123456?access_code=test-access-code'
    );

    assert.ok(plain && coded && collection);
    assert.equal(suggestListImportVisibility(plain), 'public');
    assert.equal(suggestListImportVisibility(coded), 'hidden');
    assert.equal(suggestListImportVisibility(collection), 'hidden');
});

test('the saved wishes note applies to profile links with an access code only', () => {
    const plain = parseListImportUrl('https://rewish.io/tESt01');
    const coded = parseListImportUrl(
        'https://rewish.io/tESt01/wishes?access_code=test~code'
    );
    const collection = parseListImportUrl(
        'https://rewish.io/tESt01/collection/123456?access_code=test-access-code'
    );

    assert.ok(plain && coded && collection);
    assert.equal(hasSavedWishesNote(plain), false);
    assert.equal(hasSavedWishesNote(coded), true);
    assert.equal(hasSavedWishesNote(collection), false);
});
