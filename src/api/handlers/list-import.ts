import type { ApiHandler } from '../context';
import { ApiError } from '../errors';

export const previewListImport: ApiHandler = () => {
    return Promise.reject(new ApiError('notImplemented'));
};

export const commitListImport: ApiHandler = () => {
    return Promise.reject(new ApiError('notImplemented'));
};

export const getListImport: ApiHandler = () => {
    return Promise.reject(new ApiError('notImplemented'));
};
