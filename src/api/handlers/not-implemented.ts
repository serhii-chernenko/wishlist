import type { ApiHandler } from '../context';
import { notImplementedResponse } from '../errors';

export const notImplementedHandler: ApiHandler = async () => {
    return notImplementedResponse();
};
