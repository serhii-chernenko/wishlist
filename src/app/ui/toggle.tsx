import { haptics } from '../telegram/haptics';

export interface ToggleProps {
    label: string;
    pressed: boolean;
    onToggle: (next: boolean) => void;
    hint?: string;
    disabled?: boolean;
    compact?: boolean;
    id?: string;
}

/** A switch-looking button with aria-pressed (hono renders boolean aria values as presence, so they are stringified here). */
export const Toggle = ({
    label,
    pressed,
    onToggle,
    hint,
    disabled = false,
    compact = false,
    id
}: ToggleProps) => {
    const hintId =
        hint !== undefined && id !== undefined ? `${id}-hint` : undefined;

    return (
        <div class={compact ? 'toggle-row toggle-row-compact' : 'toggle-row'}>
            <button
                type='button'
                id={id}
                class='toggle-button'
                aria-pressed={String(pressed)}
                aria-describedby={hintId}
                disabled={disabled}
                onClick={() => {
                    haptics.selection();
                    onToggle(!pressed);
                }}
            >
                <span class='toggle-label'>{label}</span>
                <span class='toggle-switch' aria-hidden='true' />
            </button>
            {hint === undefined ? null : (
                <p id={hintId} class='field-hint'>
                    {hint}
                </p>
            )}
        </div>
    );
};
