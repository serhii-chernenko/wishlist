import { haptics } from '../telegram/haptics';
import { Icon, type IconNode } from './icon';

export interface ChoiceOption<Value extends string> {
    value: Value;
    title: string;
    icon?: IconNode;
    glyph?: string;
    marker?: string;
    hint?: string;
    disabled?: boolean;
}

export interface ChoiceCardsProps<Value extends string> {
    name: string;
    legend: string;
    options: ReadonlyArray<ChoiceOption<Value>>;
    value: Value | null;
    onChange: (value: Value) => void;
    variant?: 'cards' | 'list';
    disabled?: boolean;
    describedBy?: string | undefined;
    groupDescribedBy?: string | undefined;
}

const joinIds = (ids: Array<string | null>) => {
    const present = ids.filter((id): id is string => id !== null);

    return present.length === 0 ? undefined : present.join(' ');
};

/** Radio rows in a fieldset: native radios keep arrow-key and screen reader behavior, the row is just the label; `list` joins the rows into one bordered group like the menus. */
export const ChoiceCards = <Value extends string>({
    name,
    legend,
    options,
    value,
    onChange,
    variant = 'cards',
    disabled = false,
    describedBy,
    groupDescribedBy
}: ChoiceCardsProps<Value>) => {
    return (
        <fieldset
            class={
                variant === 'list'
                    ? 'choice-group choice-group-list'
                    : 'choice-group'
            }
            disabled={disabled}
            aria-describedby={groupDescribedBy}
        >
            <legend class='sr-only'>{legend}</legend>
            {options.map(option => {
                const hintId = `${name}-${option.value}-hint`;
                const optionDisabled = option.disabled === true;

                return (
                    <label
                        key={option.value}
                        class={
                            optionDisabled
                                ? 'choice-card choice-card-disabled'
                                : 'choice-card'
                        }
                    >
                        {option.icon !== undefined ? (
                            <Icon icon={option.icon} class='row-icon' />
                        ) : option.glyph !== undefined ? (
                            <span class='row-icon row-glyph' aria-hidden='true'>
                                {option.glyph}
                            </span>
                        ) : option.marker !== undefined ? (
                            <span
                                class='row-icon row-marker'
                                data-level={option.marker}
                                aria-hidden='true'
                            />
                        ) : null}
                        <span class='choice-body'>
                            <span class='choice-title'>{option.title}</span>
                            {option.hint === undefined ? null : (
                                <span id={hintId} class='choice-hint'>
                                    {option.hint}
                                </span>
                            )}
                        </span>
                        <input
                            type='radio'
                            class='radio radio-neutral choice-radio'
                            name={name}
                            value={option.value}
                            checked={value === option.value}
                            disabled={optionDisabled}
                            aria-describedby={joinIds([
                                option.hint === undefined ? null : hintId,
                                optionDisabled ? (describedBy ?? null) : null
                            ])}
                            onChange={() => {
                                haptics.selection();
                                onChange(option.value);
                            }}
                        />
                    </label>
                );
            })}
        </fieldset>
    );
};
