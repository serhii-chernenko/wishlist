import assert from 'node:assert/strict';
import test from 'node:test';

import { validateInitData } from '../src/api/auth/init-data';
import {
    computeInitDataHash,
    createInitDataFields,
    createNodeApiCrypto,
    encodeInitData,
    signInitData,
    TEST_BOT_TOKEN,
    type InitDataFields
} from './fixtures/app-auth';

const NOW_SECONDS = 1_790_000_000;
const DAY_SECONDS = 24 * 60 * 60;
const FUTURE_SKEW_SECONDS = 5 * 60;
const USER = {
    id: 279_058_397,
    first_name: 'Vladislav',
    last_name: 'Kibenko',
    username: 'vdkfrost',
    language_code: 'uk',
    is_premium: true,
    allows_write_to_pm: true
};

const validate = (raw: string, botToken = TEST_BOT_TOKEN) => {
    return validateInitData(raw, {
        botToken,
        nowSeconds: NOW_SECONDS,
        crypto: createNodeApiCrypto()
    });
};

const fieldsAt = (authDate: number, user: object = USER): InitDataFields => {
    return createInitDataFields({
        user: user as typeof USER,
        authDate
    });
};

const withHash = (fields: InitDataFields, hash: string) => {
    return encodeInitData({ ...fields, hash });
};

test('valid initData yields the Telegram user and metadata', async () => {
    const result = await validate(
        signInitData(
            createInitDataFields({
                user: USER,
                authDate: NOW_SECONDS - 10,
                extra: { start_param: 'w_42', chat_type: 'sender' }
            })
        )
    );

    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.deepEqual(result.data.user, USER);
    assert.equal(result.data.authDate, NOW_SECONDS - 10);
    assert.equal(result.data.startParam, 'w_42');
    assert.equal(result.data.chatType, 'sender');
    assert.equal(result.data.queryId, 'AAHdF6IQAAAAAN0XohDhrOrc');
});

test('tampering with user or auth_date breaks the HMAC', async () => {
    const fields = fieldsAt(NOW_SECONDS);
    const hash = computeInitDataHash(fields);

    assert.deepEqual(
        await validate(
            withHash(
                { ...fields, user: JSON.stringify({ ...USER, id: 1 }) },
                hash
            )
        ),
        { ok: false, reason: 'badHash' }
    );
    assert.deepEqual(
        await validate(
            withHash({ ...fields, auth_date: String(NOW_SECONDS + 1) }, hash)
        ),
        { ok: false, reason: 'badHash' }
    );
});

test('a missing, uppercase or non-hex hash is malformed', async () => {
    const fields = fieldsAt(NOW_SECONDS);
    const hash = computeInitDataHash(fields);

    assert.deepEqual(await validate(encodeInitData(fields)), {
        ok: false,
        reason: 'malformed'
    });
    assert.deepEqual(await validate(withHash(fields, hash.toUpperCase())), {
        ok: false,
        reason: 'malformed'
    });
    assert.deepEqual(
        await validate(withHash(fields, `${hash.slice(0, 63)}g`)),
        { ok: false, reason: 'malformed' }
    );
    assert.deepEqual(await validate(withHash(fields, hash.slice(0, 32))), {
        ok: false,
        reason: 'malformed'
    });
});

test('a duplicate key is malformed even when the hash would match', async () => {
    const raw = signInitData(fieldsAt(NOW_SECONDS));

    assert.deepEqual(await validate(`${raw}&auth_date=${NOW_SECONDS}`), {
        ok: false,
        reason: 'malformed'
    });
    assert.deepEqual(await validate(`${raw}&hash=${'0'.repeat(64)}`), {
        ok: false,
        reason: 'malformed'
    });
});

test('signature takes part in the check string', async () => {
    const fields = fieldsAt(NOW_SECONDS);
    const { signature: _signature, ...withoutSignature } = fields;

    assert.equal((await validate(signInitData(fields))).ok, true);
    assert.deepEqual(
        await validate(withHash(fields, computeInitDataHash(withoutSignature))),
        { ok: false, reason: 'badHash' }
    );
});

