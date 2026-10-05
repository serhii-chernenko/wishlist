import type { Repositories, UserRecord } from '../../db/repositories';
import type { DisclosurePatch } from '../../db/repositories/user-repository';
import {
    CONTACT_DISCLOSURE_FIELDS,
    type ContactDisclosureDto,
    type ContactDisclosureField,
    type ContactDisclosureInput,
    type OwnerContactDto
} from '../../shared/app-api';
import { buildPhoneHref, formatPhone } from '../../shared/phone';
import { parseAddress, type AddressRejection } from '../input/address';
import { runRepository } from './run-repository';

export type ContactOwner = Pick<
    UserRecord,
    | 'id'
    | 'phone'
    | 'showPhone'
    | 'showAddress'
    | 'deliveryAddress'
    | 'blockedAt'
>;

export type ContactViewer = Pick<UserRecord, 'id' | 'blockedAt'>;

export type DisclosureRejection = 'phoneRequired' | 'addressRequired';

export interface DisclosureChange {
    field: ContactDisclosureField;
    shown: boolean;
}

export type DisclosurePlan =
    | { ok: true; next: ContactDisclosureDto }
    | {
          ok: false;
          reason: DisclosureRejection;
          field: ContactDisclosureField;
      };

export type DisclosureOutcome =
    | { ok: true; user: UserRecord; changes: DisclosureChange[] }
    | {
          ok: false;
          reason: DisclosureRejection;
          field: ContactDisclosureField;
      };

export type DeliveryAddressOutcome =
    | { ok: true; user: UserRecord }
    | { ok: false; reason: AddressRejection };

type DisclosureSubject = Pick<
    UserRecord,
    'phone' | 'deliveryAddress' | 'showPayments' | 'showPhone' | 'showAddress'
>;

const DISCLOSURE_COLUMNS = {
    payments: 'showPayments',
    phone: 'showPhone',
    address: 'showAddress'
} as const satisfies Record<ContactDisclosureField, keyof DisclosurePatch>;

export const getDisclosure = (
    user: Pick<UserRecord, 'showPayments' | 'showPhone' | 'showAddress'>
): ContactDisclosureDto => {
    return {
        payments: user.showPayments,
        phone: user.showPhone,
        address: user.showAddress
    };
};

/** The address is served only next to a visible phone, so a missing or hidden phone hides every contact detail. */
export const resolveVisibleContact = (
    owner: Pick<
        ContactOwner,
        'phone' | 'showPhone' | 'showAddress' | 'deliveryAddress'
    >
): OwnerContactDto | null => {
    if (!owner.showPhone || owner.phone === null) {
        return null;
    }

    const phone = formatPhone(owner.phone);

    if (phone === null) {
        return null;
    }

    return {
        phone,
        phoneHref: buildPhoneHref(owner.phone),
        address:
            owner.showAddress && owner.deliveryAddress
                ? owner.deliveryAddress
                : null
    };
};

export const canViewOwnerContact = (
    viewer: ContactViewer | null,
    owner: Pick<ContactOwner, 'id' | 'blockedAt'>
) => {
    return (
        viewer !== null &&
        viewer.blockedAt === null &&
        owner.blockedAt === null &&
        viewer.id !== owner.id
    );
};

/** Contact goes only to a registered, non-blocked viewer who is not the owner, and only with the first page of a list. */
export const resolveOwnerContact = (input: {
    owner: ContactOwner;
    viewer: ContactViewer | null;
    offset: number;
}): OwnerContactDto | null => {
    if (input.offset !== 0 || !canViewOwnerContact(input.viewer, input.owner)) {
        return null;
    }

    return resolveVisibleContact(input.owner);
};

export const planDisclosure = (
    user: DisclosureSubject,
    patch: ContactDisclosureInput
): DisclosurePlan => {
    const hasPhone = user.phone !== null;
    const hasAddress = Boolean(user.deliveryAddress);

    if (patch.phone === true && !hasPhone) {
        return { ok: false, reason: 'phoneRequired', field: 'phone' };
    }

    if (patch.address === true && !hasAddress) {
        return { ok: false, reason: 'addressRequired', field: 'address' };
    }

    const phone =
        hasPhone && (patch.phone ?? (patch.address === true || user.showPhone));

    if (patch.address === true && !phone) {
        return { ok: false, reason: 'phoneRequired', field: 'address' };
    }

    return {
        ok: true,
        next: {
            payments: patch.payments ?? user.showPayments,
            phone,
            address: phone && hasAddress && (patch.address ?? user.showAddress)
        }
    };
};

export const listDisclosureChanges = (
    current: ContactDisclosureDto,
    next: ContactDisclosureDto
): DisclosureChange[] => {
    return CONTACT_DISCLOSURE_FIELDS.filter(field => {
        return current[field] !== next[field];
    }).map(field => {
        return { field, shown: next[field] };
    });
};

const toDisclosurePatch = (
    changes: readonly DisclosureChange[]
): DisclosurePatch => {
    const patch: DisclosurePatch = {};

    for (const change of changes) {
        patch[DISCLOSURE_COLUMNS[change.field]] = change.shown;
    }

    return patch;
};

const requireUpdated = (user: UserRecord | null) => {
    if (user === null) {
        throw new Error('Failed to update the contact settings');
    }

    return user;
};

export const createContactService = (
    repositories: Pick<Repositories, 'users'>,
    clock: () => Date = () => new Date()
) => {
    return {
        async setDisclosure(
            user: UserRecord,
            patch: ContactDisclosureInput
        ): Promise<DisclosureOutcome> {
            const plan = planDisclosure(user, patch);

            if (!plan.ok) {
                return plan;
            }

            const changes = listDisclosureChanges(
                getDisclosure(user),
                plan.next
            );

            if (changes.length === 0) {
                return { ok: true, user, changes };
            }

            const updated = await runRepository(
                repositories.users.setDisclosure(
                    user.id,
                    toDisclosurePatch(changes),
                    clock()
                )
            );

            return { ok: true, user: requireUpdated(updated), changes };
        },
        async saveDeliveryAddress(
            user: UserRecord,
            text: string | null | undefined
        ): Promise<DeliveryAddressOutcome> {
            const parsed = parseAddress(text);

            if (!parsed.ok) {
                return parsed;
            }

            const updated = await runRepository(
                repositories.users.setDeliveryAddress(
                    user.id,
                    parsed.value,
                    clock()
                )
            );

            return { ok: true, user: requireUpdated(updated) };
        },
        async removeDeliveryAddress(user: UserRecord): Promise<UserRecord> {
            const cleared = requireUpdated(
                await runRepository(
                    repositories.users.setDeliveryAddress(
                        user.id,
                        null,
                        clock()
                    )
                )
            );

            if (!cleared.showAddress) {
                return cleared;
            }

            return requireUpdated(
                await runRepository(
                    repositories.users.setDisclosure(
                        user.id,
                        { showAddress: false },
                        clock()
                    )
                )
            );
        }
    };
};

export type ContactService = ReturnType<typeof createContactService>;
