import type { Child } from 'hono/jsx';

import { cutText } from '../../bot/input/limits';
import { countCharacters, isNearLimit } from '../logic/format';
import { useLL } from '../state/context';

type InputMode = 'text' | 'decimal' | 'numeric' | 'url' | 'tel' | 'search';

export interface FieldProps {
    id: string;
    label: string;
    value: string;
    onValue: (value: string) => void;
    hint?: string;
    error?: string | null;
    maxLength?: number;
    multiline?: boolean;
    rows?: number;
    type?: 'text' | 'url' | 'search';
    inputMode?: InputMode;
    placeholder?: string;
    suffix?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    showCounter?: boolean;
    after?: Child;
    onBlur?: () => void;
}

const joinIds = (ids: Array<string | null>) => {
    const present = ids.filter((id): id is string => id !== null);

    return present.length === 0 ? undefined : present.join(' ');
};

const Counter = ({
    id,
    count,
    max
}: {
    id: string;
    count: number;
    max: number;
}) => {
    const LL = useLL();
    const near = isNearLimit(count, max);
    const left = Math.max(0, max - count);

    return (
        <p
            id={id}
            class={near ? 'field-counter field-counter-near' : 'field-counter'}
        >
            <span aria-hidden='true'>{LL.common.counter({ count, max })}</span>
            <span class='sr-only' aria-live='polite'>
                {near
                    ? left === 0
                        ? LL.common.limitReached()
                        : LL.common.charactersLeft({ count: left })
                    : ''}
            </span>
        </p>
    );
};

/** A labelled text input or textarea: errors and hints are linked with aria-describedby and input past `maxLength` is cut by code points, the same way the server counts. */
export const Field = ({
    id,
    label,
    value,
    onValue,
    hint,
    error,
    maxLength,
    multiline = false,
    rows = 4,
    type = 'text',
    inputMode,
    placeholder,
    suffix,
    disabled = false,
    autoFocus = false,
    showCounter = maxLength !== undefined,
    after,
    onBlur
}: FieldProps) => {
    const hintId = hint === undefined ? null : `${id}-hint`;
    const errorId = error ? `${id}-error` : null;
    const counterId =
        showCounter && maxLength !== undefined ? `${id}-counter` : null;
    const describedBy = joinIds([errorId, hintId, counterId]);

    const handleInput = (event: Event) => {
        const target = event.currentTarget as
            | HTMLInputElement
            | HTMLTextAreaElement;
        const accepted =
            maxLength === undefined
                ? target.value
                : cutText(target.value, maxLength);

        if (accepted !== target.value) {
            target.value = accepted;
        }

        onValue(accepted);
    };

    const shared = {
        id,
        class: multiline ? 'textarea field-control' : 'input field-control',
        value,
        placeholder,
        disabled,
        autofocus: autoFocus,
        'aria-invalid': error ? 'true' : 'false',
        'aria-describedby': describedBy,
        onInput: handleInput,
        onBlur: () => {
            onBlur?.();
        }
    };

    return (
        <div class='field'>
            <label class='field-label' for={id}>
                {label}
            </label>
            {multiline ? (
                <textarea {...shared} rows={rows} />
            ) : (
                <div
                    class={
                        suffix === undefined
                            ? 'field-row'
                            : 'field-row field-row-suffix'
                    }
                >
                    <input
                        {...shared}
                        type={type}
                        inputmode={inputMode}
                        autocomplete='off'
                    />
                    {suffix === undefined ? null : (
                        <span class='field-suffix' aria-hidden='true'>
                            {suffix}
                        </span>
                    )}
                </div>
            )}
            {error ? (
                <p id={errorId ?? undefined} class='field-error'>
                    {error}
                </p>
            ) : null}
            {hint === undefined ? null : (
                <p id={hintId ?? undefined} class='field-hint'>
                    {hint}
                </p>
            )}
            {counterId !== null && maxLength !== undefined ? (
                <Counter
                    id={counterId}
                    count={countCharacters(value)}
                    max={maxLength}
                />
            ) : null}
            {after}
        </div>
    );
};
