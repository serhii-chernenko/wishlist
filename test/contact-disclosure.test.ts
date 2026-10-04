import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeAddress, parseAddress } from '../src/bot/input/address';
import {
    canViewOwnerContact,
    listDisclosureChanges,
    planDisclosure,
    resolveOwnerContact,
    resolveVisibleContact,
    type ContactOwner
} from '../src/bot/services/contact-service';
import { buildPhoneHref, formatPhone } from '../src/shared/phone';

const OWNER: ContactOwner = {
    id: 1,
    phone: '+380501234567',
    showPhone: true,
    showAddress: true,
    deliveryAddress: 'Nova Poshta 12, Kyiv',
    blockedAt: null
};

const VIEWER = { id: 2, blockedAt: null };

const subject = (
    overrides: Partial<Parameters<typeof planDisclosure>[0]> = {}
) => {
    return {
        phone: '+380501234567',
        deliveryAddress: 'Nova Poshta 12',
        showPayments: true,
        showPhone: false,
        showAddress: false,
        ...overrides
    };
};

describe('phone formatting', () => {
    it('groups Ukrainian and Polish numbers the national way', () => {
        assert.equal(formatPhone('+380501234567'), '+380 50 123 45 67');
        assert.equal(formatPhone('380501234567'), '+380 50 123 45 67');
        assert.equal(formatPhone('+48123456789'), '+48 123 456 789');
    });

    it('groups other numbers by three digits after a plus', () => {
        assert.equal(formatPhone('14155552671'), '+141 555 526 71');
        assert.equal(formatPhone('+49 30 1234567'), '+493 012 345 67');
    });

    it('returns null without digits', () => {
        assert.equal(formatPhone(''), null);
        assert.equal(formatPhone('+ -'), null);
        assert.equal(buildPhoneHref('---'), null);
    });

    it('builds a tel href from the digits only', () => {
        assert.equal(buildPhoneHref('+380 50 123-45-67'), 'tel:+380501234567');
        assert.equal(buildPhoneHref('48123456789'), 'tel:+48123456789');
    });
});

describe('address validation', () => {
    it('trims every line and drops empty ones', () => {
        assert.equal(
            normalizeAddress('  Kyiv \n\n  Nova Poshta 12  \r\n'),
            'Kyiv\nNova Poshta 12'
        );
        assert.deepEqual(parseAddress('  Kyiv\n\nNova Poshta 12 '), {
            ok: true,
            value: 'Kyiv\nNova Poshta 12'
        });
    });

    it('needs at least five meaningful characters', () => {
        assert.deepEqual(parseAddress(' . - ,'), {
            ok: false,
            reason: 'tooShort'
        });
        assert.deepEqual(parseAddress(null), { ok: false, reason: 'tooShort' });
        assert.equal(parseAddress('Kyiv1').ok, true);
    });

    it('allows at most 300 code points', () => {
        assert.equal(parseAddress('🎁'.repeat(300)).ok, true);
        assert.deepEqual(parseAddress('🎁'.repeat(301)), {
            ok: false,
            reason: 'tooLong'
        });
    });

    it('allows at most six lines', () => {
        const lines = ['Line one', 'Two', 'Three', 'Four', 'Five', 'Six'];

        assert.equal(parseAddress(lines.join('\n')).ok, true);
        assert.deepEqual(parseAddress([...lines, 'Seven'].join('\n')), {
            ok: false,
            reason: 'tooManyLines'
        });
    });

    it('rejects links', () => {
        assert.deepEqual(parseAddress('Locker https://np.test/x'), {
            ok: false,
            reason: 'containsLink'
        });
        assert.deepEqual(parseAddress('HTTP://np.test locker'), {
            ok: false,
            reason: 'containsLink'
        });
    });
});

