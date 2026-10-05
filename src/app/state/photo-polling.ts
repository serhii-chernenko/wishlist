import { useEffect } from 'hono/jsx/dom';

import { nextPhotoPollDelay } from '../logic/photo-pending';
import { useLatest } from './store';

/** Calls `refresh` every 10 seconds for two minutes after `pending` turns on, so imported photos show up without a manual reload. */
export const usePendingPhotoPolling = (
    pending: boolean,
    refresh: () => void
) => {
    const refreshRef = useLatest(refresh);

    useEffect(() => {
        if (!pending) {
            return;
        }

        const startedAt = Date.now();
        let timer: ReturnType<typeof setTimeout> | undefined;

        const schedule = () => {
            const delay = nextPhotoPollDelay(Date.now() - startedAt);

            if (delay === null) {
                return;
            }

            timer = setTimeout(() => {
                refreshRef.current();
                schedule();
            }, delay);
        };

        schedule();

        return () => {
            clearTimeout(timer);
        };
    }, [pending]);
};
