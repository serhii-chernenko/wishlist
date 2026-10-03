import assert from 'node:assert/strict';
import test from 'node:test';

import { ulid } from 'ulid';

import { generateSharePublicId } from '../src/db/schemas/wishlist-shares';
import {
    buildHomePath,
    buildHomeUrl,
    buildSharePath,
    buildShareUrl,
    isSharePageLanguage,
    parseLanguageSegment,
    isValidSharePublicId,
    normalizeSharePublicId,
    SHARE_PAGE_LANGUAGES,
    toLanguageSegment
} from '../src/web/share/public-id';

const publicId = '01k6g4z8q3m2n7p5r9s1t0v6wx';

test('generated share ids are lowercase Crockford ULIDs', () => {
    for (let index = 0; index < 200; index += 1) {
        const generated = generateSharePublicId();

        assert.equal(isValidSharePublicId(generated), true, generated);
        assert.equal(generated, generated.toLowerCase());
    }

    assert.equal(isValidSharePublicId(ulid().toLowerCase()), true);
});

test('share id validation rejects every non-canonical shape', () => {
    assert.equal(isValidSharePublicId(publicId), true);

    for (const invalid of [
        '',
        publicId.toUpperCase(),
        publicId.slice(1),
        `${publicId}0`,
        `${publicId.slice(0, 25)}i`,
        `${publicId.slice(0, 25)}l`,
        `${publicId.slice(0, 25)}o`,
        `${publicId.slice(0, 25)}u`,
        `${publicId.slice(0, 25)}-`,
        `../${publicId.slice(3)}`,
        `${publicId}\n`
    ]) {
        assert.equal(isValidSharePublicId(invalid), false, invalid);
    }
});

test('share id normalization lowercases valid ids and rejects the rest', () => {
    assert.equal(normalizeSharePublicId(publicId), publicId);
    assert.equal(normalizeSharePublicId(publicId.toUpperCase()), publicId);
    assert.equal(
        normalizeSharePublicId('01K6G4z8Q3m2n7p5R9s1t0v6WX'),
        publicId
    );
    assert.equal(normalizeSharePublicId('not-a-share-id'), null);
    assert.equal(normalizeSharePublicId(`${publicId}x`), null);
});

test('share urls use the request origin and an optional page language', () => {
    assert.equal(buildSharePath(publicId), `/w/${publicId}`);
    assert.equal(buildSharePath(publicId, 'pl'), `/pl/w/${publicId}`);
    assert.equal(
        buildShareUrl('https://wishlist.chernenko.dev', publicId),
        `https://wishlist.chernenko.dev/w/${publicId}`
    );
    assert.equal(
        buildShareUrl('https://wishlist.chernenko.dev/', publicId, 'uk'),
        `https://wishlist.chernenko.dev/ua/w/${publicId}`
    );
    assert.equal(
        buildShareUrl(
            'https://feat-branch-wishlist.chernenko.workers.dev',
            publicId,
            'en'
        ),
        `https://feat-branch-wishlist.chernenko.workers.dev/en/w/${publicId}`
    );
    assert.equal(
        buildShareUrl('http://localhost:8787', publicId),
        `http://localhost:8787/w/${publicId}`
    );
});

test('ukrainian uses the ua url segment while the language stays uk', () => {
    assert.equal(toLanguageSegment('uk'), 'ua');
    assert.equal(toLanguageSegment('en'), 'en');
    assert.equal(toLanguageSegment('pl'), 'pl');
    assert.equal(parseLanguageSegment('ua'), 'uk');
    assert.equal(parseLanguageSegment('en'), 'en');
    assert.equal(parseLanguageSegment('pl'), 'pl');
    assert.equal(parseLanguageSegment('uk'), null);
    assert.equal(parseLanguageSegment(undefined), null);
    assert.equal(buildSharePath(publicId, 'uk'), `/ua/w/${publicId}`);
    assert.equal(buildHomePath('uk'), '/ua');
    assert.equal(buildHomePath('pl'), '/pl');
    assert.equal(
        buildHomeUrl('https://wishlist.chernenko.dev', 'uk'),
        'https://wishlist.chernenko.dev/ua'
    );
    assert.equal(
        buildHomeUrl('https://wishlist.chernenko.dev'),
        'https://wishlist.chernenko.dev/'
    );
});

test('share page languages are exactly uk, en and pl', () => {
    assert.deepEqual([...SHARE_PAGE_LANGUAGES], ['uk', 'en', 'pl']);
    assert.equal(isSharePageLanguage('uk'), true);
    assert.equal(isSharePageLanguage('auto'), false);
    assert.equal(isSharePageLanguage(undefined), false);
});