describe('visible contact', () => {
    it('serves the formatted phone, its tel href and the address', () => {
        assert.deepEqual(resolveVisibleContact(OWNER), {
            phone: '+380 50 123 45 67',
            phoneHref: 'tel:+380501234567',
            address: 'Nova Poshta 12, Kyiv'
        });
    });

    it('never serves the address without a visible phone', () => {
        assert.equal(
            resolveVisibleContact({ ...OWNER, showPhone: false }),
            null
        );
        assert.equal(resolveVisibleContact({ ...OWNER, phone: null }), null);
    });

    it('hides the address when it is off or missing', () => {
        assert.equal(
            resolveVisibleContact({ ...OWNER, showAddress: false })?.address,
            null
        );
        assert.equal(
            resolveVisibleContact({ ...OWNER, deliveryAddress: null })?.address,
            null
        );
    });

    it('goes only to a registered, non-blocked viewer who is not the owner', () => {
        assert.equal(canViewOwnerContact(VIEWER, OWNER), true);
        assert.equal(canViewOwnerContact(null, OWNER), false);
        assert.equal(
            canViewOwnerContact({ id: 2, blockedAt: new Date() }, OWNER),
            false
        );
        assert.equal(
            canViewOwnerContact({ id: 1, blockedAt: null }, OWNER),
            false
        );
        assert.equal(
            canViewOwnerContact(VIEWER, { ...OWNER, blockedAt: new Date() }),
            false
        );
    });

    it('comes only with the first page', () => {
        assert.notEqual(
            resolveOwnerContact({ owner: OWNER, viewer: VIEWER, offset: 0 }),
            null
        );
        assert.equal(
            resolveOwnerContact({ owner: OWNER, viewer: VIEWER, offset: 20 }),
            null
        );
        assert.equal(
            resolveOwnerContact({ owner: OWNER, viewer: null, offset: 0 }),
            null
        );
    });
});

describe('disclosure toggle rules', () => {
    it('needs a stored phone to show the phone', () => {
        assert.deepEqual(
            planDisclosure(subject({ phone: null }), { phone: true }),
            {
                ok: false,
                reason: 'phoneRequired',
                field: 'phone'
            }
        );
        assert.deepEqual(planDisclosure(subject(), { phone: true }), {
            ok: true,
            next: { payments: true, phone: true, address: false }
        });
    });

    it('needs a saved address and a visible phone to show the address', () => {
        assert.deepEqual(
            planDisclosure(
                subject({ deliveryAddress: null, showPhone: true }),
                {
                    address: true
                }
            ),
            { ok: false, reason: 'addressRequired', field: 'address' }
        );
        assert.deepEqual(planDisclosure(subject(), { address: true }), {
            ok: false,
            reason: 'phoneRequired',
            field: 'address'
        });
        assert.deepEqual(
            planDisclosure(subject({ phone: null }), { address: true }),
            { ok: false, reason: 'phoneRequired', field: 'address' }
        );
    });

    it('turns both on at once', () => {
        assert.deepEqual(
            planDisclosure(subject(), { phone: true, address: true }),
            { ok: true, next: { payments: true, phone: true, address: true } }
        );
    });

    it('turns the address off together with the phone', () => {
        const plan = planDisclosure(
            subject({ showPhone: true, showAddress: true }),
            { phone: false }
        );

        assert.deepEqual(plan, {
            ok: true,
            next: { payments: true, phone: false, address: false }
        });
        assert.deepEqual(
            planDisclosure(subject({ showPhone: true, showAddress: true }), {
                phone: false,
                address: true
            }),
            { ok: false, reason: 'phoneRequired', field: 'address' }
        );
    });

    it('toggles payments independently', () => {
        assert.deepEqual(planDisclosure(subject(), { payments: false }), {
            ok: true,
            next: { payments: false, phone: false, address: false }
        });
    });

    it('drops stale flags when the phone or the address is gone', () => {
        assert.deepEqual(
            planDisclosure(
                subject({ phone: null, showPhone: true, showAddress: true }),
                { payments: false }
            ),
            {
                ok: true,
                next: { payments: false, phone: false, address: false }
            }
        );
        assert.deepEqual(
            planDisclosure(
                subject({
                    deliveryAddress: null,
                    showPhone: true,
                    showAddress: true
                }),
                {}
            ),
            { ok: true, next: { payments: true, phone: true, address: false } }
        );
    });

    it('lists only the fields that change', () => {
        assert.deepEqual(
            listDisclosureChanges(
                { payments: true, phone: true, address: true },
                { payments: true, phone: false, address: false }
            ),
            [
                { field: 'phone', shown: false },
                { field: 'address', shown: false }
            ]
        );
    });
});
