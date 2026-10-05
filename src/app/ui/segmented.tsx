import { haptics } from '../telegram/haptics';

export interface SegmentedOption<Value extends string> {
    value: Value;
    label: string;
    ariaLabel?: string;
}

export interface SegmentedProps<Value extends string> {
    name: string;
    legend: string;
    options: ReadonlyArray<SegmentedOption<Value>>;
    value: Value;
    onChange: (value: Value) => void;
    disabled?: boolean;
    describedBy?: string | undefined;
}

/** A compact single-choice control: native radios in a fieldset keep arrow-key and screen reader behavior, each segment is a label at least one tap target in size. */
export const Segmented = <Value extends string>({
    name,
    legend,
    options,
    value,
    onChange,
    disabled = false,
    describedBy
}: SegmentedProps<Value>) => {
    return (
        <fieldset
            class='segmented'
            disabled={disabled}
            aria-describedby={describedBy}
        >
            <legend class='sr-only'>{legend}</legend>
            {options.map(option => {
                return (
                    <label key={option.value} class='segmented-option'>
                        <input
                            type='radio'
                            class='segmented-input'
                            name={name}
                            value={option.value}
                            checked={value === option.value}
                            aria-label={option.ariaLabel}
                            onChange={() => {
                                haptics.selection();
                                onChange(option.value);
                            }}
                        />
                        <span class='segmented-label'>{option.label}</span>
                    </label>
                );
            })}
        </fieldset>
    );
};
