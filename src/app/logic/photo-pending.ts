import {
    APP_PHOTO_PENDING_POLL_INTERVAL_MS,
    APP_PHOTO_PENDING_POLL_TIMEOUT_MS
} from '../../shared/app-api';

export interface PhotoPendingWish {
    photoPending?: boolean;
}

export const hasPendingPhotos = (wishes: readonly PhotoPendingWish[]) => {
    return wishes.some(wish => {
        return wish.photoPending === true;
    });
};

/** The delay before the next refresh while photos load, or null once the polling period is over. */
export const nextPhotoPollDelay = (elapsedMs: number) => {
    return elapsedMs + APP_PHOTO_PENDING_POLL_INTERVAL_MS <=
        APP_PHOTO_PENDING_POLL_TIMEOUT_MS
        ? APP_PHOTO_PENDING_POLL_INTERVAL_MS
        : null;
};
