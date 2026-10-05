import { jsx } from 'hono/jsx';
import { Moon, Sun, SunMoon } from 'lucide';

import { getTranslator } from '../../../bot/i18n';
import { buildThemeSwitchPath, WEB_THEMES, type WebTheme } from '../../theme';
import type { SharePageLanguage } from '../public-id';

type IconNode = readonly (readonly [
    tag: string,
    attrs: Readonly<Record<string, string | number | undefined>>
])[];

const THEME_ICONS = {
    system: SunMoon,
    light: Sun,
    dark: Moon
} as const satisfies Record<WebTheme, IconNode>;

const ThemeIcon = ({ icon }: { icon: IconNode }) => {
    return (
        <svg
            class='theme-icon'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2'
            stroke-linecap='round'
            stroke-linejoin='round'
            aria-hidden='true'
            focusable='false'
        >
            {icon.map(([tag, attrs]) => {
                return jsx(tag, { ...attrs });
            })}
        </svg>
    );
};

/** Zero-JS theme choice: each option is a link that sets the cookie and comes back to `back`. */
export const ThemeSwitcher = ({
    language,
    theme,
    back
}: {
    language: SharePageLanguage;
    theme: WebTheme;
    back: string;
}) => {
    const LL = getTranslator(language);

    return (
        <nav class='theme-switch' aria-label={LL.web.theme.label()}>
            <ul>
                {WEB_THEMES.map(option => {
                    const label = LL.web.theme[option]();

                    return (
                        <li>
                            {option === theme ? (
                                <span
                                    aria-current='true'
                                    aria-label={label}
                                    title={label}
                                >
                                    <ThemeIcon icon={THEME_ICONS[option]} />
                                </span>
                            ) : (
                                <a
                                    href={buildThemeSwitchPath(option, back)}
                                    rel='nofollow'
                                    aria-label={label}
                                    title={label}
                                >
                                    <ThemeIcon icon={THEME_ICONS[option]} />
                                </a>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
