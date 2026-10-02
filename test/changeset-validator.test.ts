import assert from 'node:assert/strict';
import test from 'node:test';

import { validateChangesetBody } from '../scripts/releases/changeset-validator';

const validate = (body: string) => {
    return () => validateChangesetBody('sample.md', body);
};

const translated = (heading: string) => {
    return `${heading}\n  - en: English\n  - pl: Polski`;
};

test('validator accepts bullets that carry every translation', () => {
    assert.doesNotThrow(
        validate(
            `${translated('- [added] Нова команда')}\n${translated('- [fixed] Фікс')}`
        )
    );
});

test('validator accepts translations in any order and any indentation', () => {
    assert.doesNotThrow(
        validate('- [added] Нова команда\n    - pl: Polski\n    - en: English')
    );
});

test('validator rejects bullets that miss a translation', () => {
    assert.throws(
        validate('- [added] Нова команда\n  - en: English'),
        /without a translation for: pl/
    );
    assert.throws(
        validate('- [added] Нова команда\n  - pl: Polski'),
        /without a translation for: en/
    );
    assert.throws(
        validate('- [added] Нова команда'),
        /without a translation for: en, pl/
    );
});

test('validator reports a missing translation on a bullet in the middle', () => {
    assert.throws(
        validate(
            `${translated('- [added] Перша')}\n- [fixed] Друга\n  - en: English\n${translated('- [notes] Третя')}`
        ),
        /without a translation for: pl/
    );
});

test('validator accepts multi-line legacy continuations', () => {
    assert.doesNotThrow(
        validate(
            `- [notes] Перший рядок\n\n  Другий рядок\n  https://example.com\n  - en: English\n  - pl: Polski`
        )
    );
});

test('validator rejects empty bodies and untagged bullets', () => {
    assert.throws(validate('  \n'), /at least one tagged bullet/);
    assert.throws(validate('- Без тегу'), /invalid line/);
    assert.throws(validate('- [bogus] text'), /invalid line/);
});

test('validator rejects malformed translation lines', () => {
    assert.throws(validate('- [added] Текст\n  - en:'), /without text/);
    assert.throws(validate('- [added] Текст\n  - pl:   '), /without text/);
    assert.throws(validate('  - en: Orphan'), /before any tagged bullet/);
    assert.throws(validate('  - pl: Orphan'), /before any tagged bullet/);
    assert.throws(validate('- [added] Текст\n- en: Top level'), /not nested/);
    assert.throws(validate('- [added] Текст\n- pl: Top level'), /not nested/);
    assert.throws(
        validate('- [added] Текст\n  - en: One\n  - en: Two\n  - pl: Polski'),
        /more than one en line/
    );
    assert.throws(
        validate('- [added] Текст\n  - en: English\n  - pl: A\n  - pl: B'),
        /more than one pl line/
    );
});

test('validator requires Ukrainian text on the bullet itself', () => {
    assert.throws(
        validate('- [added]\n  - en: Only English\n  - pl: Tylko polski'),
        /invalid line|only|before/i
    );
});
