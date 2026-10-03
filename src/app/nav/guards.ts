import { useEffect } from 'hono/jsx/dom';

import { useEntryKey, useNav } from '../state/context';
import {
    useClosingConfirmation,
    useVerticalSwipesLock
} from '../telegram/lifecycle';

/** Marks the current screen dirty: Back asks to discard and Telegram asks before closing the app. */
export const useDirtyGuard = (dirty: boolean) => {
    const nav = useNav();
    const entryKey = useEntryKey();

    useEffect(() => {
        nav.setDirty(entryKey, dirty);
    }, [dirty]);

    useEffect(() => {
        return () => {
            nav.setDirty(entryKey, false);
        };
    }, []);

    useClosingConfirmation(dirty);
};

/** Stops Telegram's swipe-to-minimize while an editor with scrollable fields is open. */
export const useEditorMode = () => {
    useVerticalSwipesLock(true);
};
