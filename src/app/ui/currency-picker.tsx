import {
    CURRENCIES,
    getCurrencySymbol,
    type Currency
} from '../../shared/money';
import type { AppLocale } from '../../shared/app-api';
import type { AppTranslator } from '../i18n/i18n';
import { Segmented, type SegmentedOption } from './segmented';

export const CurrencyPicker = ({
    LL,
    locale,
    value,
    onChange,
    disabled = false
}: {
    LL: AppTranslator;
    locale: AppLocale;
    value: Currency;
    onChange: (currency: Currency) => void;
    disabled?: boolean;
}) => {
    const options = CURRENCIES.map((currency): SegmentedOption<Currency> => {
        return {
            value: currency,
            label: getCurrencySymbol(locale, currency),
            ariaLabel: LL.currency.options[currency].title()
        };
    });

    return (
        <div class='currency-picker'>
            <Segmented
                name='price-currency'
                legend={LL.editor.currency.label()}
                options={options}
                value={value}
                onChange={onChange}
                disabled={disabled}
            />
        </div>
    );
};
