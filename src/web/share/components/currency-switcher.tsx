import { jsx } from 'hono/jsx';
import { Globe } from 'lucide';

import { getTranslator } from '../../../bot/i18n';
import type { Currency } from '../../../shared/money';
import { buildCurrencySwitchPath, WEB_CURRENCY_CHOICES } from '../../currency';
import type { SharePageLanguage } from '../public-id';
import type { WebCurrencyChoice } from '../view-model';

const CURRENCY_GLYPHS = {
    UAH: '₴',
    USD: '$',
    EUR: '€',
    PLN: 'zł'
} as const satisfies Record<Currency, string>;

const AutoIcon = () => {
    return (
        <svg
            class='currency-icon'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2'
            stroke-linecap='round'
            stroke-linejoin='round'
            aria-hidden='true'
            focusable='false'
        >
            {Globe.map(([tag, attrs]) => {
                return jsx(tag, { ...attrs });
            })}
        </svg>
    );
};

const OptionGlyph = ({ option }: { option: WebCurrencyChoice }) => {
    return option === 'auto' ? <AutoIcon /> : <>{CURRENCY_GLYPHS[option]}</>;
};

/** Zero-JS currency choice: each option is a link that sets the cookie and comes back to `back`. */
export const CurrencySwitcher = ({
    language,
    choice,
    back
}: {
    language: SharePageLanguage;
    choice: WebCurrencyChoice;
    back: string;
}) => {
    const LL = getTranslator(language);

    return (
        <nav class='currency-switch' aria-label={LL.web.currency.label()}>
            <ul>
                {WEB_CURRENCY_CHOICES.map(option => {
                    const label = LL.web.currency[option]();

                    return (
                        <li>
                            {option === choice ? (
                                <span
                                    aria-current='true'
                                    aria-label={label}
                                    title={label}
                                >
                                    <OptionGlyph option={option} />
                                </span>
                            ) : (
                                <a
                                    href={buildCurrencySwitchPath(option, back)}
                                    rel='nofollow'
                                    aria-label={label}
                                    title={label}
                                >
                                    <OptionGlyph option={option} />
                                </a>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};
