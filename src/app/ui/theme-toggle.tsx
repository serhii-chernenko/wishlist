import { Monitor, Moon, Sun } from 'lucide';

import {
    nextThemePreference,
    type ThemePreference
} from '../logic/theme-preference';
import { useLL } from '../state/context';
import { useStore } from '../state/store';
import { haptics } from '../telegram/haptics';
import { setThemePreference, themePreference } from '../telegram/theme';
import { Icon, type IconNode } from './icon';

export const THEME_ICONS = {
    system: Monitor,
    light: Sun,
    dark: Moon
} as const satisfies Record<ThemePreference, IconNode>;

/** One round button that walks System → Light → Dark; its label names the current choice. */
export const ThemeQuickToggle = () => {
    const LL = useLL();
    const preference = useStore(themePreference);
    const label = LL.home.themeToggle({
        current: LL.settings.theme[preference]()
    });

    return (
        <button
            type='button'
            class='hero-theme'
            aria-label={label}
            title={label}
            onClick={() => {
                haptics.selection();
                setThemePreference(nextThemePreference(preference));
            }}
        >
            <Icon icon={THEME_ICONS[preference]} />
        </button>
    );
};
