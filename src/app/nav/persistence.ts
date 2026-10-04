import {
    getLaunchIdentity,
    NAV_STORAGE_KEY,
    serializeNavSnapshot
} from '../logic/nav-persistence';
import type { NavState } from '../logic/nav';
import type { Store } from '../state/store';

export const readStoredNav = (): string | null => {
    try {
        return window.sessionStorage.getItem(NAV_STORAGE_KEY);
    } catch {
        return null;
    }
};

const writeStoredNav = (value: string) => {
    try {
        window.sessionStorage.setItem(NAV_STORAGE_KEY, value);
    } catch {
        return;
    }
};

/** Mirrors the navigation stack into sessionStorage so Telegram's "Reload page" reopens the same screen. */
export const persistNavigation = (state: Store<NavState>, initData: string) => {
    const launch = getLaunchIdentity(initData);

    if (launch === null) {
        return () => undefined;
    }

    const save = () => {
        writeStoredNav(
            serializeNavSnapshot(
                state.get().entries.map(entry => entry.route),
                launch
            )
        );
    };

    save();

    return state.subscribe(save);
};
