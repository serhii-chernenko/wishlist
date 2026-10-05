import type { Child } from 'hono/jsx';
import { useLayoutEffect, useRef, useState } from 'hono/jsx/dom';

import { cutText } from '../../bot/input/limits';
import { computeAutoRows } from '../logic/autosize';
import { countCharacters, isNearLimit } from '../logic/format';
import { useLL } from '../state/context';
import { dismissKeyboardOnEnter } from '../telegram/keyboard';

type InputMode = 'text' | 'decimal' | 'numeric' | 'url' | 'tel' | 'search';

const CONTROL_CLASS = {
    input: {
        valid: 'input input-neutral field-control',
        invalid: 'input input-error field-control'
    },
    textarea: {
        valid: 'textarea textarea-neutral field-control',
        invalid: 'textarea textarea-error field-control'
    }
} as const;

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
    enterKeyHint?: 'search' | 'go' | 'done';
    placeholder?: string;
    suffix?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    showCounter?: boolean;
    required?: boolean;
    requiredMark?: string;
    optionalMark?: string;
    after?: Child;
    onBlur?: () => void;
}

const supportsFieldSizing =
    typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

const measureAutoRows = (element: HTMLTextAreaElement, minRows: number) => {
    const renderedRows = element.rows;

    element.rows = minRows;

    const computed = getComputedStyle(element);
    const contentHeight =
        element.scrollHeight -
        parseFloat(computed.paddingTop) -
        parseFloat(computed.paddingBottom);
    const rows = computeAutoRows({
        contentHeight,
        lineHeight: parseFloat(computed.lineHeight),
        minRows
    });

    element.rows = renderedRows;

    return rows;
};

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
    const stateClass =
        left === 0
            ? ' field-counter-near field-counter-limit'
            : near
              ? ' field-counter-near'
              : '';

    return (
        <p id={id} class={`field-counter${stateClass}`}>
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
    enterKeyHint = 'done',
    placeholder,
    suffix,
    disabled = false,
    autoFocus = false,
    showCounter = maxLength !== undefined,
    required = false,
    requiredMark,
    optionalMark,
    after,
    onBlur
}: FieldProps) => {
    const hintId = hint === undefined ? null : `${id}-hint`;
    const errorId = error ? `${id}-error` : null;
    const counterId =
        showCounter && maxLength !== undefined ? `${id}-counter` : null;
    const describedBy = joinIds([errorId, hintId, counterId]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [grownRows, setGrownRows] = useState(rows);

    useLayoutEffect(() => {
        const element = textareaRef.current;

        if (multiline && !supportsFieldSizing && element !== null) {
            setGrownRows(measureAutoRows(element, rows));
        }
    }, [value, multiline, rows]);

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
        class: CONTROL_CLASS[multiline ? 'textarea' : 'input'][
            error ? 'invalid' : 'valid'
        ],
        value,
        placeholder,
        disabled,
        autofocus: autoFocus,
        'aria-invalid': error ? 'true' : 'false',
        'aria-required': required ? 'true' : undefined,
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
                {required && requiredMark !== undefined ? (
                    <span
                        class='field-mark field-mark-required'
                        aria-hidden='true'
                    >
                        {requiredMark}
                    </span>
                ) : null}
                {!required && optionalMark !== undefined ? (
                    <span class='field-mark'>{optionalMark}</span>
                ) : null}
            </label>
            {multiline ? (
                <textarea
                    {...shared}
                    ref={textareaRef}
                    rows={supportsFieldSizing ? rows : grownRows}
                    data-autosize={supportsFieldSizing ? undefined : 'rows'}
                />
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
                        enterkeyhint={enterKeyHint}
                        onKeyDown={dismissKeyboardOnEnter}
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
