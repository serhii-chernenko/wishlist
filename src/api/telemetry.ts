import {
    APP_API_TELEMETRY_PATH,
    type TelemetryAction,
    type TelemetryFields
} from '../worker/telemetry';
import { emitApiTelemetry, type ApiContext } from './context';

export const emitAppAction = (
    c: ApiContext,
    action: TelemetryAction,
    details: Pick<TelemetryFields, 'result' | 'field'> = {}
) => {
    emitApiTelemetry(c, {
        event: 'bot_action_completed',
        path: APP_API_TELEMETRY_PATH,
        outcome: 'success',
        channel: 'app',
        action,
        ...details
    });
};
