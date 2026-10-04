import type { ApiHandler } from '../context';
import { ApiError } from '../errors';

export const setCurrency: ApiHandler = () => {
    throw new ApiError('notImplemented');
};
