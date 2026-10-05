export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type ColorScheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export const parseThemePreference = (value: unknown): ThemePreference => {
    return THEME_PREFERENCES.find(theme => theme === value) ?? 'system';
};

/** System follows the client's light or dark; an explicit choice ignores it. */
export const resolveColorScheme = (
    preference: ThemePreference,
    clientScheme: ColorScheme
): ColorScheme => {
    return preference === 'system' ? clientScheme : preference;
};

/** The Home quick toggle walks System → Light → Dark → System. */
export const nextThemePreference = (
    preference: ThemePreference
): ThemePreference => {
    const index = THEME_PREFERENCES.indexOf(preference);

    return (
        THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length] ?? 'system'
    );
};
