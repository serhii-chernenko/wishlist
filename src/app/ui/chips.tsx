import { haptics } from '../telegram/haptics';

export interface ChipOption<Value> {
    value: Value;
    label: string;
}

export const ChipGroup = <Value,>({
    label,
    options,
    value,
    onChange
}: {
    label: string;
    options: ReadonlyArray<ChipOption<Value>>;
    value: Value;
    onChange: (value: Value) => void;
}) => {
    return (
        <div class='chip-group' role='group' aria-label={label}>
            {options.map(option => {
                const selected = Object.is(option.value, value);

                return (
                    <button
                        key={String(option.value)}
                        type='button'
                        class='chip'
                        aria-pressed={String(selected)}
                        onClick={() => {
                            if (!selected) {
                                haptics.selection();
                                onChange(option.value);
                            }
                        }}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};
