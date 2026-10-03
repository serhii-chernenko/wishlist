import {
    CLIENT_EVENT_FIELDS,
    CLIENT_EVENT_KINDS,
    CLIENT_SCREENS,
    FIELD_ERROR_CODES
} from '../../shared/app-api';
import { appClientEvent } from '../../worker/telemetry';
import { emitApiTelemetry, type ApiHandler } from '../context';
import { ApiError } from '../errors';
import { createBodyReader, readJsonBody } from '../validate';

export const reportClientEvent: ApiHandler = async c => {
    const reader = createBodyReader(await readJsonBody(c));
    const kind = reader.requiredOneOf('kind', CLIENT_EVENT_KINDS);
    const screen = reader.requiredOneOf('screen', CLIENT_SCREENS);
    const field = reader.optionalOneOf('field', CLIENT_EVENT_FIELDS);
    const code = reader.optionalOneOf('code', FIELD_ERROR_CODES);

    reader.finish();

    if (kind === undefined || screen === undefined) {
        throw new ApiError('validation');
    }

    emitApiTelemetry(
        c,
        appClientEvent({
            kind,
            screen,
            ...(field === undefined ? {} : { field }),
            ...(code === undefined ? {} : { code })
        })
    );

    return c.body(null, 204);
};
