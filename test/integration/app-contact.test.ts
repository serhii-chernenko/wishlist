import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
    APP_PAGE_SIZE,
    type ApiErrorBody,
    type MeDto,
    type OwnerWishListDto,
    type SearchResultDto,
    type ShareDto,
    type SharedListDto
} from '../../src/shared/app-api';
import { createD1Harness, type D1Harness } from './d1-harness';
import {
    assertNoContactLeak,
    createContactFixtures,
    FIXTURE_ADDRESS,
    FIXTURE_PHONE_DIGITS,
    FIXTURE_PHONE_FORMATTED,
    OWNER,
    VIEWER
} from './contact-fixtures';

describe('Mini App contact and disclosure API', () => {
    let harness: D1Harness;
    const fixtures = createContactFixtures(() => harness);
    const { call, registerUser, registerOwnerWithContact, findUser } = fixtures;

    const readJson = async <T>(response: Response, status = 200) => {
        assert.equal(response.status, status);

        return (await response.json()) as T;
    };

    const readFieldErrors = async (response: Response) => {
        const body = await readJson<ApiErrorBody>(response, 422);

        assert.equal(body.error.code, 'validation');

        return body.error.fields;
    };

    const tokenFor = async () => {
        const result = await readJson<SearchResultDto>(
            await call(VIEWER, 'POST', '/search', {
                query: `@${OWNER.username}`
            })
        );

        assert.ok('owner' in result);
        assert.ok(result.owner.token);

        return result.owner.token;
    };

    before(async () => {
        harness = await createD1Harness();
        await harness.applyMigrations();
    });

    after(async () => {
        await harness.dispose();
    });

    beforeEach(async () => {
        fixtures.events.length = 0;
        await harness.clearApplicationTables();
    });

    describe('PUT /me/address', () => {
        it('saves a normalized address and returns it in me', async () => {
            await registerUser(OWNER);

            const me = await readJson<MeDto>(
                await call(OWNER, 'PUT', '/me/address', {
                    text: '  Nova Poshta 12 \n\n Kyiv  '
                })
            );

            assert.equal(me.deliveryAddress, 'Nova Poshta 12\nKyiv');
        });

        it('rejects short, long, multi-line and linked addresses', async () => {
            const owner = await registerUser(OWNER);

            const cases: Array<[string, string]> = [
                ['   ', 'tooShort'],
                ['ab.', 'tooShort'],
                ['x'.repeat(301), 'tooLong'],
                [
                    ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'].join('\n'),
                    'tooLong'
                ],
                ['Locker https://np.test/1', 'containsLink']
            ];

            for (const [text, code] of cases) {
                const fields = await readFieldErrors(
                    await call(OWNER, 'PUT', '/me/address', { text })
                );

                assert.deepEqual(fields, { text: code }, text);
            }

            assert.deepEqual(
                await readFieldErrors(
                    await call(OWNER, 'PUT', '/me/address', { text: 5 })
                ),
                { text: 'invalid' }
            );
            assert.equal((await findUser(owner.id)).deliveryAddress, null);
        });

        it('needs a registered user', async () => {
            const response = await call(OWNER, 'PUT', '/me/address', {
                text: 'Nova Poshta 12'
            });
            const body = await readJson<ApiErrorBody>(response, 403);

            assert.equal(body.error.code, 'registrationRequired');
        });
    });

    describe('DELETE /me/address', () => {
        it('removes the address and turns showing it off', async () => {
            const owner = await registerOwnerWithContact();
            const me = await readJson<MeDto>(
                await call(OWNER, 'DELETE', '/me/address')
            );

            assert.equal(me.deliveryAddress, null);
            assert.deepEqual(me.disclosure, {
                payments: true,
                phone: true,
                address: false
            });
            assert.equal((await findUser(owner.id)).showAddress, false);
        });
    });

    describe('PUT /me/disclosure', () => {
        it('needs a stored phone to show the phone', async () => {
            await registerUser(OWNER);

            assert.deepEqual(
                await readFieldErrors(
                    await call(OWNER, 'PUT', '/me/disclosure', { phone: true })
                ),
                { phone: 'phoneRequired' }
            );
        });

        it('needs an address and a visible phone to show the address', async () => {
            await registerOwnerWithContact({
                showPhone: false,
                showAddress: false
            });

            assert.deepEqual(
                await readFieldErrors(
                    await call(OWNER, 'PUT', '/me/disclosure', {
                        address: true
                    })
                ),
                { address: 'phoneRequired' }
            );

            await call(OWNER, 'DELETE', '/me/address');

            const me = await readJson<MeDto>(
                await call(OWNER, 'PUT', '/me/disclosure', { phone: true })
            );

            assert.equal(me.disclosure.phone, true);
            assert.deepEqual(
                await readFieldErrors(
                    await call(OWNER, 'PUT', '/me/disclosure', {
                        address: true
                    })
                ),
                { address: 'addressRequired' }
            );
        });

        it('turns both on together and both off with the phone', async () => {
            await registerOwnerWithContact({
                showPhone: false,
                showAddress: false
            });

            const both = await readJson<MeDto>(
                await call(OWNER, 'PUT', '/me/disclosure', {
                    phone: true,
                    address: true
                })
            );

            assert.deepEqual(both.disclosure, {
                payments: true,
                phone: true,
                address: true
            });

            const off = await readJson<MeDto>(
                await call(OWNER, 'PUT', '/me/disclosure', { phone: false })
            );

            assert.deepEqual(off.disclosure, {
                payments: true,
                phone: false,
                address: false
            });
        });

        it('toggles payments and reports closed labels only', async () => {
            await registerOwnerWithContact({
                showPhone: false,
                showAddress: false
            });

            const me = await readJson<MeDto>(
                await call(OWNER, 'PUT', '/me/disclosure', { payments: false })
            );

            assert.equal(me.disclosure.payments, false);
            await call(OWNER, 'PUT', '/me/disclosure', {
                phone: true,
                address: true
            });

            const changes = fixtures.events
                .filter(event => {
                    return event.action === 'contact_disclosure_changed';
                })
                .map(event => {
                    return [event.field, event.result];
                });

            assert.deepEqual(changes, [
                ['payments', 'off'],
                ['phone', 'on'],
                ['address', 'on']
            ]);
            assertNoContactLeak(
                JSON.stringify(fixtures.events),
                'disclosure telemetry'
            );
        });

        it('rejects an empty or malformed patch', async () => {
            await registerUser(OWNER);

            const empty = await call(OWNER, 'PUT', '/me/disclosure', {});
            const malformed = await call(OWNER, 'PUT', '/me/disclosure', {
                phone: 'yes'
            });

            assert.equal(empty.status, 422);
            assert.deepEqual(await readFieldErrors(malformed), {
                phone: 'invalid'
            });
        });
    });

    describe('owner contact in third-party lists', () => {
        it('gives the contact to a searching viewer on the first page only', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, APP_PAGE_SIZE + 2);
            await registerUser(VIEWER);

            const token = await tokenFor();
            const first = await readJson<OwnerWishListDto>(
                await call(VIEWER, 'GET', `/lists/${token}/wishes`)
            );
            const second = await readJson<OwnerWishListDto>(
                await call(
                    VIEWER,
                    'GET',
                    `/lists/${token}/wishes?offset=${APP_PAGE_SIZE}`
                )
            );

            assert.deepEqual(first.owner.contact, {
                phone: FIXTURE_PHONE_FORMATTED,
                phoneHref: `tel:+${FIXTURE_PHONE_DIGITS}`,
                address: FIXTURE_ADDRESS
            });
            assert.equal(second.owner.contact, null);
            assertNoContactLeak(JSON.stringify(second), 'second page');
        });

        it('gives the contact through the share link on the first page only', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, APP_PAGE_SIZE + 1);

            const publicId = await fixtures.publishShare(owner.id);

            await registerUser(VIEWER);

            const first = await readJson<SharedListDto>(
                await call(VIEWER, 'GET', `/shared/${publicId}`)
            );
            const more = await readJson<SharedListDto>(
                await call(
                    VIEWER,
                    'GET',
                    `/shared/${publicId}?offset=${APP_PAGE_SIZE}`
                )
            );

            assert.equal(first.owner.contact?.address, FIXTURE_ADDRESS);
            assert.equal(more.owner.contact, null);
        });

        it('hides the phone and address until they are shown, and payments when off', async () => {
            const owner = await registerOwnerWithContact({
                showPhone: false,
                showAddress: false
            });

            await fixtures.addWishes(owner.id, 1);
            await fixtures.run(
                harness.repositories.users.setDisclosure(
                    owner.id,
                    { showPayments: false },
                    new Date()
                )
            );
            await registerUser(VIEWER);

            const token = await tokenFor();
            const page = await readJson<OwnerWishListDto>(
                await call(VIEWER, 'GET', `/lists/${token}/wishes`)
            );

            assert.equal(page.owner.contact, null);
            assert.equal(page.owner.payments, null);
            assertNoContactLeak(JSON.stringify(page), 'hidden contact page');
        });

        it('never gives the owner their own contact', async () => {
            const owner = await registerOwnerWithContact();

            await fixtures.addWishes(owner.id, 1);

            const publicId = await fixtures.publishShare(owner.id);
            const self = await readJson<SharedListDto>(
                await call(OWNER, 'GET', `/shared/${publicId}`)
            );

            assert.equal(self.owner.contact, null);
            assertNoContactLeak(JSON.stringify(self), 'self view');
        });
    });

    describe('PUT /share/indexing', () => {
        it('turns indexing off and on for an active share', async () => {
            const owner = await registerUser(OWNER);

            await fixtures.addWishes(owner.id, 1);
            await fixtures.publishShare(owner.id);

            const off = await readJson<ShareDto>(
                await call(OWNER, 'PUT', '/share/indexing', {
                    allowIndexing: false
                })
            );

            assert.equal(off.allowIndexing, false);

            const on = await readJson<ShareDto>(
                await call(OWNER, 'PUT', '/share/indexing', {
                    allowIndexing: true
                })
            );

            assert.equal(on.allowIndexing, true);
            assert.deepEqual(
                fixtures.events
                    .filter(event => {
                        return (
                            event.action === 'wishlist_share_indexing_toggled'
                        );
                    })
                    .map(event => [event.channel, event.result]),
                [
                    ['app', 'off'],
                    ['app', 'on']
                ]
            );
        });

        it('answers notShared without an active share and validates the body', async () => {
            await registerUser(OWNER);

            const missing = await readJson<ApiErrorBody>(
                await call(OWNER, 'PUT', '/share/indexing', {
                    allowIndexing: false
                }),
                409
            );
            const invalid = await call(OWNER, 'PUT', '/share/indexing', {
                allowIndexing: 'no'
            });

            assert.equal(missing.error.code, 'notShared');
            assert.equal(invalid.status, 422);
        });
    });
});
