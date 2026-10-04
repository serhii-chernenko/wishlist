import type { AddressRejection } from '../../bot/input/address';
import { createContactService } from '../../bot/services/contact-service';
import type { UserRecord } from '../../db/repositories';
import {
    CONTACT_DISCLOSURE_FIELDS,
    type ContactDisclosureInput,
    type FieldErrorCode
} from '../../shared/app-api';
import type { ApiContext, ApiHandler } from '../context';
import { requireUser } from '../context';
import { resolveRequestLocale, toMeDto } from '../dto';
import { ApiError } from '../errors';
import { emitAppAction } from '../telemetry';
import { createBodyReader, readJsonBody, validationError } from '../validate';

const ADDRESS_FIELD = 'text';

const ADDRESS_ERROR_CODES = {
    tooShort: 'tooShort',
    tooLong: 'tooLong',
    tooManyLines: 'tooLong',
    containsLink: 'containsLink'
} as const satisfies Record<AddressRejection, FieldErrorCode>;

const getContactService = (c: ApiContext) => {
    return createContactService(c.var.repos, c.var.deps.now);
};

const respondWithMe = (c: ApiContext, user: UserRecord) => {
    const { actor } = c.var;

    return c.json(
        toMeDto({
            actor,
            user,
            sessionLanguage: null,
            locale: resolveRequestLocale(actor, user, null)
        })
    );
};

const readAddressText = async (c: ApiContext) => {
    const body = await readJsonBody(c);
    const raw = body[ADDRESS_FIELD];

    if (typeof raw === 'string' && raw.trim().length === 0) {
        throw validationError(ADDRESS_FIELD, 'tooShort');
    }

    const reader = createBodyReader(body);
    const text = reader.requiredString(ADDRESS_FIELD, { trim: false });

    reader.finish();

    return text ?? '';
};

const readDisclosurePatch = async (
    c: ApiContext
): Promise<ContactDisclosureInput> => {
    const reader = createBodyReader(await readJsonBody(c));
    const patch: ContactDisclosureInput = {};

    for (const field of CONTACT_DISCLOSURE_FIELDS) {
        const value = reader.optionalBoolean(field);

        if (value !== undefined) {
            patch[field] = value;
        }
    }

    reader.finish();

    if (Object.keys(patch).length === 0) {
        throw new ApiError('validation');
    }

    return patch;
};

export const setDeliveryAddress: ApiHandler = async c => {
    const user = requireUser(c);
    const text = await readAddressText(c);
    const outcome = await getContactService(c).saveDeliveryAddress(user, text);

    if (!outcome.ok) {
        throw validationError(
            ADDRESS_FIELD,
            ADDRESS_ERROR_CODES[outcome.reason]
        );
    }

    emitAppAction(c, 'delivery_address_updated');

    return respondWithMe(c, outcome.user);
};

export const removeDeliveryAddress: ApiHandler = async c => {
    const user = requireUser(c);
    const updated = await getContactService(c).removeDeliveryAddress(user);

    emitAppAction(c, 'delivery_address_removed');

    return respondWithMe(c, updated);
};

export const setContactDisclosure: ApiHandler = async c => {
    const user = requireUser(c);
    const patch = await readDisclosurePatch(c);
    const outcome = await getContactService(c).setDisclosure(user, patch);

    if (!outcome.ok) {
        throw validationError(outcome.field, outcome.reason);
    }

    for (const change of outcome.changes) {
        emitAppAction(c, 'contact_disclosure_changed', {
            field: change.field,
            result: change.shown ? 'on' : 'off'
        });
    }

    return respondWithMe(c, outcome.user);
};
