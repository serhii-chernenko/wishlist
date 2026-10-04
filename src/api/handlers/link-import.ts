import type { ApiHandler } from '../context';
import { ApiError } from '../errors';

export const importLink: ApiHandler = () => {
    return Promise.reject(new ApiError('notImplemented'));
};

export const importWishImage: ApiHandler = () => {
    return Promise.reject(new ApiError('notImplemented'));
};
