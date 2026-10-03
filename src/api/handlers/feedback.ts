import { FEEDBACK_MAX_LENGTH } from '../../bot/input/limits';
import { deliver } from '../../bot/services/feedback-service';
import { APP_API_TELEMETRY_PATH } from '../../worker/telemetry';
import {
    emitApiTelemetry,
    getTelegramApi,
    type ApiContext,
    type ApiHandler
} from '../context';
import { ApiError } from '../errors';
import { createBodyReader, readJsonBody } from '../validate';
import { emitAppAction } from './me';

const reportDeliveryFailure = (c: ApiContext, errorType: string) => {
    emitApiTelemetry(c, {
        event: 'feedback_delivery_failed',
        path: APP_API_TELEMETRY_PATH,
        outcome: 'error',
        errorType
    });
};

const deliverToAdmin = async (c: ApiContext, text: string) => {
    try {
        return await deliver(
            getTelegramApi(c),
            c.env.ADMIN_ID,
            c.var.actor,
            text,
            'app'
        );
    } catch (error) {
        return {
            status: 'notDelivered' as const,
            errorType: error instanceof Error ? error.name : typeof error
        };
    }
};

export const sendFeedback: ApiHandler = async c => {
    const reader = createBodyReader(await readJsonBody(c));
    const text = reader.requiredString('text', {
        maxLength: FEEDBACK_MAX_LENGTH
    });

    reader.finish();

    if (text === undefined) {
        throw new ApiError('validation');
    }

    const delivery = await deliverToAdmin(c, text);

    if (delivery.status === 'notDelivered') {
        reportDeliveryFailure(c, delivery.errorType);

        throw new ApiError('notDelivered');
    }

    emitAppAction(c, 'feedback_sent');

    return c.body(null, 204);
};
