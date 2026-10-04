import type { ApiHandler } from '../context';
import { ApiError } from '../errors';

export const setDeliveryAddress: ApiHandler = () => {
    throw new ApiError('notImplemented');
};

export const removeDeliveryAddress: ApiHandler = () => {
    throw new ApiError('notImplemented');
};

export const setContactDisclosure: ApiHandler = () => {
    throw new ApiError('notImplemented');
};
