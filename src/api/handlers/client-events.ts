import { CLIENT_EVENT_KINDS, CLIENT_SCREENS } from '../../shared/app-api';
import { appClientEvent } from '../../worker/telemetry';
import { emitApiTelemetry, type ApiHandler } from '../context';
import { ApiError } from '../errors';
import { createBodyReader, readJsonBody } from '../validate';

export const reportClientEvent: ApiHandler = async c => {
    const reader = createBodyReader(await readJsonBody(c));
    const kind = reader.requiredOneOf('kind', CLIENT_EVENT_KINDS);
    const screen = reader.requiredOneOf('screen', CLIENT_SCREENS);

    reader.finish();

    if (kind === undefined || screen === undefined) {
        throw new ApiError('validation');
    }

    emitApiTelemetry(c, appClientEvent({ kind, screen }));

    return c.body(null, 204);
};