test('plus and percent-twenty encodings of spaces both validate', async () => {
    const fields = fieldsAt(NOW_SECONDS, {
        ...USER,
        first_name: 'Mary Ann',
        last_name: 'de la Cruz+Sons'
    });

    for (const encoding of ['plus', 'percent'] as const) {
        const raw = signInitData(fields, { encoding });
        const result = await validate(raw);

        assert.equal(
            raw.includes(encoding === 'plus' ? 'Mary+Ann' : 'Mary%20Ann'),
            true
        );
        assert.ok(result.ok, encoding);
        assert.equal(result.data.user.first_name, 'Mary Ann');
        assert.equal(result.data.user.last_name, 'de la Cruz+Sons');
    }
});

test('bad user JSON, a missing user and bot users are malformed', async () => {
    const base = fieldsAt(NOW_SECONDS);
    const { user: _user, ...withoutUser } = base;

    for (const fields of [
        { ...base, user: '{"id":' },
        { ...base, user: '[1,2]' },
        { ...base, user: JSON.stringify({ ...USER, is_bot: true }) },
        { ...base, user: JSON.stringify({ ...USER, username: 42 }) },
        withoutUser
    ]) {
        assert.deepEqual(await validate(signInitData(fields)), {
            ok: false,
            reason: 'malformed'
        });
    }
});

test('user.id must be a positive safe integer', async () => {
    for (const id of [1.5, '279058397', 2 ** 53, 0, -5, null]) {
        assert.deepEqual(
            await validate(
                signInitData(fieldsAt(NOW_SECONDS, { ...USER, id }))
            ),
            { ok: false, reason: 'malformed' },
            String(id)
        );
    }
});

test('initData older than 24 hours is stale', async () => {
    assert.equal(
        (await validate(signInitData(fieldsAt(NOW_SECONDS - DAY_SECONDS)))).ok,
        true
    );
    assert.deepEqual(
        await validate(signInitData(fieldsAt(NOW_SECONDS - DAY_SECONDS - 1))),
        { ok: false, reason: 'stale' }
    );
});

test('initData more than 5 minutes in the future is rejected', async () => {
    assert.equal(
        (
            await validate(
                signInitData(fieldsAt(NOW_SECONDS + FUTURE_SKEW_SECONDS))
            )
        ).ok,
        true
    );
    assert.deepEqual(
        await validate(
            signInitData(fieldsAt(NOW_SECONDS + FUTURE_SKEW_SECONDS + 1))
        ),
        { ok: false, reason: 'future' }
    );
});

test('initData signed with another token has a bad hash', async () => {
    const raw = signInitData(fieldsAt(NOW_SECONDS), {
        botToken: '654321:OTHER'
    });

    assert.deepEqual(await validate(raw), { ok: false, reason: 'badHash' });
    assert.equal((await validate(raw, '654321:OTHER')).ok, true);
});

test('an empty string is missing', async () => {
    assert.deepEqual(await validate(''), { ok: false, reason: 'missing' });
});

test('a non-numeric auth_date is malformed', async () => {
    assert.deepEqual(
        await validate(
            signInitData({ ...fieldsAt(NOW_SECONDS), auth_date: 'yesterday' })
        ),
        { ok: false, reason: 'malformed' }
    );
});

test('the hash comparison goes through timingSafeEqual', async () => {
    const crypto = createNodeApiCrypto();
    const options = {
        botToken: TEST_BOT_TOKEN,
        nowSeconds: NOW_SECONDS,
        crypto
    };

    await validateInitData(signInitData(fieldsAt(NOW_SECONDS)), options);
    assert.equal(crypto.timingSafeEqualCalls, 1);

    await validateInitData(
        withHash(fieldsAt(NOW_SECONDS), '0'.repeat(64)),
        options
    );
    assert.equal(crypto.timingSafeEqualCalls, 2);
});
