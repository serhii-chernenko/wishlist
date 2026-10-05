import type { Message } from 'telegraf/types';

import type { PendingInput, SessionState } from './types';

export const getMediaGroupId = (message: Message) => {
    return 'media_group_id' in message ? message.media_group_id : undefined;
};

export const resolveLateAlbumInput = (
    session: SessionState,
    message: Message
): PendingInput | null => {
    const mediaGroupId = getMediaGroupId(message);

    if (
        session.album === undefined ||
        mediaGroupId === undefined ||
        session.album.mediaGroupId !== mediaGroupId
    ) {
        return null;
    }

    return { kind: 'wishField', wishId: session.album.wishId, field: 'images' };
};
